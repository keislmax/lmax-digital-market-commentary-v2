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
  const now = Date.now();
  try {
    const instruments = await fetchDeribit('get_instruments', { currency, kind: 'option', expired: 'false' });
    const nearExpiries = [...new Set(
      instruments
        .filter((i: any) => i.expiration_timestamp > now + 7*86400000 && i.expiration_timestamp < now + 30*86400000)
        .map((i: any) => i.expiration_timestamp)
    )].sort((a: any, b: any) => a - b);

    if (!nearExpiries.length) return null;
    const targetExpiry = nearExpiries[0] as number;
    const calls = instruments.filter((i: any) => i.expiration_timestamp === targetExpiry && i.option_type === 'call').sort((a: any, b: any) => a.strike - b.strike);
    const puts  = instruments.filter((i: any) => i.expiration_timestamp === targetExpiry && i.option_type === 'put').sort((a: any, b: any) => a.strike - b.strike);
    if (calls.length < 3 || puts.length < 3) return null;

    const mid = Math.floor(calls.length / 2);
    const sampleCalls = [calls[mid-1], calls[mid], calls[mid+1]].filter(Boolean);
    const samplePuts  = [puts[mid-1],  puts[mid],  puts[mid+1]].filter(Boolean);

    const results = await Promise.all([
      ...sampleCalls.map((i: any) => fetchDeribit('get_order_book', { instrument_name: i.instrument_name, depth: '1' })),
      ...samplePuts.map((i: any)  => fetchDeribit('get_order_book', { instrument_name: i.instrument_name, depth: '1' })),
    ]);

    const callIVs = results.slice(0, sampleCalls.length).map((r: any) => r.mark_iv).filter((v: any) => v && v > 0);
    const putIVs  = results.slice(sampleCalls.length).map((r: any) => r.mark_iv).filter((v: any) => v && v > 0);
    if (!callIVs.length || !putIVs.length) return null;
    
    const avgCallIV = callIVs.reduce((a: number, b: number) => a + b, 0) / callIVs.length;
    const avgPutIV  = putIVs.reduce((a: number, b: number) => a + b, 0) / putIVs.length;
    return avgPutIV - avgCallIV;
  } catch {
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
