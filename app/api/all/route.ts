import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { buildTheBlockData } from '@/lib/theblock';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const COINS = ['bitcoin', 'ethereum', 'solana', 'ripple'];
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];
const BASE_DERIBIT = 'https://www.deribit.com/api/v2/public';
const ACTOR_ID = process.env.APIFY_ACTOR_ID;
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

function lastValue(chart: any[]): number {
  if (!chart || chart.length === 0) return 0;
  return chart[chart.length - 1].v || 0;
}

function getLastTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const offset = day === 0 ? 2 : day === 1 ? 3 : 1;
  const last = new Date(now);
  last.setUTCDate(now.getUTCDate() - offset);
  return last.toISOString().split('T')[0];
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

async function calcSkew(currency: string): Promise<number | null> {
  try {
    const now = Date.now();
    const sevenDays = now + 7 * 86400000;
    const thirtyDays = now + 30 * 86400000;
    const idx = await fetchDeribit('get_index_price', { index_name: `${currency.toLowerCase()}_usd` });
    const spot: number = idx?.index_price ?? 0;
    if (!spot) return null;
    const instruments: any[] = await fetchDeribit('get_instruments', { currency, kind: 'option', expired: 'false' });
    if (!Array.isArray(instruments) || !instruments.length) return null;
    const inWindow = instruments.filter(i => i.expiration_timestamp > sevenDays && i.expiration_timestamp < thirtyDays);
    if (!inWindow.length) return null;
    const nearestExpiry = Math.min(...inWindow.map(i => i.expiration_timestamp));
    const T = (nearestExpiry - now) / (365 * 86400000);
    const σ = 0.60;
    const callTarget = spot * Math.exp(0.674 * σ * Math.sqrt(T));
    const putTarget = spot * Math.exp(-0.674 * σ * Math.sqrt(T));
    const atExpiry = inWindow.filter(i => i.expiration_timestamp === nearestExpiry);
    const callCands = atExpiry.filter(i => i.option_type === 'call').sort((a, b) => Math.abs(a.strike - callTarget) - Math.abs(b.strike - callTarget)).slice(0, 3);
    const putCands = atExpiry.filter(i => i.option_type === 'put').sort((a, b) => Math.abs(a.strike - putTarget) - Math.abs(b.strike - putTarget)).slice(0, 3);
    if (!callCands.length || !putCands.length) return null;
    const tickers = await Promise.all([...callCands, ...putCands].map(i => fetchDeribit('ticker', { instrument_name: i.instrument_name })));
    const callIVs = tickers.slice(0, callCands.length).map((t: any) => t?.mark_iv as number).filter(v => typeof v === 'number' && v > 0);
    const putIVs = tickers.slice(callCands.length).map((t: any) => t?.mark_iv as number).filter(v => typeof v === 'number' && v > 0);
    if (!callIVs.length || !putIVs.length) return null;
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    const skew = avg(putIVs) - avg(callIVs);
    return Math.abs(skew) < 0.01 ? null : skew;
  } catch { return null; }
}

async function calcBasis(currency: string): Promise<{ basis: number | null; expiry: string | null; daysToExpiry: number | null }> {
  try {
    const now = Date.now();
    const thirtyDays = now + 30 * 86400000;
    const ninetyDays = now + 90 * 86400000;
    const [idx, instruments] = await Promise.all([
      fetchDeribit('get_index_price', { index_name: `${currency.toLowerCase()}_usd` }),
      fetchDeribit('get_instruments', { currency, kind: 'future', expired: 'false' }),
    ]);
    const spot: number = idx?.index_price ?? 0;
    if (!spot) return { basis: null, expiry: null, daysToExpiry: null };
    const quarterly = (instruments as any[]).filter(i => i.expiration_timestamp > thirtyDays && i.expiration_timestamp < ninetyDays && !i.instrument_name.includes('PERPETUAL'));
    if (!quarterly.length) return { basis: null, expiry: null, daysToExpiry: null };
    quarterly.sort((a, b) => a.expiration_timestamp - b.expiration_timestamp);
    const nearest = quarterly[0];
    const ticker = await fetchDeribit('ticker', { instrument_name: nearest.instrument_name });
    const futurePrice: number = ticker?.mark_price ?? 0;
    if (!futurePrice) return { basis: null, expiry: null, daysToExpiry: null };
    const daysToExpiry = (nearest.expiration_timestamp - now) / 86400000;
    const annualisedBasis = ((futurePrice - spot) / spot) * (365 / daysToExpiry) * 100;
    return { basis: Math.round(annualisedBasis * 10) / 10, expiry: nearest.instrument_name, daysToExpiry: Math.round(daysToExpiry) };
  } catch { return { basis: null, expiry: null, daysToExpiry: null }; }
}

