import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const maxDuration = 60;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const BASE = 'https://api.coinalyze.net/v1';
const API_KEY = process.env.COINALYZE_API_KEY;

function headers() { return { 'api_key': API_KEY || '' }; }
function nowSec() { return Math.floor(Date.now() / 1000); }
function ago(s: number) { return nowSec() - s; }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchCoinalyze(path: string, retries = 2): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (res.status === 429 && retries > 0) {
    const wait = parseInt(res.headers.get('Retry-After') || '5', 10) * 1000;
    await sleep(wait);
    return fetchCoinalyze(path, retries - 1);
  }
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Fetch in batches of 10 parallel calls at a time, with pause between batches
async function fetchAllChunked(endpoint: string, symbols: string[], extraParams = ''): Promise<any[]> {
  const chunks = chunk(symbols, 200);
  const batchSize = 10; // 10 parallel at a time, well under rate limit
  const allResults: any[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(c =>
        fetchCoinalyze(`/${endpoint}?symbols=${c.join(',')}&${extraParams}`)
          .then(d => Array.isArray(d) ? d : [])
          .catch(() => [])
      )
    );
    allResults.push(...results.flat());
    if (i + batchSize < chunks.length) await sleep(1500); // pause between batches
  }

  return allResults;
}

const FUNDING_SYMBOLS = [
  'BTCUSDT_PERP.A','BTCUSD_PERP.0','BTCUSDT_PERP.3','BTCUSDT_PERP.2',
  'ETHUSDT_PERP.A','ETHUSD_PERP.0','ETHUSDT_PERP.3','ETHUSDT_PERP.2',
  'SOLUSDT_PERP.A','SOLUSDT_PERP.3','SOLUSDT_PERP.2',
  'XRPUSDT_PERP.A','XRPUSDT_PERP.3','XRPUSDT_PERP.2',
].join(',');

export async function GET() {
  try {
    const from24h = ago(86400);
    const to = nowSec();

    const markets = await fetchCoinalyze('/future-markets');
    const allSymbols = (markets as any[])
  .filter((m: any) => m.is_perpetual === true)
  .map((m: any) => m.symbol);

    // Fetch one metric at a time to stay within rate limits
    const allOiCurrent = await fetchAllChunked('open-interest', allSymbols, 'convert_to_usd=true');
    const allLiqHistory = await fetchAllChunked('liquidation-history', allSymbols, `interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`);
    const allOiHistory = await fetchAllChunked('open-interest-history', allSymbols, `interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`);
    const allVolHistory = await fetchAllChunked('ohlcv-history', allSymbols, `interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`);

    const [fundingCurrent, fundingHistory] = await Promise.all([
      fetchCoinalyze(`/funding-rate?symbols=${FUNDING_SYMBOLS}`),
      fetchCoinalyze(`/funding-rate-history?symbols=${FUNDING_SYMBOLS}&interval=1hour&from=${from24h}&to=${to}`),
    ]);

    // Aggregate OI
    const totalOI = allOiCurrent.reduce((sum: number, s: any) => sum + (s.value || 0), 0);
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

    // Aggregate liquidations
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

    // Aggregate volume
    const volByTime: Record<number, number> = {};
    for (const sym of allVolHistory) {
      for (const point of sym.history || []) {
        volByTime[point.t] = (volByTime[point.t] || 0) + (point.v || 0) * (point.c || 0);
      }
    }
    const totalVolume = Object.values(volByTime).reduce((a, b) => a + b, 0);

    // Funding rate
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
    const avgFunding = (fundingCurrent as any[]).length
      ? (fundingCurrent as any[]).reduce((s: number, f: any) => s + (f.last_funding_rate || 0), 0) / (fundingCurrent as any[]).length
      : 0;

    const result = {
      totalOI, oiChange24h, oiChart,
      totalLiqs, totalLongLiqs, totalShortLiqs, liqChart,
      totalVolume,
      avgFunding, fundChart,
      updatedAt: Date.now(),
    };

    await redis.set('coinalyze:data', JSON.stringify(result), { ex: 7200 });
    return NextResponse.json({ ok: true, updatedAt: result.updatedAt });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
