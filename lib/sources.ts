// lib/sources.ts
// Replacement data sources after retiring The Block (decision: full retirement,
// confirmed). Every fetcher is defensive: returns null / null fields on any
// failure, never throws, so a bad response degrades gracefully.
//
//   stablecoins  -> DefiLlama   (free, no key)            verified shape
//   rwa (TVL)    -> DefiLlama   (free, no key)             verified shape, current-only
//   strategy     -> CoinGecko   (treasury endpoint)        verified shape
//   options OI   -> Deribit     (public, no key)           Deribit-only, labelled as such
//   etf AUM      -> SoSoValue   (true net assets)          endpoint path UNCONFIRMED, see note

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const SOSO_KEY = process.env.SOSOVALUE_API_KEY; // add to Vercel env once endpoint confirmed
const BASE_DERIBIT = 'https://www.deribit.com/api/v2/public';

export type Point = { t: number; v: number };
export type SummedSeries = {
  latest: number | null;
  sevenDaysAgo: number | null;
  thirtyDaysAgo: number | null;
  history: Point[];
};

function valueDaysAgo(history: Point[], days: number): number | null {
  if (!history.length) return null;
  const cutoff = history[history.length - 1].t - days * 86400;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].t <= cutoff) return history[i].v;
  }
  return history[0].v;
}

// ---------- Stablecoins: DefiLlama ----------
// GET https://stablecoins.llama.fi/stablecoincharts/all
// -> [{ date: "<unix string>", totalCirculatingUSD: { peggedUSD: n, peggedEUR: n, ... } }, ...]
export async function getStablecoins(): Promise<SummedSeries | null> {
  try {
    const res = await fetch('https://stablecoins.llama.fi/stablecoincharts/all', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const sumPeg = (obj: any): number =>
      obj && typeof obj === 'object'
        ? Object.values(obj).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0)
        : 0;
    const history: Point[] = rows
      .map(r => ({ t: Number(r.date), v: sumPeg(r.totalCirculatingUSD) }))
      .filter(p => Number.isFinite(p.t) && p.v > 0)
      .sort((a, b) => a.t - b.t);
    if (!history.length) return null;
    return {
      latest: history[history.length - 1].v,
      sevenDaysAgo: valueDaysAgo(history, 7),
      thirtyDaysAgo: valueDaysAgo(history, 30),
      history: history.slice(-90),
    };
  } catch { return null; }
}

// ---------- RWA TVL: DefiLlama ----------
// GET https://api.llama.fi/protocols -> [{ category, tvl, ... }]
// Current-only (no native daily history from this endpoint); sparkline empty
// until the cron starts snapshotting it forward day over day.
export async function getRwaTvl(): Promise<SummedSeries | null> {
  try {
    const res = await fetch('https://api.llama.fi/protocols', { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const protocols: any[] = await res.json();
    if (!Array.isArray(protocols)) return null;
    const total = protocols
      .filter(p => p?.category === 'RWA')
      .reduce((s, p) => s + (typeof p.tvl === 'number' ? p.tvl : 0), 0);
    if (!(total > 0)) return null;
    return { latest: total, sevenDaysAgo: null, thirtyDaysAgo: null, history: [] };
  } catch { return null; }
}

// ---------- Strategy (MSTR) holdings: CoinGecko treasury ----------
// GET /companies/public_treasury/bitcoin -> { companies: [{ name, total_holdings,
//   total_entry_value_usd, total_current_value_usd }, ...] }
// Avg price = entry value / holdings (CoinGecko's own basis; will differ from
// The Block's old $75,700 figure by design — we show this source's number).
export type StrategyData = {
  holdings: number | null;
  avgPrice: number | null;
  valueUsd: number | null;
  name: string | null;
};
export async function getStrategyHoldings(): Promise<StrategyData | null> {
  try {
    const url =
      `https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin` +
      (COINGECKO_KEY ? `?x_cg_demo_api_key=${COINGECKO_KEY}` : '');
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const json: any = await res.json();
    const companies: any[] = json?.companies || [];
    const co = companies.find(c => /strateg|microstrateg/i.test(String(c?.name || '')));
    if (!co) return null;
    const holdings = typeof co.total_holdings === 'number' ? co.total_holdings : null;
    const entry = typeof co.total_entry_value_usd === 'number' ? co.total_entry_value_usd : null;
    const cur = typeof co.total_current_value_usd === 'number' ? co.total_current_value_usd : null;
    return {
      holdings,
      avgPrice: holdings && entry ? entry / holdings : null,
      valueUsd: cur,
      name: String(co.name || 'Strategy'),
    };
  } catch { return null; }
}

// ---------- Options OI: Deribit (Deribit-only, labelled) ----------
async function deribit(method: string, params: Record<string, string>) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_DERIBIT}/${method}?${q}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Deribit ${method} ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}
async function optionsOiUsd(currency: 'BTC' | 'ETH'): Promise<number | null> {
  try {
    const [summary, idx] = await Promise.all([
      deribit('get_book_summary_by_currency', { currency, kind: 'option' }),
      deribit('get_index_price', { index_name: `${currency.toLowerCase()}_usd` }),
    ]);
    const spot: number = idx?.index_price ?? 0;
    if (!Array.isArray(summary) || !spot) return null;
    const oiCoins = summary.reduce(
      (s: number, x: any) => s + (typeof x.open_interest === 'number' ? x.open_interest : 0),
      0
    );
    return oiCoins > 0 ? oiCoins * spot : null;
  } catch { return null; }
}
export async function getOptionsOi(): Promise<{ btcUsd: number | null; ethUsd: number | null }> {
  const [btcUsd, ethUsd] = await Promise.all([optionsOiUsd('BTC'), optionsOiUsd('ETH')]);
  return { btcUsd, ethUsd };
}

