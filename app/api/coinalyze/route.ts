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

    const fundCharts = raw.fundCharts || {};
    const fundChart24h = fundCharts['24h'] || raw.fundChart || [];
    const currentFunding = raw.avgFunding ||
      (fundChart24h.length ? fundChart24h[fundChart24h.length - 1].v : 0);

    return NextResponse.json({
      price: 0,
      openInterest: {
        current: raw.totalOI || 0,
        change24h: raw.oiChange24h || 0,
        charts: raw.oiCharts || {},
      },
      fundingRate: {
        current: currentFunding,
        annualized: currentFunding * 3 * 365,
        charts: {
          '24h': fundChart24h,
          '7d':  fundCharts['7d']  || [],
          '30d': fundCharts['30d'] || [],
          '90d': fundCharts['90d'] || [],
          '1y':  fundCharts['1y']  || [],
        },
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
