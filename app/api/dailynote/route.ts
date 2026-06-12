import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}
function fmtUSD(v: number | null | undefined): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtFlow(v: number | null | undefined): string {
  if (v == null) return '—';
  const s = fmtUSD(Math.abs(v));
  return v >= 0 ? '+' + s : '-' + s;
}
function pctChange(latest?: number | null, prev?: number | null): number | null {
  if (typeof latest !== 'number' || typeof prev !== 'number' || prev === 0) return null;
  return ((latest - prev) / Math.abs(prev)) * 100;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prices: priceMap, theblock: tb, coinalyze: c, etf: etfFarside, deribit: d } = body;

    const prices = priceMap?.prices || {};
    const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'HYPE'] as const;

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
    const fundingRows = ASSETS.map(a => {
      const lower = a.toLowerCase() as 'btc' | 'eth' | 'sol' | 'xrp' | 'hype';
      const m = tb?.funding?.[lower];
      return {
        asset: a,
        today: m?.headline ?? null,
        sevenDaysAgo: m?.headline7dAgo ?? null,
      };
    });
    const totalLiqs = c?.liquidations?.total24h ?? null;
    const longsLiqs = c?.liquidations?.longs24h ?? null;
    const shortsLiqs = c?.liquidations?.shorts24h ?? null;

    // ---- Section 3: Options ----
    const btcIvBtc7 = tb?.options?.ivBtc?.series?.['ATM 7']?.latest ?? null;
    const btcIvBtc7rv = tb?.options?.realizedVolBtc?.series?.['Annualized Volatility']?.latest ?? null;
    const btcIvBtc30 = tb?.options?.ivBtc?.series?.['ATM 30']?.latest ?? null;
    const btcIvBtc30rv = tb?.options?.realizedVolBtc?.series?.['Annualized Volatility']?.sevenDaysAgo ?? null;
    const ethIvEth7 = tb?.options?.ivEth?.series?.['ATM 7']?.latest ?? null;
    const ethIvEth30 = tb?.options?.ivEth?.series?.['ATM 30']?.latest ?? null;
    const optOiBtc = tb?.options?.oiBtc?.latest ?? null;
    const optOiEth = tb?.options?.oiEth?.latest ?? null;

    // ---- Section 4: ETF ----
    const etfRows = [
      { asset: 'BTC', flow: tb?.etf?.flowsBtc?.latestFlow ?? null, aum: tb?.etf?.aumBtc?.latest ?? null, aum30d: tb?.etf?.aumBtc?.thirtyDaysAgo ?? null },
      { asset: 'ETH', flow: tb?.etf?.flowsEth?.latestFlow ?? null, aum: tb?.etf?.aumEth?.latest ?? null, aum30d: tb?.etf?.aumEth?.thirtyDaysAgo ?? null },
      { asset: 'SOL', flow: etfFarside?.sol?.totalFlow ?? null, aum: null, aum30d: null },
      { asset: 'HYPE', flow: tb?.etf?.flowsHype?.latestFlow ?? null, aum: null, aum30d: null },
    ];
    const strategyHoldings = tb?.strategy?.series?.['MicroStrategy Bitcoin Holdings']?.latest ?? null;
    const strategyAvgPrice = tb?.strategy?.series?.['Average BTC Purchase Price']?.latest ?? null;
    const btcPrice = prices['BTC']?.price ?? null;
    const strategyValue = strategyHoldings != null && btcPrice != null ? strategyHoldings * btcPrice : null;

    // ---- Build date string ----
    const dateStr = new Date().toLocaleDateString('en-SG', {
      timeZone: 'Asia/Singapore',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    return NextResponse.json({
      dateStr,
      spot: { rows: spotRows, stablecoins, rwa, btcDominance: btcDom },
      funding: { rows: fundingRows, totalLiqs, longsLiqs, shortsLiqs },
      options: { btcIv7: btcIvBtc7, btcRv7: btcIvBtc7rv, btcIv30: btcIvBtc30, btcRv30: btcIvBtc30rv, ethIv7: ethIvEth7, ethIv30: ethIvEth30, optOiBtc, optOiEth },
      etf: { rows: etfRows, strategyValue, strategyHoldings, strategyAvgPrice },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
