import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET() {
  try {
    const cached = await redis.get('coinalyze:data');
    if (!cached) return NextResponse.json({ error: 'cache_empty' }, { status: 503 });
    const raw: any = typeof cached === 'string' ? JSON.parse(cached) : cached;
    return NextResponse.json({
      price: 0, // price comes from CoinGecko
      openInterest: {
        current: raw.totalOI || 0,
        change24h: raw.oiChange24h || 0,
        charts: raw.oiCharts || {},
      },
      fundingRate: {
        current: raw.avgFunding || 0,
        annualized: (raw.avgFunding || 0) * 3 * 365,
        chart: raw.fundChart || [],
      },
      liquidations: {
        total24h: raw.totalLiqs24h || 0,
        longs24h: raw.totalLongLiqs24h || 0,
        shorts24h: raw.totalShortLiqs24h || 0,
        charts: raw.liqCharts || {},
      },
      volume: {
        total24h: raw.totalVol24h || 0,
        charts: raw.volCharts || {},
      },
      updatedAt: raw.updatedAt || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
