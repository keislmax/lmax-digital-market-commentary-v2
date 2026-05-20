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

async function fetchCoinalyze(path: string, retries = 3): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (res.status === 429 && retries > 0) {
    const wait = parseInt(res.headers.get('Retry-After') || '5', 10) * 1000;
    await new Promise(r => setTimeout(r, wait));
    return fetchCoinalyze(path, retries - 1);
  }
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

const SYMBOLS = 'BTCUSD_PERP.A,ETHUSD_PERP.A,SOLUSD_PERP.A,XRPUSD_PERP.A,BTCUSDT.6,BTCUSD.6,ETHUSD.6,ETHUSDT.6,BTCUSDC_PERP.A,XRPUSDT_PERP.A,BTCUSDT_PERP.A,ETHBTC_PERP.A,ETHUSDT_PERP.A,XRPUSD.6,SOLUSDT_PERP.A,XRPUSDT.6,SOLUSDT.6,ETHUSDC_PERP.A,SOLUSDC_PERP.A,XRPUSDC_PERP.A,BTCUSD1_PERP.A,SOL_USDT.Y,pf_xbtusd.K,BTCUSD_PERP.3,ETH-PERPETUAL.2,BTCUSDT_PERP.4,XRP-PERP.C,BTCUSDT_PERP.F,pf_ethusd.K,ETH-PERP.C,SOLUSDT.S,ETH-USD.8,2.T,SOL.H,XRPUSDT_PERP.0,BTCUSDT_PERP.3,XRPUSD_PERP.4,BTC.H,BTC-USD.8,ETHUSDT_PERP.F,pf_xrpusd.K,SOLUSD_PERP.3,ETHUSD_PERP.0,ETHUSDT.S,7.T,SOLUSDT_PERP.4,BTCEUR_PERP.0,SOL-PERP.C,PERP_SOL_USDT.W,ETH_USDT.Y,XRPUSDT_PERP.4,XRP.H,SOLPERP.6,PERP_ETH_USDT.W,cETHUSD.7,XRPPERP.6,SOL-USD.8,BTC-PERPETUAL.2,BTC-PERP.V,XRPUSD_PERP.0,BTCUSD_PERP.0,ETH.H,XRP_USDC-PERPETUAL.2,PERP_BTC_USDT.W,XRP-USD.8,BTCUSD_PERP.4,pf_solusd.K,ETHBTC_PERP.F,SOLUSD_PERP.0,XRPUSD_PERP.3,BTC_USDT.Y,SOLUSDT_PERP.F,PERP_XRP_USDT.W,ETH_USDC-PERPETUAL.2,BTC-PERP.C,ETHPERP.6,XRPUSDT_PERP.3,SOLUSDT_PERP.3,XRPUSDT.S,SOLUSDT_PERP.0,ETHUSDT_PERP.4,BTCUSDT_PERP.0,BTC_USDC-PERPETUAL.2,1.T,SOL-PERP.V,BTCETH_PERP.0,XRPBTC_PERP.F,ETH-PERP.V,XRP-PERP.V,ETHUSDT_PERP.0,XRPUSDT_PERP.F,BTCUSD.7,ETHUSD_PERP.3,BTCUSDT.S,BTCPERP.6,0.T,ETHUSDT_PERP.3,SOL_USDC-PERPETUAL.2,XRP_USDT.Y,BTC_USD.Y';

export async function GET() {
  try {
    const from24h = ago(86400);
    const to = nowSec();

    const [oiCurrent, liqHistory, oiHistory, volHistory, fundingCurrent, fundingHistory] = await Promise.all([
      fetchCoinalyze(`/open-interest?symbols=${SYMBOLS}&convert_to_usd=true`),
      fetchCoinalyze(`/liquidation-history?symbols=${SYMBOLS}&interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`),
      fetchCoinalyze(`/open-interest-history?symbols=${SYMBOLS}&interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`),
      fetchCoinalyze(`/ohlcv-history?symbols=${SYMBOLS}&interval=1hour&from=${from24h}&to=${to}&convert_to_usd=true`),
      fetchCoinalyze(`/funding-rate?symbols=${SYMBOLS}`),
      fetchCoinalyze(`/funding-rate-history?symbols=${SYMBOLS}&interval=1hour&from=${from24h}&to=${to}`),
    ]);

    // Aggregate OI
    const totalOI = (oiCurrent as any[]).reduce((sum: number, s: any) => sum + (s.value || 0), 0);
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

    // Aggregate liquidations
    const liqByTime: Record<number, { l: number; s: number }> = {};
    for (const sym of (liqHistory as any[])) {
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
    for (const sym of (volHistory as any[])) {
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
