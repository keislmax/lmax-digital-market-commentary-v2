import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const COINS = ['bitcoin', 'ethereum', 'solana', 'ripple'];
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];

const BASE_DERIBIT = 'https://www.deribit.com/api/v2/public';

function lastValue(chart: any[]): number {
  if (!chart || chart.length === 0) return 0;
  return chart[chart.length - 1].v || 0;
}

async function getCoinalyze() {
  try {
    const cached = await redis.get('coinalyze:data');
    if (!cached) return null;
    const raw: any = typeof cached === 'string' ? JSON.parse(cached) : cached;
    const fundCharts = raw.fundCharts || {};
    const fundChart24h = fundCharts?.total?.['24h'] || raw.fundChart || [];
    const currentFunding = raw.avgFunding ||
      (fundChart24h.length ? fundChart24h[fundChart24h.length - 1].v : 0);
    const rawByAsset = raw.fundingByAsset || {};
    const fundingByAsset = {
      ALL: rawByAsset.ALL || currentFunding,
      BTC: rawByAsset.BTC || lastValue(fundCharts?.BTC?.['24h'] || []),
      ETH: rawByAsset.ETH || lastValue(fundCharts?.ETH?.['24h'] || []),
      SOL: rawByAsset.SOL || lastValue(fundCharts?.SOL?.['24h'] || []),
      XRP: rawByAsset.XRP || lastValue(fundCharts?.XRP?.['24h'] || []),
    };
    return {
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
    };
  } catch { return null; }
}

async function getPrices() {
  try {
    const [markets, global] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINS.join(',')}&price_change_percentage=24h&x_cg_demo_api_key=${COINGECKO_KEY}`, { next: { revalidate: 60 } }).then(r => r.json()),
      fetch(`https://api.coingecko.com/api/v3/global?x_cg_demo_api_key=${COINGECKO_KEY}`, { next: { revalidate: 60 } }).then(r => r.json()),
    ]);
    const prices: Record<string, any> = {};
    if (Array.isArray(markets)) {
      markets.forEach((coin: any) => {
        const idx = COINS.indexOf(coin.id);
        if (idx !== -1) prices[SYMBOLS[idx]] = { price: coin.current_price, change24h: coin.price_change_percentage_24h, marketCap: coin.market_cap, volume24h: coin.total_volume };
      });
    }
    const globalData = global?.data || {};
    return { prices, globalMarketCap: globalData.total_market_cap?.usd || 0, globalVolume24h: globalData.total_volume?.usd || 0, btcDominance: globalData.market_cap_percentage?.btc || 0, ethDominance: globalData.market_cap_percentage?.eth || 0, updatedAt: Date.now() };
  } catch { return null; }
}

async function fetchDeribit(method: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_DERIBIT}/${method}?${query}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Deribit ${method} failed`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getDeribit() {
  try {
    const now = Date.now();
    const [btcVolData, ethVolData] = await Promise.all([
      fetchDeribit('get_volatility_index_data', { currency: 'BTC', start_timestamp: String(now - 86400000), end_timestamp: String(now), resolution: '3600' }),
      fetchDeribit('get_volatility_index_data', { currency: 'ETH', start_timestamp: String(now - 86400000), end_timestamp: String(now), resolution: '3600' }),
    ]);
    const toChart = (d: any) => (d?.data || []).map((p: number[]) => ({ t: Math.floor(p[0] / 1000), v: p[4] }));
    const btc24h = toChart(btcVolData);
    const btcCurrent = btc24h.length ? btc24h[btc24h.length - 1].v : null;
    return { dvol: { current: btcCurrent, chartsByAsset: { BTC: { '24h': btc24h }, ETH: { '24h': toChart(ethVolData) } } }, skew: { value25d: null, interpretation: 'unavailable', BTC: { value25d: null }, ETH: { value25d: null } }, basis: null, updatedAt: Date.now() };
  } catch { return null; }
}

async function getFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 3600 } });
    const json = await res.json();
    const item = json?.data?.[0];
    if (!item) return null;
    return { value: parseInt(item.value), label: item.value_classification, updatedAt: Date.now() };
  } catch { return null; }
}

async function getETF() {
  try {
    const res = await fetch('https://farside.co.uk/bitcoin-etf-flow-all-data/', { next: { revalidate: 3600 } });
    const html = await res.text();
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let latest = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const cells = rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cells.length > 1) {
        const text = cells[cells.length - 1].replace(/<[^>]+>/g, '').trim();
        const val = parseFloat(text.replace(/,/g, ''));
        if (!isNaN(val)) { latest = val; break; }
      }
    }
    return { btc: { latest }, eth: { latest: null }, updatedAt: Date.now() };
  } catch { return null; }
}

async function getSpotVolume() {
  try {
    const cached = await redis.get('spotvolume:data');
    if (!cached) return null;
    return typeof cached === 'string' ? JSON.parse(cached) : cached;
  } catch { return null; }
}

export async function GET() {
  const [coinalyze, deribit, feargreed, etf, prices, spotvolume] = await Promise.allSettled([
    getCoinalyze(),
    getDeribit(),
    getFearGreed(),
    getETF(),
    getPrices(),
    getSpotVolume(),
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
