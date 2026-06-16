import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { buildTheBlockData } from '@/lib/theblock';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const ACTOR_ID = process.env.APIFY_ACTOR_ID;
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

type FeedStatus = 'operational' | 'stale' | 'down';
interface FeedResult {
  key: string;
  name: string;
  status: FeedStatus;
  detail: string;
  ageMinutes: number | null;
}

// Coinalyze: snapshot in Redis, written hourly by cron. Check freshness + sanity.
async function checkCoinalyze(): Promise<FeedResult> {
  const base = { key: 'coinalyze', name: 'Coinalyze' };
  try {
    const cached = await redis.get('coinalyze:data');
    if (!cached) return { ...base, status: 'down', detail: 'No cached snapshot found in Redis', ageMinutes: null };
    const raw: any = typeof cached === 'string' ? JSON.parse(cached) : cached;
    const updatedAt = raw.updatedAt || 0;
    const ageMinutes = updatedAt ? Math.round((Date.now() - updatedAt) / 60000) : null;
    const hasOI = (raw.totalOI || 0) > 0;
    const hasFunding = raw.fundingByAsset && typeof raw.fundingByAsset.ALL === 'number';
    if (!hasOI || !hasFunding) {
      return { ...base, status: 'down', detail: 'Snapshot present but core values missing (OI or funding)', ageMinutes };
    }
    // Hourly cron + up to ~15min run time; flag if older than 75 min.
    if (ageMinutes !== null && ageMinutes > 75) {
      return { ...base, status: 'stale', detail: `Snapshot is ${ageMinutes} min old (expected hourly refresh; cron may have missed a run)`, ageMinutes };
    }
    return { ...base, status: 'operational', detail: `Snapshot fresh, total OI and funding present`, ageMinutes };
  } catch (e: any) {
    return { ...base, status: 'down', detail: `Redis read failed: ${e.message}`, ageMinutes: null };
  }
}

// CoinGecko: genuinely live. Independent fetch of BTC price.
async function checkCoinGecko(): Promise<FeedResult> {
  const base = { key: 'coingecko', name: 'CoinGecko (prices, dominance, volume)' };
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&x_cg_demo_api_key=${COINGECKO_KEY}`, { cache: 'no-store' });
    if (!res.ok) return { ...base, status: 'down', detail: `HTTP ${res.status} from CoinGecko`, ageMinutes: null };
    const data = await res.json();
    const price = Array.isArray(data) && data[0]?.current_price;
    if (typeof price === 'number' && price > 0) {
      return { ...base, status: 'operational', detail: `Live BTC price returned ($${price.toLocaleString('en-US')})`, ageMinutes: 0 };
    }
    return { ...base, status: 'down', detail: 'Responded but no valid price field', ageMinutes: null };
  } catch (e: any) {
    return { ...base, status: 'down', detail: `Fetch failed: ${e.message}`, ageMinutes: null };
  }
}

// Deribit: live. Independent index price call.
async function checkDeribit(): Promise<FeedResult> {
  const base = { key: 'deribit', name: 'Deribit (skew, basis, put/call)' };
  try {
    const res = await fetch('https://www.deribit.com/api/v2/public/get_index_price?index_name=btc_usd', { cache: 'no-store' });
    if (!res.ok) return { ...base, status: 'down', detail: `HTTP ${res.status} from Deribit`, ageMinutes: null };
    const json = await res.json();
    const spot = json?.result?.index_price;
    if (typeof spot === 'number' && spot > 0) {
      return { ...base, status: 'operational', detail: `Live BTC index returned ($${spot.toLocaleString('en-US')})`, ageMinutes: 0 };
    }
    return { ...base, status: 'down', detail: 'Responded but no valid index price', ageMinutes: null };
  } catch (e: any) {
    return { ...base, status: 'down', detail: `Fetch failed: ${e.message}`, ageMinutes: null };
  }
}

// The Block: live fetch, but underlying data is daily-published at source.
async function checkTheBlock(): Promise<FeedResult> {
  const base = { key: 'theblock', name: 'The Block (OI, funding, options, ETF, stablecoins)' };
  try {
    const data: any = await buildTheBlockData();
    if (!data) return { ...base, status: 'down', detail: 'buildTheBlockData returned null', ageMinutes: null };
    // Confirm at least one core series is populated.
    const populated = Object.values(data).some(v => v !== null && v !== undefined);
    if (populated) {
      return { ...base, status: 'operational', detail: 'Returned latest published data (source updates daily)', ageMinutes: null };
    }
    return { ...base, status: 'down', detail: 'Responded but all fields empty', ageMinutes: null };
  } catch (e: any) {
    return { ...base, status: 'down', detail: `Fetch failed: ${e.message}`, ageMinutes: null };
  }
}

// Farside / Apify: live actor run, daily ETF data.
async function checkFarside(): Promise<FeedResult> {
  const base = { key: 'farside', name: 'Farside / Apify (SOL ETF flows)' };
  try {
    if (!ACTOR_ID || !APIFY_TOKEN) return { ...base, status: 'down', detail: 'Apify credentials not configured', ageMinutes: null };
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync?token=${APIFY_TOKEN}&outputRecordKey=OUTPUT&timeout=45`;
    const res = await fetch(runUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), cache: 'no-store' });
    if (!res.ok) return { ...base, status: 'down', detail: `Apify run returned HTTP ${res.status}`, ageMinutes: null };
    const data = await res.json();
    if (data && data.btc) {
      return { ...base, status: 'operational', detail: 'Actor returned ETF data for latest trading day', ageMinutes: null };
    }
    return { ...base, status: 'down', detail: 'Actor ran but returned no ETF data', ageMinutes: null };
  } catch (e: any) {
    return { ...base, status: 'down', detail: `Actor run failed: ${e.message}`, ageMinutes: null };
  }
}

