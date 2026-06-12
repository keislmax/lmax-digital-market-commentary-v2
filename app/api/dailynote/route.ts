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

// SOL/XRP funding from Coinalyze daily history: mean of last 7 daily
// rates annualised (x3 settlements x365), and the prior week's mean.
function coinalyzeFundingApy(points: { t: number; v: number }[] | undefined) {
  const pts = (points || []).filter(p => typeof p?.v === 'number');
  if (pts.length < 8) return { today: null as number | null, sevenDaysAgo: null as number | null };
  const sorted = [...pts].sort((a, b) => a.t - b.t);
  const mean = (arr: { v: number }[]) => arr.reduce((s, p) => s + p.v, 0) / arr.length;
  const last7 = sorted.slice(-7);
  const prev7 = sorted.slice(-14, -7);
  const today = last7.length ? mean(last7) * 3 * 365 * 100 : null;
  const sevenDaysAgo = prev7.length >= 4 ? mean(prev7) * 3 * 365 * 100 : null;
  return { today, sevenDaysAgo };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prices: priceMap, theblock: tb, coinalyze: c, etf: etfFarside } = body;

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
    const stablecoins = tb?.stablecoins?.latest ?? null;
    const rwa = tb?.rwa?.latest ?? null;
    const btcDom = priceMap?.btcDominance ?? null;

    // ---- Section 2: Funding, liquidation and leverage ----
    const solFunding = coinalyzeFundingApy(c?.fundingRate?.chartsByAsset?.SOL?.['30d']);
    const xrpFunding = coinalyzeFundingApy(c?.fundingRate?.chartsByAsset?.XRP?.['30d']);

    const fundingRows = [
      { asset: 'BTC', today: tb?.funding?.btc?.headline ?? null, sevenDaysAgo: tb?.funding?.btc?.headline7dAgo ?? null, source: 'block' },
      { asset: 'ETH', today: tb?.funding?.eth?.headline ?? null, sevenDaysAgo: tb?.funding?.eth?.headline7dAgo ?? null, source: 'block' },
      { asset: 'SOL', today: solFunding.today, sevenDaysAgo: solFunding.sevenDaysAgo, source: 'coinalyze' },
      { asset: 'XRP', today: xrpFunding.today, sevenDaysAgo: xrpFunding.sevenDaysAgo, source: 'coinalyze' },
      { asset: 'HYPE', today: null, sevenDaysAgo: null, source: 'none' },
    ];
    const totalLiqs = c?.liquidations?.total24h ?? null;
    const longsLiqs = c?.liquidations?.longs24h ?? null;
    const shortsLiqs = c?.liquidations?.shorts24h ?? null;

    // ---- Section 3: Options ----
    const btcIv7 = tb?.options?.ivBtc?.series?.['ATM 7']?.latest ?? null;
    const btcIv30 = tb?.options?.ivBtc?.series?.['ATM 30']?.latest ?? null;
    const ethIv7 = tb?.options?.ivEth?.series?.['ATM 7']?.latest ?? null;
    const ethIv30 = tb?.options?.ivEth?.series?.['ATM 30']?.latest ?? null;
    const optOiBtc = tb?.options?.oiBtc?.latest ?? null;
    const optOiEth = tb?.options?.oiEth?.latest ?? null;

    // ---- Section 4: ETF ----
    const etfRows = [
      { asset: 'BTC', flow: tb?.etf?.flowsBtc?.latestFlow ?? null, aum: tb?.etf?.aumBtc?.latest ?? null, aum30d: tb?.etf?.aumBtc?.thirtyDaysAgo ?? null },
      { asset: 'ETH', flow: tb?.etf?.flowsEth?.latestFlow ?? null, aum: tb?.etf?.aumEth?.latest ?? null, aum30d: tb?.etf?.aumEth?.thirtyDaysAgo ?? null },
      { asset: 'SOL', flow: typeof etfFarside?.sol?.latest?.total === 'number' ? etfFarside.sol.latest.total * 1e6 : null, aum: null, aum30d: null },
      { asset: 'HYPE', flow: tb?.etf?.flowsHype?.latestFlow ?? null, aum: null, aum30d: null },
    ];
    const strategyHoldings = tb?.strategy?.series?.['MicroStrategy Bitcoin Holdings']?.latest ?? null;
    const strategyAvgPrice = tb?.strategy?.series?.['Average BTC Purchase Price']?.latest ?? null;
    const btcPrice = prices['BTC']?.price ?? null;
    const strategyValue = strategyHoldings != null && btcPrice != null ? strategyHoldings * btcPrice : null;

    const dateStr = new Date().toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return NextResponse.json({
      dateStr,
      spot: { rows: spotRows, stablecoins, rwa, btcDominance: btcDom },
      funding: { rows: fundingRows, totalLiqs, longsLiqs, shortsLiqs },
      options: { btcIv7, btcRv7, btcIv30, btcRv30, ethIv7, ethRv7, ethIv30, ethRv30, optOiBtc, optOiEth },
      etf: { rows: etfRows, strategyValue, strategyHoldings, strategyAvgPrice },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
