// lib/theblock.ts
// Data layer for The Block API: auth, chart retrieval, parsing helpers,
// news search, and the consolidated dashboard payload builder.

const BASE = "https://www.theblock.pro/api-public";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export type RawPoint = { Timestamp: number; Result: number };
export type SeriesMap = Record<string, RawPoint[]>;
export type ParsedChart = { slug: string; description: string; frequency: string; updatedAt: number | null; series: SeriesMap };
export type NewsArticle = { id: number; title: string; url: string; published: string; category: string; tokens: string[] };

// ---------- Auth (cached per instance, 10 min TTL) ----------

type TokenCache = { token: string; fetchedAt: number } | null;
let dataTokenCache: TokenCache = null;
let newsTokenCache: TokenCache = null;
const TOKEN_TTL_MS = 10 * 60 * 1000;

async function authenticate(apiKey: string): Promise<{ token: string | null; error: string | null }> {
  const email = (process.env.THEBLOCK_EMAIL ?? "").trim();
  if (!email || !apiKey) return { token: null, error: "Missing email or API key env var" };
  try {
    const res = await fetch(`${BASE}/v1/users/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
      body: JSON.stringify({ email, apiKey }),
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) return { token: null, error: `Auth HTTP ${res.status}: ${raw.slice(0, 200)}` };
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const token = (json?.token ?? data?.token ?? data?.accessToken ?? null) as string | null;
    if (!token) return { token: null, error: `Auth OK but no token in response: ${raw.slice(0, 200)}` };
    return { token, error: null };
  } catch (e) {
    return { token: null, error: `Auth threw: ${String(e)}` };
  }
}

export async function getDataToken(): Promise<{ token: string | null; error: string | null }> {
  const now = Date.now();
  if (dataTokenCache && now - dataTokenCache.fetchedAt < TOKEN_TTL_MS) return { token: dataTokenCache.token, error: null };
  const result = await authenticate((process.env.THEBLOCK_API_KEY_DATA ?? "").trim());
  if (result.token) dataTokenCache = { token: result.token, fetchedAt: now };
  return result;
}

export async function getNewsToken(): Promise<{ token: string | null; error: string | null }> {
  const now = Date.now();
  if (newsTokenCache && now - newsTokenCache.fetchedAt < TOKEN_TTL_MS) return { token: newsTokenCache.token, error: null };
  const result = await authenticate((process.env.THEBLOCK_API_KEY_NEWS ?? "").trim());
  if (result.token) newsTokenCache = { token: result.token, fetchedAt: now };
  return result;
}

// ---------- Chart retrieval ----------

export async function fetchChart(slug: string): Promise<ParsedChart | null> {
  const { token } = await getDataToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/v1/charts/?slug=${encodeURIComponent(slug)}`, {
      headers: { "x-auth-token": token, "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const cd = json?.data?.chartData;
    if (!cd) return null;
    let rawSeries: unknown = cd.Series;
    if (typeof rawSeries === "string") {
      try { rawSeries = JSON.parse(rawSeries); } catch { return null; }
    }
    if (!rawSeries || typeof rawSeries !== "object") return null;
    const series: SeriesMap = {};
    for (const [name, val] of Object.entries(rawSeries as Record<string, { Data?: RawPoint[] }>)) {
      const pts = Array.isArray(val?.Data) ? val.Data : [];
      series[name] = pts
        .filter((p) => typeof p?.Timestamp === "number" && typeof p?.Result === "number")
        .sort((a, b) => a.Timestamp - b.Timestamp);
    }
    return {
      slug,
      description: String(cd.Description ?? slug),
      frequency: String(cd.Frequency ?? ""),
      updatedAt: cd.UpdatedAt ? Number(cd.UpdatedAt) : null,
      series,
    };
  } catch { return null; }
}

export async function fetchCharts(slugs: string[], batchSize = 4): Promise<Record<string, ParsedChart | null>> {
  const out: Record<string, ParsedChart | null> = {};
  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((s) => fetchChart(s)));
    results.forEach((r, idx) => { out[batch[idx]] = r.status === "fulfilled" ? r.value : null; });
  }
  return out;
}

// ---------- Series helpers ----------

export function latest(points: RawPoint[]): RawPoint | null {
  return points.length ? points[points.length - 1] : null;
}

export function valueDaysAgo(points: RawPoint[], days: number): RawPoint | null {
  if (!points.length) return null;
  const cutoff = points[points.length - 1].Timestamp - days * 86400;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].Timestamp <= cutoff) return points[i];
  }
  return points[0];
}

