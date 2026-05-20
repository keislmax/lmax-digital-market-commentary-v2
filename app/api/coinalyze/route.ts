import { NextResponse } from 'next/server';

const BASE = 'https://api.coinalyze.net/v1';
const API_KEY = process.env.COINALYZE_API_KEY;

// BTC perpetual symbols across major exchanges — Coinalyze aggregates these
// BTCUSDT_PERP.A = Binance, .0 = BitMEX, .3 = Bybit, .6 = OKX
const BTC_SYMBOLS = 'BTCUSDT_PERP.A,BTCUSDT_PERP.3,BTCUSDT_PERP.6';

function headers() {
  return { 'api_key': API_KEY || '' };
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function ago(seconds: number) {
  return nowSec() - seconds;
}

async function fetchCoinalyze(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 300 }, // cache 5 min
  });
  if (!res.ok) throw new Error(`Coinalyze ${path} failed: ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const [
      oiCurrent,
      fundingCurrent,
      oiHistory,
      fundingHistory,
      liqHistory,
      volumeHistory,
    ] = await Promise.all([
      // Current snapshots
      fetchCoinalyze(`/open-interest?symbols=${BTC_SYMBOLS}&convert_to_usd=true`),
      fetchCoinalyze(`/funding-rate?symbols=${BTC_SYMBOLS}`),

      // 24h history at 1h intervals
      fetchCoinalyze(`/open-interest-history?symbols=${BTC_SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}&convert_to_usd=true`),
      fetchCoinalyze(`/funding-rate-history?symbols=${BTC_SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}`),
      fetchCoinalyze(`/liquidation-history?symbols=${BTC_SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}&convert_to_usd=true`),
      fetchCoinalyze(`/ohlcv-history?symbols=${BTC_SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}`),
    ]);

    // --- Aggregate OI across symbols ---
    const totalOI = (oiCurrent as any[]).reduce((sum: number, s: any) => sum + (s.value || 0), 0);

    // Merge OI history across symbols by timestamp
    const oiByTime: Record<number, number> = {};
    for (const sym of (oiHistory as any[])) {
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

    // --- Aggregate funding rate (weighted average across symbols) ---
    const avgFunding = (fundingCurrent as any[]).reduce((sum: number, s: any) => sum + (s.value || 0), 0)
      / (fundingCurrent as any[]).length;

    // Funding history - average across symbols per hour
    const fundByTime: Record<number, number[]> = {};
    for (const sym of (fundingHistory as any[])) {
      for (const point of sym.history || []) {
        if (!fundByTime[point.t]) fundByTime[point.t] = [];
        fundByTime[point.t].push(point.c);
      }
    }
    const fundingChart = Object.entries(fundByTime)
      .map(([t, vals]) => ({ t: Number(t), v: vals.reduce((a, b) => a + b, 0) / vals.length }))
      .sort((a, b) => a.t - b.t);

    // --- Aggregate liquidations ---
    const liqByTime: Record<number, { l: number; s: number }> = {};
    for (const sym of (liqHistory as any[])) {
      for (const point of sym.history || []) {
        if (!liqByTime[point.t]) liqByTime[point.t] = { l: 0, s: 0 };
        liqByTime[point.t].l += point.l || 0;
        liqByTime[point.t].s += point.s || 0;
      }
    }
    const liqChart = Object.entries(liqByTime)
      .map(([t, v]) => ({ t: Number(t), long: v.l, short: v.s, total: v.l + v.s }))
      .sort((a, b) => a.t - b.t);

    const totalLiq24h = liqChart.reduce((sum, p) => sum + p.total, 0);
    const totalLiqLong = liqChart.reduce((sum, p) => sum + p.long, 0);
    const totalLiqShort = liqChart.reduce((sum, p) => sum + p.short, 0);

    // --- Aggregate volume + price ---
    const volByTime: Record<number, { v: number; c: number }> = {};
    for (const sym of (volumeHistory as any[])) {
      for (const point of sym.history || []) {
        if (!volByTime[point.t]) volByTime[point.t] = { v: 0, c: 0 };
        volByTime[point.t].v += point.v || 0;
        volByTime[point.t].c = point.c; // use last symbol's close as price proxy
      }
    }
    const volumeChart = Object.entries(volByTime)
      .map(([t, v]) => ({ t: Number(t), volume: v.v, price: v.c }))
      .sort((a, b) => a.t - b.t);

    const totalVolume24h = volumeChart.reduce((sum, p) => sum + p.volume, 0);
    const currentPrice = volumeChart[volumeChart.length - 1]?.price || 0;

    return NextResponse.json({
      price: currentPrice,
      openInterest: {
        current: totalOI,
        change24h: oiChange24h,
        chart: oiChart,
      },
      fundingRate: {
        current: avgFunding,
        annualized: avgFunding * 3 * 365, // 3 periods/day * 365
        chart: fundingChart,
      },
      liquidations: {
        total24h: totalLiq24h,
        longs24h: totalLiqLong,
        shorts24h: totalLiqShort,
        chart: liqChart,
      },
      volume: {
        total24h: totalVolume24h,
        chart: volumeChart,
      },
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
