import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;

function pctChange(latest?: number | null, prev?: number | null): number | null {
  if (typeof latest !== 'number' || typeof prev !== 'number' || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

// Annualised realized volatility from daily closes:
// stdev of daily log returns over the window, scaled by sqrt(365), in %.
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

// Funding, single source (Coinalyze, all five assets). The chartsByAsset
// series stores a mean funding rate across exchanges per timestamp — a
// computed aggregate, same caveat that triggered the original median-headline
// removal, just on a different vendor. "Today" reads the latest 24h point;
// "7 days ago" looks back from the 90d series so it has enough history
// regardless of the dashboard's currently-selected chart timeframe.
function coinalyzeFundingRow(fundingRate: any, asset: string) {
  const chartsByAsset = fundingRate?.chartsByAsset || {};
  const byAsset = fundingRate?.byAsset || {};
  const series90d: { t: number; v: number }[] = chartsByAsset?.[asset]?.['90d'] || chartsByAsset?.[asset]?.['1y'] || [];
  // "Latest" = Coinalyze's live FR AVG (current funding rate, the number shown on
  // coinalyze.net's markets page), so it's directly verifiable against the source.
  const todayRaw = typeof byAsset?.[asset] === 'number'
    ? byAsset[asset]
    : (series90d.length ? series90d[series90d.length - 1].v : null);
  const today = todayRaw != null ? todayRaw * 3 * 365 : null; // annualized: 3 settlements/day x 365, matches prior note scale
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

    // ---- Computed realized vols (CoinGecko daily closes) ----
    const [btcCloses, ethCloses] = await Promise.all([
      fetchDailyCloses('bitcoin'),
      fetchDailyCloses('ethereum'),
    ]);
    const btcRv7 = realizedVol(btcCloses, 7);
    const btcRv30 = realizedVol(btcCloses, 30);
    const ethRv7 = realizedVol(ethCloses, 7);
    const ethRv30 = realizedVol(ethCloses, 30);

    // ---- Section 1: Spot performance ----
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
    // Stablecoins & RWA now from DefiLlama (via macro), BTC dominance still
    // CoinGecko (unchanged — it was never sourced from The Block).
    const stablecoins = macro?.stablecoins?.latest ?? null;
    const rwa = macro?.rwa?.latest ?? null;
    const btcDom = priceMap?.btcDominance ?? null;
    const fgValue = fg?.current?.value ?? fg?.value ?? null;
    const fgLabel = fg?.current?.value_classification ?? fg?.current?.classification ?? fg?.value_classification ?? null;

    // ---- Section 2: Funding, liquidation and leverage ----
    // Single source for ALL five assets: Coinalyze (decision: consistency
    // over per-asset source-mixing now that The Block is fully retired).
    const fundingRows = ASSETS.map(asset => {
      const row = coinalyzeFundingRow(c?.fundingRate, asset);
      return { asset, today: row.today, sevenDaysAgo: row.sevenDaysAgo, source: 'coinalyze' };
    });
    const totalLiqs = c?.liquidations?.total24h ?? null;
    const longsLiqs = c?.liquidations?.longs24h ?? null;
    const shortsLiqs = c?.liquidations?.shorts24h ?? null;
    // CoinGlass all-market figures (prefer over Coinalyze when available)
    const cgStatusOk = c?.liquidations?.cgStatusOk ?? false;
    const cgTotalLiqs = c?.liquidations?.cgTotal24h ?? null;
    const cgLongsLiqs = c?.liquidations?.cgLongs24h ?? null;
    const cgShortsLiqs = c?.liquidations?.cgShorts24h ?? null;
    const cgTraders = c?.liquidations?.cgTraders24h ?? null;
    const cgLargest = c?.liquidations?.cgLargestLiquidation ?? null;

    // ---- Section 3: Options ----
    // The Block's multi-venue ATM vol / realized vol / options OI rows are
    // removed along with the card. Deribit DVOL, skew, and Deribit-only
    // options OI remain.
    const dvol = db?.dvol?.current ?? null;
    const skew25d = db?.skew?.BTC?.value25d ?? db?.skew?.value25d ?? null;
    const optOiBtc = db?.optionsOi?.btcUsd ?? null;
    const optOiEth = db?.optionsOi?.ethUsd ?? null;

    // ---- Section 4: ETF ----
    // Flows: Farside for all four assets (decision: drop The Block entirely).
    // AUM: SoSoValue true net assets (decision: true market value, not
    // Farside's cumulative-net-flow figure). AUM only covers BTC/ETH for now
    // (SoSoValue's documented coverage); SOL/HYPE AUM shows "Data Not Published".
    const farsideFlow = (key: 'btc' | 'eth' | 'sol' | 'xrp' | 'hype'): number | null => {
      const v = etfFarside?.[key]?.latest?.total;
      return typeof v === 'number' ? v * 1e6 : null;
    };
    const etfRows = [
      { asset: 'BTC', flow: farsideFlow('btc'), aum: macro?.etfAum?.btc?.latest ?? null, aum30d: macro?.etfAum?.btc?.thirtyDaysAgo ?? null },
      { asset: 'ETH', flow: farsideFlow('eth'), aum: macro?.etfAum?.eth?.latest ?? null, aum30d: macro?.etfAum?.eth?.thirtyDaysAgo ?? null },
      { asset: 'SOL', flow: farsideFlow('sol'), aum: macro?.etfAum?.sol?.latest ?? null, aum30d: macro?.etfAum?.sol?.thirtyDaysAgo ?? null },
      { asset: 'XRP', flow: farsideFlow('xrp'), aum: macro?.etfAum?.xrp?.latest ?? null, aum30d: macro?.etfAum?.xrp?.thirtyDaysAgo ?? null },
      { asset: 'HYPE', flow: farsideFlow('hype'), aum: null, aum30d: null },
    ];
    // Strategy holdings now from CoinGecko treasury data (via macro).
    const strategyHoldings = macro?.strategy?.holdings ?? null;
    const strategyAvgPrice = macro?.strategy?.avgPrice ?? null;
    const strategyValue = macro?.strategy?.valueUsd ?? null;

    const dateStr = new Date().toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return NextResponse.json({
      dateStr,
      spot: { rows: spotRows, stablecoins, rwa, btcDominance: btcDom, fearGreed: fgValue, fearGreedLabel: fgLabel },
      funding: { rows: fundingRows, totalLiqs, longsLiqs, shortsLiqs, cgStatusOk, cgTotalLiqs, cgLongsLiqs, cgShortsLiqs, cgTraders, cgLargest },
      options: { btcRv7, btcRv30, ethRv7, ethRv30, optOiBtc, optOiEth, dvol, skew25d },
      etf: { rows: etfRows, strategyValue, strategyHoldings, strategyAvgPrice },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
