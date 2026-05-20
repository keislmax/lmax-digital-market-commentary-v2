import { NextResponse } from 'next/server';

const ACTOR_ID = process.env.APIFY_ACTOR_ID;
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

function getLastTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const offset = day === 0 ? 2 : day === 1 ? 3 : 1;
  const last = new Date(now);
  last.setUTCDate(now.getUTCDate() - offset);
  return last.toISOString().split('T')[0];
}

const EMPTY = (asset: string) => ({ asset, error: 'No data', lastTradingDay: getLastTradingDay() });

export async function GET() {
  try {
    if (!ACTOR_ID || !APIFY_TOKEN) throw new Error('Missing Apify env vars');

    // Run actor synchronously and get key-value store output in one call
    // waitForFinish=300 means wait up to 5 minutes for completion
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync?token=${APIFY_TOKEN}&outputRecordKey=OUTPUT&timeout=60`;

    const res = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      // Don't cache — always get fresh data
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`Apify run-sync failed: ${res.status}`);

    const data = await res.json();

    if (!data || !data.btc) throw new Error('Invalid data structure from actor');

    return NextResponse.json({
      btc: data.btc || EMPTY('BTC'),
      eth: data.eth || EMPTY('ETH'),
      sol: data.sol || EMPTY('SOL'),
      hype: data.hype || EMPTY('HYPE'),
      lastTradingDay: getLastTradingDay(),
      note: 'Farside Investors data via Apify. Weekend days excluded.',
      updatedAt: data.updatedAt || Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
