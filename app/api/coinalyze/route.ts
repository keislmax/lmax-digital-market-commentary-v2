import { NextResponse } from 'next/server';

const BASE = 'https://api.coinalyze.net/v1';
const API_KEY = process.env.COINALYZE_API_KEY;

const SYMBOLS = [
  'BTCUSDT_PERP.A','BTCUSDT_PERP.3','BTCUSDT_PERP.6',
  'ETHUSDT_PERP.A','ETHUSDT_PERP.3','ETHUSDT_PERP.6',
  'SOLUSDT_PERP.A','SOLUSDT_PERP.3','SOLUSDT_PERP.6',
  'XRPUSDT_PERP.A','XRPUSDT_PERP.3','XRPUSDT_PERP.6',
].join(',');

function headers() { return { 'api_key': API_KEY || '' }; }
function nowSec() { return Math.floor(Date.now() / 1000); }
function ago(s: number) { return nowSec() - s; }

async function fetchCoinalyze(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Coinalyze ${path} failed: ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const [oiCurrent, fundingCurrent, oiHistory, fundingHistory, liqHistory, volumeHistory] = await Promise.all([
      fetchCoinalyze(`/open-interest?symbols=${SYMBOLS}&convert_to_usd=true`),
      fetchCoinalyze(`/funding-rate?symbols=${SYMBOLS}`),
      fetchCoinalyze(`/open-interest-history?symbols=${SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}&convert_to_usd=true`),
      fetchCoinalyze(`/funding-rate-history?symbols=${SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}`),
      fetchCoinalyze(`/liquidation-history?symbols=${SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}&convert_to_usd=true`),
      fetchCoinalyze(`/ohlcv-history?symbols=${SYMBOLS}&interval=1hour&from=${ago(86400)}&to=${nowSec()}`),
    ]);

    const totalOI = (oiCurrent as any[]).reduce((sum: number, s: any) => sum + (s.value || 0), 0);

    const oiByTime: Record<number, number> = {};
    for (const sym of (oiHistory as any[])) {
      for (const point of sym.history || []) {
        oiByTime[point.t] = (oiByTime[point.t] || 0) + point.c;
      }
    }
    const oiChart = Object.entries(oiByTime).map(([t, v]) => ({ t: Number(t), v })).sort((a, b) => a.t - b.t);
    const oiChange24h = oiChart.length >= 2
      ? ((oiChart[oiChart.length - 1].v - oiChart[0].v) / oiChart[0].v) * 100
      : 0;

    const liqByTime: Record<number, { l: number; s: number }> = {};
    for (const sym of (liqHistory as any[])) {
      for (const point of sym.history || []) {
        if (!liqByTime[point.t]) liqByTime[point.t] = { l: 0, s: 0 };
        liqByTime[point.t].l += point.l || 0;
        liqByTime[point.t].s += point.s || 0;
      }
    }
    const liqChart = Object.entries(liqByTime).map(([t, v]) => ({ t: Number(t), ...v })).sort((a, b) => a.t - b.t);
    const totalLiqs = liqChart.reduce((sum, p) => sum + p.l + p.s, 0);
    const totalLongLiqs = liqChart.reduce((sum, p) => sum + p.l, 0);
    const totalShortLiqs = liqChart.reduce((sum, p) => sum + p.s, 0);

    const volByTime: Record<number, number> = {};
    for (const sym of (volumeHistory as any[])) {
      for (const point of sym.history || []) {
        volByTime[point.t] = (volByTime[point.t] || 0) + (point.v || 0) * (point.c || 0);
      }
    }
    const totalVolume = Object.values(volByTime).reduce((a, b) => a + b, 0);

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

    return NextResponse.json({
      totalOI, oiChange24h, oiChart,
      totalLiqs, totalLongLiqs, totalShortLiqs, liqChart,
      totalVolume,
      avgFunding, fundChart,
      updatedAt: Date.now(),
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
