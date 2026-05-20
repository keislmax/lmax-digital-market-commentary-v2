import { NextResponse } from 'next/server';

export const maxDuration = 60;

const BASE = 'https://api.coinalyze.net/v1';
const API_KEY = process.env.COINALYZE_API_KEY;

// Module-level cache — persists across requests on same Vercel instance
let symbolCache: { symbols: string[]; fetchedAt: number } | null = null;
let dataCache: { data: any; fetchedAt: number } | null = null;
const DATA_TTL = 60 * 60 * 1000; // 1 hour

function headers() {
  return { 'api_key': API_KEY || '' };
}

function nowSec() { return Math.floor(Date.now() / 1000); }
function ago(seconds: number) { return nowSec() - seconds; }

async function fetchCoinalyze(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return fetchCoinalyze(path); // retry once
  }
  if (!res.ok) throw new Error(`Coinalyze ${path} failed: ${res.status}`);
  return res.json();
}

async function getAllSymbols(): Promise<string[]> {
  if (symbolCache && Date.now() - symbolCache.fetchedAt < 24 * 60 * 60 * 1000) {
    return symbolCache.symbols;
  }
  const markets = await fetchCoinalyze('/future-markets');
  const symbols = (markets as any[]).map((m: any) => m.symbol);
  symbolCache = { symbols, fetchedAt: Date.now() };
  return symbols;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllChunked(
  endpoint: string,
  symbols: string[],
  extraParams = ''
): Promise<any[]> {
  const chunks = chunk(symbols, 200);
  const results: any[] = [];
  for (const c of chunks) {
    const data = await fetchCoinalyze(
      `/${endpoint}?symbols=${c.join(',')}&${extraParams}`
    );
    results.push(...(Array.isArray(data) ? data : []));
  }
  return results;
}

// Per-asset symbols for the individual coin sections
const ASSET_SYMBOLS: Record<string, string[]> = {
  BTC: ['BTCUSDT_PERP.A', 'BTCUSD_PERP.0', 'BTCUSDT_PERP.3', 'BTCUSD_PERP.3', 'BTCUSDT_PERP.2', 'BTCUSDT_PERP.4'],
  ETH: ['ETHUSDT_PERP.A', 'ETHUSD_PERP.0', 'ETHUSDT_PERP.3', 'ETHUSDT_PERP.2'],
  SOL: ['SOLUSDT_PERP.A', 'SOLUSDT_PERP.3', 'SOLUSDT_PERP.2'],
  XRP: ['XRPUSDT_PERP.A', 'XRPUSDT_PERP.3', 'XRPUSDT_PERP.2'],
};

export async function GET() {
  try {
    // Return cached data if fresh
    if (dataCache && Date.now() - dataCache.fetchedAt < DATA_TTL) {
      return NextResponse.json(dataCache.data);
    }

    const allSymbols = await getAllSymbols();
    const from24h = ago(86400);
    const to = nowSec();

    // Fetch aggregated totals across ALL symbols
    const [
      allOiCurrent,
      allLiqHistory,
      allOiHistory,
    ] = await Promise.all([
      fetchAllChunked('open-interest', allSymbols, 'convert_to_usd=true'),
      fetchAllChunked('liquidation-history', allSymbols, `interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`),
      fetchAllChunked('open-interest-history', allSymbols, `interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`),
    ]);

    // BTC-specific for funding rate and per-coin sections
    const btcSymStr = ASSET_SYMBOLS.BTC.join(',');
    const [fundingCurrent, fundingHistory, btcOhlcv] = await Promise.all([
      fetchCoinalyze(`/funding-rate?symbols=${btcSymStr}`),
      fetchCoinalyze(`/funding-rate-history?symbols=${btcSymStr}&interval=1hour&from=${from24h}&to=${to}`),
      fetchCoinalyze(`/ohlcv-history?symbols=${btcSymStr}&interval=1hour&from=${from24h}&to=${to}`),
    ]);

    // --- Aggregate: Total OI ---
    const totalOI = allOiCurrent.reduce((sum: number, s: any) => sum + (s.value || 0), 0);

    // --- Aggregate: OI history (sum by timestamp) ---
    const oiByTime: Record<number, number> = {};
    for (const sym of allOiHistory) {
      for (const point of sym.history || []) {
        oiByTime[point.t] = (oiByTime[point.t] || 0) + point.c;
      }
    }
    const oiChart = Object.entries(oiByTime)
      .map(([t, v]) => ({ t: Number(t), v }))
      .sort((a, b) => a.t - b.t);
    const oiChange24h = oiChart.length >= 2
      ? ((oiChart[oiChart.length - 1].v - oiChart[0].v) / oiChart[0].v) * 100
      : 0;

    // --- Aggregate: Total liquidations 24H ---
    const liqByTime: Record<number, { l: number; s: number }> = {};
    for (const sym of allLiqHistory) {
      for (const point of sym.history || []) {
        if (!liqByTime[point.t]) liqByTime[point.t] = { l: 0, s: 0 };
        liqByTime[point.t].l += point.l || 0;
        liqByTime[point.t].s += point.s || 0;
      }
    }
    const liqChart = Object.entries(liqByTime)
      .map(([t, v]) => ({ t: Number(t), ...v }))
      .sort((a, b) => a.t - b.t);
    const totalLiqs = liqChart.reduce((sum, p) => sum + p.l + p.s, 0);
    const totalLongLiqs = liqChart.reduce((sum, p) => sum + p.l, 0);
    const totalShortLiqs = liqChart.reduce((sum, p) => sum + p.s, 0);

    // --- Funding rate (BTC weighted avg) ---
    const avgFunding = (fundingCurrent as any[]).length
      ? (fundingCurrent as any[]).reduce((s: number, f: any) => s + (f.last_funding_rate || 0), 0) / (fundingCurrent as any[]).length
      : 0;

    const fundByTime: Record<number, number[]> = {};
    for (const sym of (fundingHistory as any[])) {
      for (const point of sym.history || []) {
        if (!fundByTime[point.t]) fundByTime[point.t] = [];
        fundByTime[point.t].push(point.o);
      }
    }
    const fundChart = Object.entries(fundByTime)
      .map(([t, vals]) => ({ t: Number(t), v: vals.reduce((a, b) => a + b, 0) / vals.length }))
      .sort((a, b) => a.t - b.t);

    // --- Volume (BTC USD) ---
    const volByTime: Record<number, number> = {};
    for (const sym of (btcOhlcv as any[])) {
      for (const point of sym.history || []) {
        volByTime[point.t] = (volByTime[point.t] || 0) + (point.v || 0) * (point.c || 0);
      }
    }
    const totalVolume = Object.values(volByTime).reduce((a, b) => a + b, 0);

    const result = {
      totalOI,
      oiChange24h,
      oiChart,
      totalLiqs,
      totalLongLiqs,
      totalShortLiqs,
      liqChart,
      avgFunding,
      fundChart,
      totalVolume,
      updatedAt: Date.now(),
    };

    dataCache = { data: result, fetchedAt: Date.now() };
    return NextResponse.json(result);

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
