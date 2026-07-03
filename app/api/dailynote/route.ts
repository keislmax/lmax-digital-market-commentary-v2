import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;

function pctChange(latest?: number | null, prev?: number | null): number | null {
  if (typeof latest !== 'number' || typeof prev !== 'number' || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

function realizedVol(closes: number[], windowDays: number): number | null {
  if (closes.length < windowDays + 1) return null;
  const slice = closes.slice(-(windowDays + 1));
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    if (slice[i - 1] > 0 && slice[i] > 0) returns.push(Math.log(slice[i] / slice[i - 1]));
  }
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

async function fetchDailyCloses(coinId: string): Promise<number[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=35&interval=daily&x_cg_demo_api_key=${COINGECKO_KEY}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const prices: [number, number][] = json?.prices || [];
    return prices.map(p => p[1]).filter(v => typeof v === 'number' && v > 0);
  } catch { return []; }
}

function coinalyzeFundingRow(fundingRate: any, asset: string) {
  const chartsByAsset = fundingRate?.chartsByAsset || {};
  const byAsset = fundingRate?.byAsset || {};
  const series90d: { t: number; v: number }[] = chartsByAsset?.[asset]?.['90d'] || chartsByAsset?.[asset]?.['1y'] || [];
  const todayRaw = typeof byAsset?.[asset] === 'number'
    ? byAsset[asset]
    : (series90d.length ? series90d[series90d.length - 1].v : null);
  const today = todayRaw != null ? todayRaw * 3 * 365 : null;
  let sevenDaysAgoRaw: number | null = null;
  if (series90d.length) {
    const cutoff = series90d[series90d.length - 1].t - 7 * 86400;
    for (let i = series90d.length - 1; i >= 0; i--) {
      if (series90d[i].t <= cutoff) { sevenDaysAgoRaw = series90d[i].v; break; }
    }
  }
  const sevenDaysAgo = sevenDaysAgoRaw != null ? sevenDaysAgoRaw * 3 * 365 : null;
  return { today, sevenDaysAgo };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prices: priceMap, coinalyze: c, etf: etfFarside, feargreed: fg, deribit: db, macro } = body;

    const prices = priceMap?.prices || {};
    const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'HYPE'] as const;

    // ---- Realized vol (CoinGecko daily closes) ----
    const [btcCloses, ethCloses] = await Promise.all([
      fetchDailyCloses('bitcoin'),
      fetchDailyCloses('ethereum'),
    ]);
    const btcRv7  = realizedVol(btcCloses, 7);
    const btcRv30 = realizedVol(btcCloses, 30);
    const ethRv7  = realizedVol(ethCloses, 7);
    const ethRv30 = realizedVol(ethCloses, 30);

    // ATM implied vol from Deribit term structure (BTC only — ETH illiquid at short tenors)
    const btcIv7  = db?.termStructure?.d7  ?? null;
    const btcIv30 = db?.termStructure?.d30 ?? null;

    // ---- Spot performance ----
    const spotRows = ASSETS.map(a => {
      const p = prices[a];
      return {
        asset: a,
        price: p?.price ?? null,
        change1d: p?.change24h ?? null,
        change1w: p?.change7d ?? null,
        change1m: p?.change30d ?? null,
      };
    });
    const stablecoins = macro?.stablecoins?.latest ?? null;
    const rwa = macro?.rwa?.latest ?? null;
    const btcDom = priceMap?.btcDominance ?? null;
    const fgValue = fg?.current?.value ?? fg?.value ?? null;
    const fgLabel = fg?.current?.value_classification ?? fg?.current?.classification ?? fg?.value_classification ?? null;

    // ---- Funding & liquidations ----
    const fundingRows = ASSETS.map(asset => {
      const row = coinalyzeFundingRow(c?.fundingRate, asset);
      return { asset, today: row.today, sevenDaysAgo: row.sevenDaysAgo, source: 'coinalyze' };
    });
    const totalLiqs   = c?.liquidations?.total24h ?? null;
    const longsLiqs   = c?.liquidations?.longs24h ?? null;
    const shortsLiqs  = c?.liquidations?.shorts24h ?? null;
    const cgStatusOk  = c?.liquidations?.cgStatusOk ?? false;
    const cgTotalLiqs = c?.liquidations?.cgTotal24h ?? null;
    const cgLongsLiqs = c?.liquidations?.cgLongs24h ?? null;
    const cgShortsLiqs = c?.liquidations?.cgShorts24h ?? null;
    const cgTraders   = c?.liquidations?.cgTraders24h ?? null;
    const cgLargest   = c?.liquidations?.cgLargestLiquidation ?? null;

    // ---- Options ----
    const dvol     = db?.dvol?.current ?? null;
    const skew25d  = db?.skew?.BTC?.value25d ?? db?.skew?.value25d ?? null;
    const optOiBtc = db?.optionsOi?.btcUsd ?? null;
    const optOiEth = db?.optionsOi?.ethUsd ?? null;

    // ---- ETF ----
    // Flow sources: BTC/ETH/SOL/HYPE from Farside; XRP from CoinGlass (Farside doesn't track XRP)
    // AUM sources: BTC/ETH from SoSoValue (via macro.etfAum); SOL/XRP/HYPE from CoinGlass
    const farsideFlow = (key: 'btc' | 'eth' | 'sol' | 'hype'): number | null => {
      const v = etfFarside?.[key]?.latest?.total;
      return typeof v === 'number' ? v * 1e6 : null;
    };
    const etfRows = [
      {
        asset: 'BTC',
        flow: farsideFlow('btc'),
        aum: macro?.etfAum?.btc?.latest ?? null,
        aum30d: macro?.etfAum?.btc?.thirtyDaysAgo ?? null,
        flowSource: 'farside',
      },
      {
        asset: 'ETH',
        flow: farsideFlow('eth'),
        aum: macro?.etfAum?.eth?.latest ?? null,
        aum30d: macro?.etfAum?.eth?.thirtyDaysAgo ?? null,
        flowSource: 'farside',
      },
      {
        asset: 'SOL',
        flow: farsideFlow('sol'),
        // AUM: SoSoValue primary (via macro.etfAum), CoinGlass as fallback
        aum: macro?.etfAum?.sol?.latest ?? c?.solEtf?.totalMarketCap ?? null,
        aum30d: macro?.etfAum?.sol?.thirtyDaysAgo ?? null,
        flowSource: 'farside',
      },
      {
        asset: 'XRP',
        // Flow from CoinGlass (Farside doesn't track XRP ETFs)
        flow: c?.xrpEtf?.todayFlowUsd ?? null,
        // AUM: SoSoValue primary (via macro.etfAum), CoinGlass as fallback
        aum: macro?.etfAum?.xrp?.latest ?? c?.xrpEtf?.totalMarketCap ?? null,
        aum30d: macro?.etfAum?.xrp?.thirtyDaysAgo ?? null,
        flowSource: 'coinglass',
      },
      {
        asset: 'HYPE',
        flow: farsideFlow('hype'),
        // AUM from CoinGlass (market cap ≈ AUM for spot ETFs)
        aum: c?.hypeEtf?.totalMarketCap ?? null,
        aum30d: null,
        flowSource: 'farside',
      },
    ];
    const strategyHoldings = macro?.strategy?.holdings ?? null;
    const strategyAvgPrice = macro?.strategy?.avgPrice ?? null;
    const strategyValue    = macro?.strategy?.valueUsd ?? null;

    const dateStr = new Date().toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return NextResponse.json({
      dateStr,
      spot: { rows: spotRows, stablecoins, rwa, btcDominance: btcDom, fearGreed: fgValue, fearGreedLabel: fgLabel },
      funding: { rows: fundingRows, totalLiqs, longsLiqs, shortsLiqs, cgStatusOk, cgTotalLiqs, cgLongsLiqs, cgShortsLiqs, cgTraders, cgLargest },
      options: { btcRv7, btcRv30, ethRv7, ethRv30, btcIv7, btcIv30, optOiBtc, optOiEth, dvol, skew25d },
      etf: { rows: etfRows, strategyValue, strategyHoldings, strategyAvgPrice },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
