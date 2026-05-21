import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const [coinalyze, deribit, feargreed, etf] = await Promise.allSettled([
    fetch(`${origin}/api/coinalyze`).then(r => r.json()),
    fetch(`${origin}/api/deribit`).then(r => r.json()),
    fetch(`${origin}/api/feargreed`).then(r => r.json()),
    fetch(`${origin}/api/etf`).then(r => r.json()),
  ]);

  return NextResponse.json({
    coinalyze: coinalyze.status === 'fulfilled' ? coinalyze.value : null,
    deribit: deribit.status === 'fulfilled' ? deribit.value : null,
    feargreed: feargreed.status === 'fulfilled' ? feargreed.value : null,
    etf: etf.status === 'fulfilled' ? etf.value : null,
    updatedAt: Date.now(),
  });
}
