import { NextResponse } from 'next/server';
import { fetchCharts } from '@/lib/theblock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLUGS = [
  'aggregated-open-interest-of-bitcoin-futures-daily',
  'aggregated-open-interest-of-ethereum-futures-daily',
  'btc-funding-rates',
  'eth-funding-rates',
  'btc-annualized-basis-binance',
  'btc-atm-implied-volatility',
  'eth-atm-implied-volatility',
  'annualized-btc-volatility-30d',
  'aggregated-open-interest-of-bitcoin-options',
  'aggregated-open-interest-of-ethereum-options',
  'spot-bitcoin-etf-flows',
  'spot-ethereum-etf-flows',
  'hype-spot-etf-flows',
  'spot-bitcoin-etf-onchain-holdings-usd',
  'spot-ethereum-etf-aum-daily',
  'total-stablecoin-supply-2',
  'microstrategy-bitcoin-holdings',
  'total-value-locked-rwa-by-protocol',
  'btc-and-eth-futures-volume-7dma',
];

export async function GET() {
  const charts = await fetchCharts(SLUGS);
  const out: Record<string, any> = {};
  for (const slug of SLUGS) {
    const c = charts[slug];
    if (!c) { out[slug] = { error: 'fetch failed / null' }; continue; }
    const seriesNames = Object.keys(c.series);
    // Latest value of each series, so we can see scale and whether a "total" line exists.
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
