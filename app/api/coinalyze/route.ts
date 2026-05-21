import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function lastValue(chart: any[]): number {
  if (!chart || chart.length === 0) return 0;
  return chart[chart.length - 1].v || 0;
}

export async function GET() {
  try {
    const cached = await redis.get('coinalyze:data');
    if (!cached) return NextResponse.json({ error: 'cache_empty' }, { status: 503 });
    const raw: any = typeof cached === 'string' ? JSON.parse(cached) : cached;

    const fundCharts = raw.fundCharts || {};
    const fundChart24h = fundCharts?.total?.['24h'] || raw.fundChart || [];
    const currentFunding = raw.avgFunding ||
      (fundChart24h.length ? fundChart24h[fundChart24h.length - 1].v : 0);

    // Derive per-asset rates from chart last values if snapshot unavailable
    const rawByAsset = raw.fundingByAsset || {};
    const fundingByAsset = {
      ALL: rawByAsset.ALL || currentFunding,
      BTC: rawByAsset.BTC || lastValue(fundCharts?.BTC?.['24h'] || []),
      ETH: rawByAsset.ETH || lastValue(fundCharts?.ETH?.['24h'] || []),
      SOL: rawByAsset.SOL || lastValue(fundCharts?.SOL?.['24h'] || []),
      XRP: rawByAsset.XRP || lastValue(fundCharts?.XRP?.['24h'] || []),
    };

    return NextResponse.json({
      price: 0,
      openInterest: {
        current: raw.totalOI || 0,
        change24h: raw.oiChange24h || 0,
        chartsByAsset: raw.oiCharts || {},
      },
      fundingRate: {
        current: currentFunding,
        annualized: currentFunding * 3 * 365,
        byAsset: fundingByAsset,
        chartsByAsset: raw.fundCharts || {},
      },
      liquidations: {
        total24h: raw.totalLiqs24h || 0,
        longs24h: raw.totalLongLiqs24h || 0,
        shorts24h: raw.totalShortLiqs24h || 0,
        chartsByAsset: raw.liqCharts || {},
      },
      volume: {
        total24h: raw.totalVol24h || 0,
        chartsByAsset: raw.volCharts || {},
      },
      updatedAt: raw.updatedAt || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
