import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
    new URL(request.url).origin
  );

  const headers = {
    'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
  };

  const [coinalyze, deribit, feargreed, etf, prices, spotvolume] = await Promise.allSettled([
    fetch(`${origin}/api/coinalyze`, { headers }).then(r => r.json()),
    fetch(`${origin}/api/deribit`, { headers }).then(r => r.json()),
    fetch(`${origin}/api/feargreed`, { headers }).then(r => r.json()),
    fetch(`${origin}/api/etf`, { headers }).then(r => r.json()),
    fetch(`${origin}/api/prices`, { headers }).then(r => r.json()),
    fetch(`${origin}/api/spotvolume`, { headers }).then(r => r.json()),
  ]);

  return NextResponse.json({
    coinalyze:  coinalyze.status  === 'fulfilled' ? coinalyze.value  : null,
    deribit:    deribit.status    === 'fulfilled' ? deribit.value    : null,
    feargreed:  feargreed.status  === 'fulfilled' ? feargreed.value  : null,
    etf:        etf.status        === 'fulfilled' ? etf.value        : null,
    prices:     prices.status     === 'fulfilled' ? prices.value     : null,
    spotvolume: spotvolume.status === 'fulfilled' ? spotvolume.value : null,
    updatedAt: Date.now(),
  });
}
