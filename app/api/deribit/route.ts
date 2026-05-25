import { NextResponse } from 'next/server';

const BASE = 'https://www.deribit.com/api/v2/public';

async function fetchDeribit(method: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${method}?${query}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Deribit ${method} failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Deribit error: ${json.error.message}`);
  return json.result;
}

async function fetchDvolCharts(currency: string) {
  const now = Date.now();
  const [h24, h7d, h30d, h90d, h1y] = await Promise.all([
    fetchDeribit('get_volatility_index_data', { currency, start_timestamp: String(now - 86400000), end_timestamp: String(now), resolution: '3600' }),
    fetchDeribit('get_volatility_index_data', { currency, start_timestamp: String(now - 7*86400000), end_timestamp: String(now), resolution: '3600' }),
    fetchDeribit('get_volatility_index_data', { currency, start_timestamp: String(now - 30*86400000), end_timestamp: String(now), resolution: '86400' }),
    fetchDeribit('get_volatility_index_data', { currency, start_timestamp: String(now - 90*86400000), end_timestamp: String(now), resolution: '86400' }),
    fetchDeribit('get_volatility_index_data', { currency, start_timestamp: String(now - 365*86400000), end_timestamp: String(now), resolution: '86400' }),
  ]);
  const toChart = (d: any) => (d?.data || []).map((p: number[]) => ({ t: Math.floor(p[0] / 1000), v: p[4] }));
  return {
    '24h': toChart(h24),
    '7d':  toChart(h7d),
    '30d': toChart(h30d),
    '90d': toChart(h90d),
    '1y':  toChart(h1y),
  };
}

async function calcSkew(currency: string): Promise<number | null> {
  try {
    const now = Date.now();
    const sevenDays  = now + 7  * 86400000;
    const thirtyDays = now + 30 * 86400000;

    // 1. Get current spot price to estimate 25Δ strikes
    const idx = await fetchDeribit('get_index_price', {
      index_name: `${currency.toLowerCase()}_usd`,
    });
    const spot: number = idx?.index_price ?? 0;
    if (!spot) return null;

    // 2. Get all active options
    const instruments: any[] = await fetchDeribit('get_instruments', {
      currency,
      kind: 'option',
      expired: 'false',
    });
    if (!Array.isArray(instruments) || !instruments.length) return null;

    // 3. Find nearest expiry in the 7–30 day window
    const inWindow = instruments.filter(i =>
      i.expiration_timestamp > sevenDays && i.expiration_timestamp < thirtyDays
    );
    if (!inWindow.length) return null;

    const nearestExpiry = Math.min(...inWindow.map(i => i.expiration_timestamp));
    const T = (nearestExpiry - now) / (365 * 86400000); // years to expiry

    // 4. Estimate 25Δ strikes via Black-Scholes approximation (σ ≈ 60%)
    const σ = 0.60;
    const callTarget = spot * Math.exp( 0.674 * σ * Math.sqrt(T));
    const putTarget  = spot * Math.exp(-0.674 * σ * Math.sqrt(T));

    const atExpiry = inWindow.filter(i => i.expiration_timestamp === nearestExpiry);

    // 5. Pick the 3 strikes closest to each 25Δ target
    const callCands = atExpiry
      .filter(i => i.option_type === 'call')
      .sort((a, b) => Math.abs(a.strike - callTarget) - Math.abs(b.strike - callTarget))
      .slice(0, 3);

    const putCands = atExpiry
      .filter(i => i.option_type === 'put')
      .sort((a, b) => Math.abs(a.strike - putTarget) - Math.abs(b.strike - putTarget))
      .slice(0, 3);

    if (!callCands.length || !putCands.length) return null;

    // 6. Fetch tickers for those 6 specific instruments
    const tickers = await Promise.all(
      [...callCands, ...putCands].map(i =>
        fetchDeribit('ticker', { instrument_name: i.instrument_name })
      )
    );

    const callIVs = tickers
      .slice(0, callCands.length)
      .map((t: any) => t?.mark_iv as number)
      .filter(v => typeof v === 'number' && v > 0);

    const putIVs = tickers
      .slice(callCands.length)
      .map((t: any) => t?.mark_iv as number)
      .filter(v => typeof v === 'number' && v > 0);

    if (!callIVs.length || !putIVs.length) return null;

    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const skew = avg(putIVs) - avg(callIVs);
    return Math.abs(skew) < 0.01 ? null : skew;
  } catch (e) {
    console.error('[calcSkew error]', currency, e);
    return null;
  }
}

export async function GET() {
  try {
    const [btcCharts, ethCharts, btcSkew, ethSkew] = await Promise.all([
      fetchDvolCharts('BTC'),
      fetchDvolCharts('ETH'),
      calcSkew('BTC'),
      calcSkew('ETH'),
    ]);

    const btcCurrent = btcCharts['24h'].length ? btcCharts['24h'][btcCharts['24h'].length - 1].v : null;
    const ethCurrent = ethCharts['24h'].length ? ethCharts['24h'][ethCharts['24h'].length - 1].v : null;

    const interpSkew = (s: number | null) => s === null ? 'unavailable'
      : s > 3 ? 'bearish (puts bid up)' : s < -3 ? 'bullish (calls bid up)' : 'neutral';

    return NextResponse.json({
      dvol: {
        current: btcCurrent,
        chartsByAsset: { BTC: btcCharts, ETH: ethCharts },
      },
      skew: {
        value25d: btcSkew === 0 ? null : btcSkew,
        interpretation: interpSkew(btcSkew),
        BTC: { value25d: btcSkew, interpretation: interpSkew(btcSkew) },
        ETH: { value25d: ethSkew === 0 ? null : ethSkew, interpretation: interpSkew(ethSkew === 0 ? null : ethSkew) },
      },
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({
  dvol: { ... },
  skew: { ... },
  updatedAt: Date.now(),
  skewDebug: { btc: btcSkew, eth: ethSkew },   // ← add this
});
