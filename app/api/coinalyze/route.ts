import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET() {
  try {
    const cached = await redis.get('coinalyze:data');
    if (!cached) {
      return NextResponse.json({ error: 'cache_empty' }, { status: 503 });
    }

    const raw: any = typeof cached === 'string' ? JSON.parse(cached) : cached;

    // Transform flat Redis data into the shape components expect
    const data = {
      price: raw.price || 0,
      openInterest: {
        current: raw.totalOI || 0,
        change24h: raw.oiChange24h || 0,
        chart: (raw.oiChart || []).map((p: any) => ({ t: p.t, v: p.v })),
      },
      fundingRate: {
        current: raw.avgFunding || 0,
        annualized: (raw.avgFunding || 0) * 3 * 365,
        chart: (raw.fundChart || []).map((p: any) => ({ t: p.t, v: p.v })),
      },
      liquidations: {
        total24h: raw.totalLiqs || 0,
        longs24h: raw.totalLongLiqs || 0,
        shorts24h: raw.totalShortLiqs || 0,
        chart: (raw.liqChart || []).map((p: any) => ({ t: p.t, long: p.l || 0, short: p.s || 0, total: (p.l || 0) + (p.s || 0) })),
      },
      volume: {
        total24h: raw.totalVolume || 0,
        chart: [],
      },
      updatedAt: raw.updatedAt || Date.now(),
    };

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
