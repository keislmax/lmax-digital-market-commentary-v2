import { NextResponse } from 'next/server';
import { fetchCharts } from '@/lib/theblock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Candidate slugs for liquidations — guessed from The Block's naming patterns.
const CANDIDATES = [
  'bitcoin-liquidations',
  'btc-liquidations',
  'crypto-liquidations',
  'futures-liquidations',
  'total-liquidations',
  'aggregated-liquidations',
  'liquidations',
  'bitcoin-futures-liquidations',
  'btc-futures-liquidations',
  'long-and-short-liquidations',
  'daily-liquidations',
  'liquidations-by-exchange',
  'bitcoin-long-short-liquidations',
  'total-crypto-liquidations',
  'perpetual-futures-liquidations',
];

export async function GET() {
  const charts = await fetchCharts(CANDIDATES);
  const out: Record<string, any> = {};
  for (const slug of CANDIDATES) {
    const c = charts[slug];
    if (!c) { out[slug] = 'null / not found'; continue; }
    const seriesNames = Object.keys(c.series);
    const latestPerSeries: Record<string, number | null> = {};
    for (const [name, pts] of Object.entries(c.series)) {
      latestPerSeries[name] = pts.length ? pts[pts.length - 1].Result : null;
    }
    out[slug] = {
      description: c.description,
      frequency: c.frequency,
      seriesCount: seriesNames.length,
      seriesNames,
      latestPerSeries,
    };
  }
  return NextResponse.json(out, { status: 200 });
}