// Alternative.me Fear & Greed: daily.
async function checkFearGreed(): Promise<FeedResult> {
  const base = { key: 'feargreed', name: 'Alternative.me (Fear & Greed)' };
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json', { cache: 'no-store' });
    if (!res.ok) return { ...base, status: 'down', detail: `HTTP ${res.status}`, ageMinutes: null };
    const json = await res.json();
    const item = json?.data?.[0];
    if (item && item.value) {
      const ts = Number(item.timestamp) * 1000;
      const ageMinutes = ts ? Math.round((Date.now() - ts) / 60000) : null;
      // Index publishes daily; flag if older than 48h.
      if (ageMinutes !== null && ageMinutes > 2880) {
        return { ...base, status: 'stale', detail: `Latest index is ${Math.round(ageMinutes / 60)}h old`, ageMinutes };
      }
      return { ...base, status: 'operational', detail: `Current index: ${item.value} (${item.value_classification})`, ageMinutes };
    }
    return { ...base, status: 'down', detail: 'Responded but no index value', ageMinutes: null };
  } catch (e: any) {
    return { ...base, status: 'down', detail: `Fetch failed: ${e.message}`, ageMinutes: null };
  }
}

export async function GET() {
  const results = await Promise.allSettled([
    checkCoinalyze(),
    checkCoinGecko(),
    checkDeribit(),
    checkTheBlock(),
    checkFarside(),
    checkFearGreed(),
  ]);

  const feeds: FeedResult[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['Coinalyze', 'CoinGecko', 'Deribit', 'The Block', 'Farside / Apify', 'Alternative.me'];
    const keys = ['coinalyze', 'coingecko', 'deribit', 'theblock', 'farside', 'feargreed'];
    return { key: keys[i], name: names[i], status: 'down' as FeedStatus, detail: 'Check threw an unexpected error', ageMinutes: null };
  });

  const operational = feeds.filter(f => f.status === 'operational').length;
  const total = feeds.length;

  return NextResponse.json({
    headline: `${operational}/${total} feeds operational`,
    operational,
    total,
    allHealthy: operational === total,
    feeds,
    checkedAt: Date.now(),
  });
}
