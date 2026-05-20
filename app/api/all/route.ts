import { NextResponse } from 'next/server';

// Aggregator route — fetches all sub-APIs in parallel and returns combined payload
// This is what the frontend calls; one request instead of four
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const [coinalyze, deribit, feargreed, etf] = await Promise.allSettled([
    fetch(`${origin}/api/coinalyze`).then(r => r.json()),
    fetch(`${origin}/api/deribit`).then(r => r.json()),
    fetch(`${origin}/api/feargreed`).then(r => r.json()),
    fetch(`${origin}/api/etf`).then(r => r.json()),
  ]);

  return NextResponse.json({
    coinalyze: coinalyze.status === 'fulfilled' ? coinalyze.value : { error: 'fetch failed' },
    deribit: deribit.status === 'fulfilled' ? deribit.value : { error: 'fetch failed' },
    feargreed: feargreed.status === 'fulfilled' ? feargreed.value : { error: 'fetch failed' },
    etf: etf.status === 'fulfilled' ? etf.value : { error: 'fetch failed' },
    updatedAt: Date.now(),
  });
}
