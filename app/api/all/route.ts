import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  const [coinalyze, deribit, feargreed, etf, prices, spotvolume] = await Promise.allSettled([
    fetch(`${origin}/api/coinalyze`, { headers: { 'x-forwarded-host': url.host } }).then(r => r.json()),
    fetch(`${origin}/api/deribit`, { headers: { 'x-forwarded-host': url.host } }).then(r => r.json()),
    fetch(`${origin}/api/feargreed`, { headers: { 'x-forwarded-host': url.host } }).then(r => r.json()),
    fetch(`${origin}/api/etf`, { headers: { 'x-forwarded-host': url.host } }).then(r => r.json()),
    fetch(`${origin}/api/prices`, { headers: { 'x-forwarded-host': url.host } }).then(r => r.json()),
    fetch(`${origin}/api/spotvolume`, { headers: { 'x-forwarded-host': url.host } }).then(r => r.json()),
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
