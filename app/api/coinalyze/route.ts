import { NextResponse } from 'next/server';

export const maxDuration = 60;

const BASE = 'https://api.coinalyze.net/v1';
const API_KEY = process.env.COINALYZE_API_KEY;

function headers() { return { 'api_key': API_KEY || '' }; }
function nowSec() { return Math.floor(Date.now() / 1000); }
function ago(s: number) { return nowSec() - s; }

const SYMBOLS = [
  'BTCUSDT_PERP.A','BTCUSD_PERP.0','BTCUSDT_PERP.3','BTC-PERPETUAL.2','BTCUSDT_PERP.4','BTCPERP.6',
  'ETHUSDT_PERP.A','ETHUSD_PERP.0','ETHUSDT_PERP.3','ETH-PERPETUAL.2','ETHUSDT_PERP.4','ETHPERP.6',
  'SOLUSDT_PERP.A','SOLUSDT_PERP.3','SOLUSDT_PERP.4','SOLPERP.6',
  'XRPUSDT_PERP.A','XRPUSDT_PERP.3','XRPUSDT_PERP.4','XRPPERP.6',
].join(',');

async function fetchCoinalyze(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: headers(),
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const from24h = ago(86400);
    const to = nowSec();

    const [oiCurrent, fundingCurrent, liqHistory] = await Promise.all([
      fetchCoinalyze(`/open-interest?symbols=${SYMBOLS}&convert_to_usd=true`),
      fetchCoinalyze(`/funding-rate?symbols=${SYMBOLS}`),
      fetchCoinalyze(`/liquidation-history?symbols=${SYMBOLS}&interval=1day&from=${from24h}&to=${to}&convert_to_usd=true`),
    ]);

    const totalOI = (oiCurrent as any[]).reduce((sum: number, s: any) => sum + (s.value || 0), 0);

    const avgFunding = (fundingCurrent as any[]).length
      ? (fundingCurrent as any[]).reduce((s: number, f: any) => s + (f.last_funding_rate || 0), 0) / (fundingCurrent as any[]).length
      : 0;

    const totalLiqs = (liqHistory as any[]).reduce((sum: number, sym: any) =>
      sum + (sym.history || []).reduce((s: number, p: any) => s + (p.l || 0) + (p.s || 0), 0), 0);
    const totalLongLiqs = (liqHistory as any[]).reduce((sum: number, sym: any) =>
      sum + (sym.history || []).reduce((s: number, p: any) => s + (p.l || 0), 0), 0);
    const totalShortLiqs = (liqHistory as any[]).reduce((sum: number, sym: any) =>
      sum + (sym.history || []).reduce((s: number, p: any) => s + (p.s || 0), 0), 0);

    return NextResponse.json({
      totalOI,
      oiChange24h: 0,
      oiChart: [],
      totalLiqs,
      totalLongLiqs,
      totalShortLiqs,
      liqChart: [],
      totalVolume: 0,
      avgFunding,
      fundChart: [],
      updatedAt: Date.now(),
    }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate' }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
