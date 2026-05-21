import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const [deribit, feargreed, etf] = await Promise.allSettled([
    fetch(`${origin}/api/deribit`).then(r => r.json()),
    fetch(`${origin}/api/feargreed`).then(r => r.json()),
    fetch(`${origin}/api/etf`).then(r => r.json()),
  ]);

  return NextResponse.json({
    deribit: deribit.status === 'fulfilled' ? deribit.value : { error: 'fetch failed' },
    feargreed: feargreed.status === 'fulfilled' ? feargreed.value : { error: 'fetch failed' },
    etf: etf.status === 'fulfilled' ? etf.value : { error: 'fetch failed' },
    updatedAt: Date.now(),
  });
}