async function calcVolTermStructure(currency: string): Promise<{ d7: number | null; d30: number | null; d90: number | null; shape: string }> {
  try {
    const now = Date.now();
    const targets = [
      { label: 'd7',  ms: 7  * 86400000 },
      { label: 'd30', ms: 30 * 86400000 },
      { label: 'd90', ms: 90 * 86400000 },
    ];
    const instruments: any[] = await fetchDeribit('get_instruments', { currency, kind: 'option', expired: 'false' });
    if (!Array.isArray(instruments) || !instruments.length) return { d7: null, d30: null, d90: null, shape: 'unavailable' };
    const idx = await fetchDeribit('get_index_price', { index_name: `${currency.toLowerCase()}_usd` });
    const spot: number = idx?.index_price ?? 0;
    if (!spot) return { d7: null, d30: null, d90: null, shape: 'unavailable' };
    const results: Record<string, number | null> = {};
    for (const target of targets) {
      try {
        const targetTs = now + target.ms;
        const withDiff = instruments.map(i => ({ ...i, diff: Math.abs(i.expiration_timestamp - targetTs) }));
        withDiff.sort((a, b) => a.diff - b.diff);
        const nearestExpiry = withDiff[0]?.expiration_timestamp;
        if (!nearestExpiry) { results[target.label] = null; continue; }
        const atExpiry = instruments.filter(i => i.expiration_timestamp === nearestExpiry);
        const calls = atExpiry.filter(i => i.option_type === 'call').sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
        if (!calls.length) { results[target.label] = null; continue; }
        const ticker = await fetchDeribit('ticker', { instrument_name: calls[0].instrument_name });
        const iv = ticker?.mark_iv;
        results[target.label] = typeof iv === 'number' && iv > 0 ? Math.round(iv * 10) / 10 : null;
      } catch {
        results[target.label] = null;
      }
    }
    const d7  = results['d7']  ?? null;
    const d30 = results['d30'] ?? null;
    const d90 = results['d90'] ?? null;
    let shape = 'unavailable';
    if (d7 !== null && d30 !== null && d90 !== null) {
      if (d7 > d30 && d30 > d90) shape = 'backwardation';
      else if (d7 < d30 && d30 < d90) shape = 'contango';
      else if (d7 > d30) shape = 'front backwardation';
      else shape = 'flat';
    }
    return { d7, d30, d90, shape };
  } catch { return { d7: null, d30: null, d90: null, shape: 'unavailable' }; }
}

async function calcPutCallRatio(currency: string): Promise<{ ratio: number | null; putOI: number | null; callOI: number | null }> {
  try {
    const instruments: any[] = await fetchDeribit('get_instruments', { currency, kind: 'option', expired: 'false' });
    if (!Array.isArray(instruments) || !instruments.length) return { ratio: null, putOI: null, callOI: null };
    const summary = await fetchDeribit('get_book_summary_by_currency', { currency, kind: 'option' });
    if (!Array.isArray(summary)) return { ratio: null, putOI: null, callOI: null };
    const typeMap: Record<string, string> = {};
    instruments.forEach(i => { typeMap[i.instrument_name] = i.option_type; });
    let putOI = 0;
    let callOI = 0;
    summary.forEach((s: any) => {
      const oi = s.open_interest ?? 0;
      const type = typeMap[s.instrument_name];
      if (type === 'put') putOI += oi;
      else if (type === 'call') callOI += oi;
    });
    if (callOI === 0) return { ratio: null, putOI, callOI };
    return { ratio: Math.round((putOI / callOI) * 100) / 100, putOI: Math.round(putOI), callOI: Math.round(callOI) };
  } catch { return { ratio: null, putOI: null, callOI: null }; }
}