export function totalsByTimestamp(series: SeriesMap): RawPoint[] {
  const totals = new Map<number, number>();
  for (const pts of Object.values(series)) {
    for (const p of pts) totals.set(p.Timestamp, (totals.get(p.Timestamp) ?? 0) + p.Result);
  }
  return [...totals.entries()].map(([Timestamp, Result]) => ({ Timestamp, Result })).sort((a, b) => a.Timestamp - b.Timestamp);
}

export function lastNonZeroTotal(series: SeriesMap): RawPoint | null {
  const totals = totalsByTimestamp(series);
  for (let i = totals.length - 1; i >= 0; i--) {
    if (totals[i].Result !== 0) return totals[i];
  }
  return null;
}

export function lastN(points: RawPoint[], n: number): RawPoint[] {
  return points.slice(-n);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------- News ----------

export async function searchNews(opts?: { hours?: number; size?: number }): Promise<{ articles: NewsArticle[]; error: string | null }> {
  const { token, error: authError } = await getNewsToken();
  if (!token) return { articles: [], error: `News auth failed: ${authError}` };
  const hours = opts?.hours ?? 24;
  const size = opts?.size ?? 20;
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const range = `${fmt(start)},${fmt(end)}`;
  try {
    const res = await fetch(`${BASE}/v1/news/search?publishDateRange=${encodeURIComponent(range)}&size=${size}`, {
      headers: { "x-auth-token": token, "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    const raw = await res.text();
    if (!res.ok) return { articles: [], error: `News search HTTP ${res.status}: ${raw.slice(0, 200)}` };
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    const data = (json?.data ?? {}) as Record<string, unknown>;
    const articles = data?.articles;
    if (!Array.isArray(articles)) return { articles: [], error: `News response had no articles array: ${raw.slice(0, 200)}` };
    const mapped: NewsArticle[] = articles.map((a: Record<string, unknown>) => ({
      id: Number(a.id ?? 0),
      title: String(a.title ?? ""),
      url: String(a.url ?? ""),
      published: String(a.publishedFormatted ?? ""),
      category: String((a.primaryCategory as Record<string, unknown>)?.name ?? ""),
      tokens: (Array.isArray(a.relatedTokens) ? a.relatedTokens : []).map((t: Record<string, unknown>) => String(t?.symbol ?? "")).filter(Boolean),
    }));
    return { articles: mapped, error: mapped.length ? null : "News search returned 0 articles for the time window" };
  } catch (e) {
    return { articles: [], error: `News fetch threw: ${String(e)}` };
  }
}

// ---------- Dashboard payload builder ----------

const SLUGS = {
  oiBtc: "aggregated-open-interest-of-bitcoin-futures-daily",
  oiEth: "aggregated-open-interest-of-ethereum-futures-daily",
  fundingBtc: "btc-funding-rates",
  fundingEth: "eth-funding-rates",
  basisBtc: "btc-annualized-basis-binance",
  ivBtc: "btc-atm-implied-volatility",
  ivEth: "eth-atm-implied-volatility",
  realizedVolBtc: "annualized-btc-volatility-30d",
  optionsOiBtc: "aggregated-open-interest-of-bitcoin-options",
  optionsOiEth: "aggregated-open-interest-of-ethereum-options",
  etfFlowsBtc: "spot-bitcoin-etf-flows",
  etfFlowsEth: "spot-ethereum-etf-flows",
  etfFlowsHype: "hype-spot-etf-flows",
  etfAumBtc: "spot-bitcoin-etf-onchain-holdings-usd",
  etfAumEth: "spot-ethereum-etf-aum-daily",
  stablecoins: "total-stablecoin-supply-2",
  strategyHoldings: "microstrategy-bitcoin-holdings",
  rwaTvl: "total-value-locked-rwa-by-protocol",
  btcEthFuturesVolume: "btc-and-eth-futures-volume-7dma",
} as const;

function summedMetric(chart: ParsedChart | null, historyPoints = 90) {
  if (!chart) return null;
  const totals = totalsByTimestamp(chart.series);
  const last = totals.length ? totals[totals.length - 1] : null;
  return {
    description: chart.description,
    latest: last?.Result ?? null,
    latestTs: last?.Timestamp ?? null,
    sevenDaysAgo: valueDaysAgo(totals, 7)?.Result ?? null,
    thirtyDaysAgo: valueDaysAgo(totals, 30)?.Result ?? null,
    history: lastN(totals, historyPoints),
  };
}

function flowMetric(chart: ParsedChart | null, historyPoints = 30) {
  if (!chart) return null;
  const totals = totalsByTimestamp(chart.series);
  const lastFlow = lastNonZeroTotal(chart.series);
  const byProduct: Record<string, number | null> = {};
  if (lastFlow) {
    for (const [name, pts] of Object.entries(chart.series)) {
      const match = pts.find((p) => p.Timestamp === lastFlow.Timestamp);
      byProduct[name] = match ? match.Result : null;
    }
  }
  return {
    description: chart.description,
    latestFlow: lastFlow?.Result ?? null,
    latestFlowTs: lastFlow?.Timestamp ?? null,
    byProduct,
    history: lastN(totals, historyPoints),
  };
}

type SeriesStat = { latest: number | null; latestTs: number | null; sevenDaysAgo: number | null; thirtyDaysAgo: number | null; history: RawPoint[] };

function perSeriesMetric(chart: ParsedChart | null, historyPoints = 90) {
  if (!chart) return null;
  const out: Record<string, SeriesStat> = {};
  for (const [name, pts] of Object.entries(chart.series)) {
    const last = latest(pts);
    out[name] = {
      latest: last?.Result ?? null,
      latestTs: last?.Timestamp ?? null,
      sevenDaysAgo: valueDaysAgo(pts, 7)?.Result ?? null,
      thirtyDaysAgo: valueDaysAgo(pts, 30)?.Result ?? null,
      history: lastN(pts, historyPoints),
    };
  }
  return { description: chart.description, series: out };
}

// Funding headline: median of active exchanges only. A series counts as
// active if its latest datapoint is within 7 days of the freshest series
// (this automatically excludes dYdX V3, which stopped updating).
function fundingMetric(chart: ParsedChart | null) {
  const per = perSeriesMetric(chart, 90);
  if (!per) return null;
  const allTs = Object.values(per.series).map((s) => s.latestTs ?? 0);
  const maxTs = Math.max(...allTs, 0);
  const activeCutoff = maxTs - 7 * 86400;
  const activeLatest: number[] = [];
  const active7d: number[] = [];
  const perExchange: Record<string, number | null> = {};
  for (const [name, s] of Object.entries(per.series)) {
    const isActive = (s.latestTs ?? 0) >= activeCutoff;
    perExchange[name] = isActive ? s.latest : null;
    if (isActive && typeof s.latest === "number") activeLatest.push(s.latest);
    if (isActive && typeof s.sevenDaysAgo === "number") active7d.push(s.sevenDaysAgo);
  }
  return {
    description: per.description,
    headline: median(activeLatest),
    headline7dAgo: median(active7d),
    perExchange,
    latestTs: maxTs || null,
  };
}

export async function buildTheBlockData() {
  const slugList = Object.values(SLUGS);
  const [charts, news] = await Promise.all([
    fetchCharts(slugList),
    searchNews({ hours: 24, size: 20 }),
  ]);

  const errors: string[] = [];
  for (const slug of slugList) {
    if (!charts[slug]) errors.push(`Failed chart: ${slug}`);
  }
  if (news.error) errors.push(news.error);

  return {
    openInterest: {
      btc: summedMetric(charts[SLUGS.oiBtc]),
      eth: summedMetric(charts[SLUGS.oiEth]),
    },
    funding: {
      btc: fundingMetric(charts[SLUGS.fundingBtc]),
      eth: fundingMetric(charts[SLUGS.fundingEth]),
    },
    basis: {
      btc: perSeriesMetric(charts[SLUGS.basisBtc], 90),
    },
    options: {
      ivBtc: perSeriesMetric(charts[SLUGS.ivBtc], 90),
      ivEth: perSeriesMetric(charts[SLUGS.ivEth], 90),
      realizedVolBtc: perSeriesMetric(charts[SLUGS.realizedVolBtc], 90),
      oiBtc: summedMetric(charts[SLUGS.optionsOiBtc]),
      oiEth: summedMetric(charts[SLUGS.optionsOiEth]),
    },
    etf: {
      flowsBtc: flowMetric(charts[SLUGS.etfFlowsBtc]),
      flowsEth: flowMetric(charts[SLUGS.etfFlowsEth]),
      flowsHype: flowMetric(charts[SLUGS.etfFlowsHype]),
      aumBtc: summedMetric(charts[SLUGS.etfAumBtc]),
      aumEth: summedMetric(charts[SLUGS.etfAumEth]),
    },
    stablecoins: summedMetric(charts[SLUGS.stablecoins]),
    strategy: perSeriesMetric(charts[SLUGS.strategyHoldings], 90),
    rwa: summedMetric(charts[SLUGS.rwaTvl]),
    btcEthFuturesVolume: perSeriesMetric(charts[SLUGS.btcEthFuturesVolume], 90),
    news: news.articles,
    errors,
    updatedAt: Date.now(),
  };
}
