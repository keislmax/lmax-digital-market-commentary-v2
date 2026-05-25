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

    const MONTHS: Record<string, number> = {
      JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,
      JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11,
    };

    // Deribit expiry format: '27JUN25' → Date.UTC(2025, 5, 27, 8, 0, 0)
    function parseDeribitExp(name: string): number {
      const p = name.split('-')[1];          // e.g. '27JUN25'
      const day = parseInt(p.slice(0, 2));
      const mon = MONTHS[p.slice(2, 5)];
      const yr  = 2000 + parseInt(p.slice(5, 7));
      return Date.UTC(yr, mon, day, 8, 0, 0); // Deribit settles at 08:00 UTC
    }

    const summary = await fetchDeribit('get_book_summary_by_currency', {
      currency,
      kind: 'option',
    });
    if (!summary?.length) return null;

    const relevant = summary.filter((s: any) => {
      if (!s.instrument_name || !(s.mark_iv > 0)) return false;
      const exp = parseDeribitExp(s.instrument_name);
      return exp > sevenDays && exp < thirtyDays;
    });

    const calls = relevant.filter((s: any) => s.instrument_name.endsWith('-C'));
    const puts  = relevant.filter((s: any) => s.instrument_name.endsWith('-P'));

    if (!calls.length || !puts.length) return null;

    const avg = (arr: any[], key: string) =>
      arr.reduce((sum: number, x: any) => sum + x[key], 0) / arr.length;

    const skew = avg(puts, 'mark_iv') - avg(calls, 'mark_iv');
    return Math.abs(skew) < 0.01 ? null : skew;
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
