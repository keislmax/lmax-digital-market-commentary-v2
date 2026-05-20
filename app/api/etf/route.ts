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

export async function GET() {
  try {
    if (!ACTOR_ID || !APIFY_TOKEN) {
      throw new Error('Missing APIFY_ACTOR_ID or APIFY_API_TOKEN environment variables');
    }

    // Read items from the last successful run's default dataset
    const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs/last/dataset/items?token=${APIFY_TOKEN}&status=SUCCEEDED`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) throw new Error(`Apify API failed: ${res.status}`);

    const items = await res.json();

    // We pushed one combined object so items[0] has btc/eth/sol/hype
    const data = Array.isArray(items) && items.length > 0 ? items[0] : null;

    if (!data) {
      throw new Error('No data found in last run dataset');
    }

    return NextResponse.json({
      btc: data.btc || { asset: 'BTC', error: 'No data', lastTradingDay: getLastTradingDay() },
      eth: data.eth || { asset: 'ETH', error: 'No data', lastTradingDay: getLastTradingDay() },
      sol: data.sol || { asset: 'SOL', error: 'No data', lastTradingDay: getLastTradingDay() },
      hype: data.hype || { asset: 'HYPE', error: 'No data', lastTradingDay: getLastTradingDay() },
      lastTradingDay: getLastTradingDay(),
      note: 'Farside Investors data via Apify. Weekend days excluded.',
      updatedAt: data.updatedAt || Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
