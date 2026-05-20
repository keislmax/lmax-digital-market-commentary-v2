import { NextResponse } from 'next/server';

const BASE = 'https://www.deribit.com/api/v2/public';

async function fetchDeribit(method: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/${method}?${query}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Deribit ${method} failed: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Deribit error: ${json.error.message}`);
  return json.result;
}

export async function GET() {
  try {
    // DVOL = Deribit's 30-day implied volatility index (like VIX for BTC)
    const [dvolHistory, instruments] = await Promise.all([
      fetchDeribit('get_volatility_index_data', {
        currency: 'BTC',
        start_timestamp: String(Date.now() - 86400 * 1000),
        end_timestamp: String(Date.now()),
        resolution: '3600', // 1h candles
      }),
      fetchDeribit('get_instruments', {
        currency: 'BTC',
        kind: 'option',
        expired: 'false',
      }),
    ]);

    // Current DVOL
    const dvolData = dvolHistory?.data || [];
    const currentDvol = dvolData.length > 0 ? dvolData[dvolData.length - 1][4] : null; // close
    const dvolChart = dvolData.map((d: number[]) => ({ t: Math.floor(d[0] / 1000), v: d[4] }));

    // 25-delta skew calculation
    // Find nearest expiry with good liquidity (7-30 days out)
    const now = Date.now();
    const sevenDays = now + 7 * 86400 * 1000;
    const thirtyDays = now + 30 * 86400 * 1000;

    const nearExpiries = [...new Set(
      instruments
        .filter((i: any) => i.expiration_timestamp > sevenDays && i.expiration_timestamp < thirtyDays)
        .map((i: any) => i.expiration_timestamp)
    )].sort((a: any, b: any) => a - b);

    let skew25d: number | null = null;
    let skewData: any[] = [];

    if (nearExpiries.length > 0) {
      const targetExpiry = nearExpiries[0] as number;
      const expiryInstruments = instruments.filter(
        (i: any) => i.expiration_timestamp === targetExpiry
      );

      // Get ticker data for puts and calls near 25-delta strikes
      // We'll use ATM ± 1 strike as a proxy for 25d skew
      const calls = expiryInstruments.filter((i: any) => i.option_type === 'call')
        .sort((a: any, b: any) => a.strike - b.strike);
      const puts = expiryInstruments.filter((i: any) => i.option_type === 'put')
        .sort((a: any, b: any) => a.strike - b.strike);

      if (calls.length > 2 && puts.length > 2) {
        // Sample a few strikes for IV (rate-limited, so just grab index data)
        // Use DVOL as primary IV metric — individual strike skew would need many calls
        // Return the instrument list metadata for now; full skew requires per-strike ticker calls
        skewData = calls.slice(0, 5).map((c: any) => ({
          strike: c.strike,
          type: 'call',
          name: c.instrument_name,
        }));
        // 25d skew approximation using DVOL ± spread (simplified for rate limit reasons)
        // Full implementation would call get_order_book for each strike
        skew25d = null; // set after per-strike fetch below
      }

      // Fetch IV for a few key strikes to estimate skew
      // Limit to 3 calls to stay well under rate limits
      try {
        const midIndex = Math.floor(calls.length / 2);
        const sampleCalls = [calls[midIndex - 1], calls[midIndex], calls[midIndex + 1]].filter(Boolean);
        const samplePuts = [puts[midIndex - 1], puts[midIndex], puts[midIndex + 1]].filter(Boolean);

        const tickerResults = await Promise.all([
          ...sampleCalls.map((i: any) => fetchDeribit('get_order_book', { instrument_name: i.instrument_name, depth: '1' })),
          ...samplePuts.map((i: any) => fetchDeribit('get_order_book', { instrument_name: i.instrument_name, depth: '1' })),
        ]);

        const callIVs = tickerResults.slice(0, sampleCalls.length).map((r: any) => r.mark_iv || 0).filter(Boolean);
        const putIVs = tickerResults.slice(sampleCalls.length).map((r: any) => r.mark_iv || 0).filter(Boolean);

        const avgCallIV = callIVs.length ? callIVs.reduce((a: number, b: number) => a + b, 0) / callIVs.length : 0;
        const avgPutIV = putIVs.length ? putIVs.reduce((a: number, b: number) => a + b, 0) / putIVs.length : 0;

        skew25d = avgPutIV - avgCallIV; // positive = puts more expensive = bearish skew
        skewData = [
          ...sampleCalls.map((i: any, idx: number) => ({ strike: i.strike, type: 'call', iv: callIVs[idx] || 0 })),
          ...samplePuts.map((i: any, idx: number) => ({ strike: i.strike, type: 'put', iv: putIVs[idx] || 0 })),
        ].filter(d => d.iv > 0);
      } catch {
        // Skew fetch failed, still return DVOL
      }
    }

    return NextResponse.json({
      dvol: {
        current: currentDvol,
        chart: dvolChart,
      },
      skew: {
        value25d: skew25d,
        interpretation: skew25d === null ? 'unavailable'
          : skew25d > 3 ? 'bearish (puts bid up)'
          : skew25d < -3 ? 'bullish (calls bid up)'
          : 'neutral',
        strikes: skewData,
      },
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