async function getDeribit() {
  try {
    const now = Date.now();
    const [btcCharts, ethCharts, btcSkew, ethSkew, btcBasis, ethBasis, btcTermStructure, btcPutCall] = await Promise.all([
      Promise.all(['24h','7d','30d','90d','1y'].map((tf, i) => {
        const ms = [86400000, 7*86400000, 30*86400000, 90*86400000, 365*86400000][i];
        const res = [3600, 3600, 86400, 86400, 86400][i];
        return fetchDeribit('get_volatility_index_data', { currency: 'BTC', start_timestamp: String(now - ms), end_timestamp: String(now), resolution: String(res) });
      })),
      Promise.all(['24h','7d','30d','90d','1y'].map((tf, i) => {
        const ms = [86400000, 7*86400000, 30*86400000, 90*86400000, 365*86400000][i];
        const res = [3600, 3600, 86400, 86400, 86400][i];
        return fetchDeribit('get_volatility_index_data', { currency: 'ETH', start_timestamp: String(now - ms), end_timestamp: String(now), resolution: String(res) });
      })),
      calcSkew('BTC'),
      calcSkew('ETH'),
      calcBasis('BTC'),
      calcBasis('ETH'),
      calcVolTermStructure('BTC'),
      calcPutCallRatio('BTC'),
    ]);
    const toChart = (d: any) => (d?.data || []).map((p: number[]) => ({ t: Math.floor(p[0] / 1000), v: p[4] }));
    const tfs = ['24h','7d','30d','90d','1y'];
    const btcChartsByTf: Record<string, any[]> = {};
    const ethChartsByTf: Record<string, any[]> = {};
    tfs.forEach((tf, i) => { btcChartsByTf[tf] = toChart(btcCharts[i]); ethChartsByTf[tf] = toChart(ethCharts[i]); });
    const btcCurrent = btcChartsByTf['24h'].length ? btcChartsByTf['24h'][btcChartsByTf['24h'].length - 1].v : null;
    const interpSkew = (s: number | null) => s === null ? 'unavailable' : s > 3 ? 'bearish (puts bid up)' : s < -3 ? 'bullish (calls bid up)' : 'neutral';
    return {
      dvol: { current: btcCurrent, chartsByAsset: { BTC: btcChartsByTf, ETH: ethChartsByTf } },
      skew: {
        value25d: btcSkew === 0 ? null : btcSkew,
        interpretation: interpSkew(btcSkew),
        BTC: { value25d: btcSkew, interpretation: interpSkew(btcSkew) },
        ETH: { value25d: ethSkew === 0 ? null : ethSkew, interpretation: interpSkew(ethSkew === 0 ? null : ethSkew) },
      },
      basis: btcBasis,
      ethBasis,
      termStructure: btcTermStructure,
      putCallRatio: btcPutCall,
      skewDebug: { btc: btcSkew, eth: ethSkew },
      updatedAt: Date.now(),
    };
  } catch { return null; }
}

async function getFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=30&format=json', { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`Fear & Greed fetch failed: ${res.status}`);
    const json = await res.json();
    const data = json.data as Array<{ value: string; value_classification: string; timestamp: string }>;
    const current = data[0];
    const yesterday = data[1];
    const weekAgo = data[7];
    const monthAgo = data[29];
    const chart = data.slice(0, 30).reverse().map(d => ({ t: Number(d.timestamp), v: Number(d.value), label: d.value_classification }));
    return { current: { value: Number(current.value), label: current.value_classification }, changes: { yesterday: yesterday ? Number(current.value) - Number(yesterday.value) : null, weekAgo: weekAgo ? Number(current.value) - Number(weekAgo.value) : null, monthAgo: monthAgo ? Number(current.value) - Number(monthAgo.value) : null }, chart, updatedAt: Date.now() };
  } catch { return null; }
}

async function getETF() {
  try {
    if (!ACTOR_ID || !APIFY_TOKEN) return null;
    const runUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync?token=${APIFY_TOKEN}&outputRecordKey=OUTPUT&timeout=60`;
    const res = await fetch(runUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}), cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.btc) return null;
    const empty = (asset: string) => ({ asset, error: 'No data', lastTradingDay: getLastTradingDay() });
    return { btc: data.btc || empty('BTC'), eth: data.eth || empty('ETH'), sol: data.sol || empty('SOL'), hype: data.hype || empty('HYPE'), lastTradingDay: getLastTradingDay(), updatedAt: data.updatedAt || Date.now() };
  } catch { return null; }
}

async function getSpotVolume() {
  try {
    const results = await Promise.all(
      COINS.map(coin => fetch(`https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=365&interval=daily&x_cg_demo_api_key=${COINGECKO_KEY}`, { next: { revalidate: 3600 } }).then(r => r.json()))
    );
    const data: Record<string, { t: number; v: number }[]> = {};
    const totalByTime: Record<number, number> = {};
    SYMBOLS.forEach((sym, i) => {
      const volumes: [number, number][] = results[i]?.total_volumes || [];
      data[sym] = volumes.map(([ts, v]) => ({ t: Math.floor(ts / 1000), v }));
      data[sym].forEach(({ t, v }) => { totalByTime[t] = (totalByTime[t] || 0) + v; });
    });
    data['total'] = Object.entries(totalByTime).map(([t, v]) => ({ t: +t, v })).sort((a, b) => a.t - b.t);
    return data;
  } catch { return null; }
}

export async function GET() {
  const [coinalyze, deribit, feargreed, etf, prices, spotvolume, theblock] = await Promise.allSettled([
    getCoinalyze(),
    getDeribit(),
    getFearGreed(),
    getETF(),
    getPrices(),
    getSpotVolume(),
    buildTheBlockData(),
  ]);

  return NextResponse.json({
    coinalyze:  coinalyze.status  === 'fulfilled' ? coinalyze.value  : null,
    deribit:    deribit.status    === 'fulfilled' ? deribit.value    : null,
    feargreed:  feargreed.status  === 'fulfilled' ? feargreed.value  : null,
    etf:        etf.status        === 'fulfilled' ? etf.value        : null,
    prices:     prices.status     === 'fulfilled' ? prices.value     : null,
    spotvolume: spotvolume.status === 'fulfilled' ? spotvolume.value : null,
    theblock:   theblock.status   === 'fulfilled' ? theblock.value   : null,
    updatedAt: Date.now(),
  });
}

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