// ---------- ETF AUM (true net assets): SoSoValue ----------
// Confirmed against sosovalue-1.gitbook.io/sosovalue-api-doc:
//   Base: https://openapi.sosovalue.com/openapi/v1   Header: x-soso-api-key
//   GET /etfs/summary-history?symbol=BTC&country_code=US&limit=40
//   -> { code, message, data: [{ date, total_net_inflow, total_value_traded, total_net_assets, cum_net_inflow }, ...] }
//   Sorted latest-first. total_net_assets is the true market-value AUM (USD).
//   BTC, ETH and SOL confirmed working. HYPE not published by SoSoValue.
const SOSO_BASE = 'https://openapi.sosovalue.com/openapi/v1';
const SOSO_KEY_CLEAN = (SOSO_KEY || '').trim();
async function sosoAum(symbol: 'BTC' | 'ETH' | 'SOL'): Promise<{ latest: number | null; thirtyDaysAgo: number | null }> {
  try {
    if (!SOSO_KEY_CLEAN) return { latest: null, thirtyDaysAgo: null };
    const res = await fetch(
      `${SOSO_BASE}/etfs/summary-history?symbol=${symbol}&country_code=US&limit=40`,
      {
        method: 'GET',
        headers: { 'x-soso-api-key': SOSO_KEY_CLEAN, Accept: 'application/json' },
        // Do NOT cache here: a transient failure (e.g. key not yet active right
        // after a deploy) must not get cached as null for the revalidate window.
        // /api/all already controls overall freshness.
        cache: 'no-store',
      }
    );
    if (!res.ok) return { latest: null, thirtyDaysAgo: null };
    const json: any = await res.json();
    // SoSoValue wraps every response as { code, message, data }. For time-series,
    // data is the array directly; for paginated, data.list. Tolerate all shapes.
    const rows: any[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.list)
          ? json.data.list
          : [];
    if (!rows.length) return { latest: null, thirtyDaysAgo: null };
    // Reverse-chronological: index 0 is latest. ~30 days ago is ~21 trading rows back.
    const na = (row: any): number | null => {
      const v = row?.total_net_assets;
      return typeof v === 'number' ? v : (v != null && !isNaN(Number(v)) ? Number(v) : null);
    };
    const latest = na(rows[0]);
    const prevRow = rows.length > 21 ? rows[21] : rows[rows.length - 1];
    return { latest, thirtyDaysAgo: na(prevRow) };
  } catch { return { latest: null, thirtyDaysAgo: null }; }
}
export async function getEtfAum(): Promise<{
  btc: { latest: number | null; thirtyDaysAgo: number | null };
  eth: { latest: number | null; thirtyDaysAgo: number | null };
  sol: { latest: number | null; thirtyDaysAgo: number | null };
}> {
  const [btc, eth, sol] = await Promise.all([sosoAum('BTC'), sosoAum('ETH'), sosoAum('SOL')]);
  return { btc, eth, sol };
}
