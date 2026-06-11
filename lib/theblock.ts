// lib/theblock.ts
// Data layer for The Block API: auth token management, chart retrieval,
// series parsing helpers, and news search.

const BASE = "https://www.theblock.pro/api-public";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// ---------- Types ----------

export type RawPoint = { Timestamp: number; Result: number };
export type SeriesMap = Record<string, RawPoint[]>;

export type ParsedChart = {
  slug: string;
  description: string;
  frequency: string;
  updatedAt: number | null;
  series: SeriesMap;
};

export type NewsArticle = {
  id: number;
  title: string;
  url: string;
  published: string;
  category: string;
  tokens: string[];
};

// ---------- Auth (token cached per serverless instance, 10 min TTL) ----------

type TokenCache = { token: string; fetchedAt: number } | null;
let dataTokenCache: TokenCache = null;
let newsTokenCache: TokenCache = null;
const TOKEN_TTL_MS = 10 * 60 * 1000;

async function authenticate(apiKey: string): Promise<string | null> {
  const email = (process.env.THEBLOCK_EMAIL ?? "").trim();
  if (!email || !apiKey) return null;
  try {
    const res = await fetch(`${BASE}/v1/users/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        Accept: "application/json",
      },
      body: JSON.stringify({ email, apiKey }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const token =
      json?.token ?? json?.data?.token ?? json?.data?.accessToken ?? null;
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

export async function getDataToken(): Promise<string | null> {
  const now = Date.now();
  if (dataTokenCache && now - dataTokenCache.fetchedAt < TOKEN_TTL_MS) {
    return dataTokenCache.token;
  }
  const key = (process.env.THEBLOCK_API_KEY_DATA ?? "").trim();
  const token = await authenticate(key);
  if (token) dataTokenCache = { token, fetchedAt: now };
  return token;
}

export async function getNewsToken(): Promise<string | null> {
  const now = Date.now();
  if (newsTokenCache && now - newsTokenCache.fetchedAt < TOKEN_TTL_MS) {
    return newsTokenCache.token;
  }
  const key = (process.env.THEBLOCK_API_KEY_NEWS ?? "").trim();
  const token = await authenticate(key);
  if (token) newsTokenCache = { token, fetchedAt: now };
  return token;
}

// ---------- Chart retrieval ----------

export async function fetchChart(slug: string): Promise<ParsedChart | null> {
  const token = await getDataToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `${BASE}/v1/charts/?slug=${encodeURIComponent(slug)}`,
      {
        headers: {
          "x-auth-token": token,
          "User-Agent": UA,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const cd = json?.data?.chartData;
    if (!cd) return null;

    // Series arrives as a stringified JSON object keyed by series name.
    let rawSeries: unknown = cd.Series;
    if (typeof rawSeries === "string") {
      try {
        rawSeries = JSON.parse(rawSeries);
      } catch {
        return null;
      }
    }
    if (!rawSeries || typeof rawSeries !== "object") return null;

    const series: SeriesMap = {};
    for (const [name, val] of Object.entries(
      rawSeries as Record<string, { Data?: RawPoint[] }>
    )) {
      const pts = Array.isArray(val?.Data) ? val.Data : [];
      series[name] = pts
        .filter(
          (p) =>
            typeof p?.Timestamp === "number" && typeof p?.Result === "number"
        )
        .sort((a, b) => a.Timestamp - b.Timestamp);
    }

    return {
      slug,
      description: String(cd.Description ?? slug),
      frequency: String(cd.Frequency ?? ""),
      updatedAt: cd.UpdatedAt ? Number(cd.UpdatedAt) : null,
      series,
    };
  } catch {
    return null;
  }
}

// Fetch several charts with limited concurrency to be polite on rate limits.
export async function fetchCharts(
  slugs: string[],
  batchSize = 4
): Promise<Record<string, ParsedChart | null>> {
  const out: Record<string, ParsedChart | null> = {};
  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((s) => fetchChart(s)));
    results.forEach((r, idx) => {
      out[batch[idx]] = r.status === "fulfilled" ? r.value : null;
    });
  }
  return out;
}

// ---------- Series helpers ----------

export function latest(points: RawPoint[]): RawPoint | null {
  return points.length ? points[points.length - 1] : null;
}

// Latest value at or before (now - days). Assumes points sorted ascending.
export function valueDaysAgo(points: RawPoint[], days: number): RawPoint | null {
  if (!points.length) return null;
  const cutoff = points[points.length - 1].Timestamp - days * 86400;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].Timestamp <= cutoff) return points[i];
  }
  return points[0];
}

// Sum all series per timestamp, returning sorted totals.
export function totalsByTimestamp(series: SeriesMap): RawPoint[] {
  const totals = new Map<number, number>();
  for (const pts of Object.values(series)) {
    for (const p of pts) {
      totals.set(p.Timestamp, (totals.get(p.Timestamp) ?? 0) + p.Result);
    }
  }
  return [...totals.entries()]
    .map(([Timestamp, Result]) => ({ Timestamp, Result }))
    .sort((a, b) => a.Timestamp - b.Timestamp);
}

// Most recent timestamp where the summed total is non-zero.
// Useful for ETF flows where the latest day(s) can be placeholder zeros.
export function lastNonZeroTotal(series: SeriesMap): RawPoint | null {
  const totals = totalsByTimestamp(series);
  for (let i = totals.length - 1; i >= 0; i--) {
    if (totals[i].Result !== 0) return totals[i];
  }
  return null;
}

// Trim a points array to the last n entries (for charts in the UI).
export function lastN(points: RawPoint[], n: number): RawPoint[] {
  return points.slice(-n);
}

// ---------- News ----------

export async function searchNews(opts?: {
  hours?: number;
  size?: number;
}): Promise<NewsArticle[]> {
  const token = await getNewsToken();
  if (!token) return [];
  const hours = opts?.hours ?? 24;
  const size = opts?.size ?? 20;

  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const range = `${fmt(start)},${fmt(end)}`;

  try {
    const res = await fetch(
      `${BASE}/v1/news/search?publishDateRange=${encodeURIComponent(
        range
      )}&size=${size}`,
      {
        headers: {
          "x-auth-token": token,
          "User-Agent": UA,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    const articles = json?.data?.articles;
    if (!Array.isArray(articles)) return [];
    return articles.map(
      (a: {
        id?: number;
        title?: string;
        url?: string;
        publishedFormatted?: string;
        primaryCategory?: { name?: string };
        relatedTokens?: { symbol?: string }[];
      }) => ({
        id: a.id ?? 0,
        title: a.title ?? "",
        url: a.url ?? "",
        published: a.publishedFormatted ?? "",
        category: a.primaryCategory?.name ?? "",
        tokens: (a.relatedTokens ?? [])
          .map((t) => t?.symbol ?? "")
          .filter(Boolean),
      })
    );
  } catch {
    return [];
  }
}
