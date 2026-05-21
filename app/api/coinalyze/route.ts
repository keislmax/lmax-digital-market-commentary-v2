import { NextResponse } from 'next/server';

async function safeFetch(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ---- BINANCE ----
// BTC/ETH/SOL/XRP perps only (no all-symbols endpoint exists)
async function getBinanceTotal() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];

  const [oiResults, premiumIndex] = await Promise.all([
    Promise.all(symbols.map(async sym => {
      const [oi, price] = await Promise.all([
        safeFetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`),
        safeFetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`),
      ]);
      return parseFloat(oi?.openInterest || '0') * parseFloat(price?.price || '0');
    })),
    safeFetch('https://fapi.binance.com/fapi/v1/premiumIndex'),
  ]);

  const totalOI = oiResults.reduce((a, b) => a + b, 0);

  let btcFunding = 0, ethFunding = 0, solFunding = 0, xrpFunding = 0;
  if (Array.isArray(premiumIndex)) {
    const find = (sym: string) => parseFloat((premiumIndex as any[]).find(p => p.symbol === sym)?.lastFundingRate || '0');
    btcFunding = find('BTCUSDT');
    ethFunding = find('ETHUSDT');
    solFunding = find('SOLUSDT');
    xrpFunding = find('XRPUSDT');
  }

  return { totalOI, btcFunding, ethFunding, solFunding, xrpFunding };
}

// ---- BYBIT ----
// All linear contracts — true total
async function getBybitTotal() {
  let totalOI = 0;
  let btcFunding = 0, ethFunding = 0, solFunding = 0, xrpFunding = 0;
  let cursor = '';

  for (let i = 0; i < 5; i++) {
    const url = `https://api.bybit.com/v5/market/tickers?category=linear${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await safeFetch(url);
    const list = data?.result?.list;
    if (!Array.isArray(list)) break;

    for (const item of list) {
      totalOI += parseFloat(item.openInterestValue || '0');
      if (item.symbol === 'BTCUSDT') btcFunding = parseFloat(item.fundingRate || '0');
      if (item.symbol === 'ETHUSDT') ethFunding = parseFloat(item.fundingRate || '0');
      if (item.symbol === 'SOLUSDT') solFunding = parseFloat(item.fundingRate || '0');
      if (item.symbol === 'XRPUSDT') xrpFunding = parseFloat(item.fundingRate || '0');
    }

    cursor = data?.result?.nextPageCursor || '';
    if (!cursor) break;
  }

  return { totalOI, btcFunding, ethFunding, solFunding, xrpFunding };
}

// ---- OKX ----
// All SWAP contracts — true total
async function getOKXTotal() {
  const [oiData, btc, eth, sol, xrp] = await Promise.all([
    safeFetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP'),
    safeFetch('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP'),
    safeFetch('https://www.okx.com/api/v5/public/funding-rate?instId=ETH-USDT-SWAP'),
    safeFetch('https://www.okx.com/api/v5/public/funding-rate?instId=SOL-USDT-SWAP'),
    safeFetch('https://www.okx.com/api/v5/public/funding-rate?instId=XRP-USDT-SWAP'),
  ]);

  const totalOI = Array.isArray(oiData?.data)
    ? (oiData.data as any[]).reduce((sum, item) => sum + parseFloat(item.oiUsd || '0'), 0)
    : 0;

  return {
    totalOI,
    btcFunding: parseFloat(btc?.data?.[0]?.fundingRate || '0'),
    ethFunding: parseFloat(eth?.data?.[0]?.fundingRate || '0'),
    solFunding: parseFloat(sol?.data?.[0]?.fundingRate || '0'),
    xrpFunding: parseFloat(xrp?.data?.[0]?.fundingRate || '0'),
  };
}

// ---- BITGET ----
// All USDT futures — true total
async function getBitgetTotal() {
  const data = await safeFetch('https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES');
  let totalOI = 0;
  let btcFunding = 0, ethFunding = 0, solFunding = 0, xrpFunding = 0;

  if (Array.isArray(data?.data)) {
    for (const item of data.data as any[]) {
      const price = parseFloat(item.lastPr || '0');
      const oi = parseFloat(item.holdingAmount || '0');
      totalOI += oi * price;
      if (item.symbol === 'BTCUSDT') btcFunding = parseFloat(item.fundingRate || '0');
      if (item.symbol === 'ETHUSDT') ethFunding = parseFloat(item.fundingRate || '0');
      if (item.symbol === 'SOLUSDT') solFunding = parseFloat(item.fundingRate || '0');
      if (item.symbol === 'XRPUSDT') xrpFunding = parseFloat(item.fundingRate || '0');
    }
  }

  return { totalOI, btcFunding, ethFunding, solFunding, xrpFunding };
}

// ---- GATE.IO ----
// All USDT contracts — true total
async function getGateTotal() {
  const data = await safeFetch('https://api.gateio.ws/api/v4/futures/usdt/contracts');
  let totalOI = 0;
  let btcFunding = 0, ethFunding = 0, solFunding = 0, xrpFunding = 0;

  if (Array.isArray(data)) {
    for (const item of data as any[]) {
      totalOI += parseFloat(item.total_size || '0') * parseFloat(item.mark_price || '0');
      if (item.name === 'BTC_USDT') btcFunding = parseFloat(item.funding_rate || '0');
      if (item.name === 'ETH_USDT') ethFunding = parseFloat(item.funding_rate || '0');
      if (item.name === 'SOL_USDT') solFunding = parseFloat(item.funding_rate || '0');
      if (item.name === 'XRP_USDT') xrpFunding = parseFloat(item.funding_rate || '0');
    }
  }

  return { totalOI, btcFunding, ethFunding, solFunding, xrpFunding };
}

// ---- HYPERLIQUID ----
// All perpetuals — true total + liquidations
async function getHyperliquidTotal() {
  const [metaData, liqData] = await Promise.all([
    safeFetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    }),
    safeFetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'liquidations', startTime: Date.now() - 86400000 }),
    }),
  ]);

  let totalOI = 0;
  let btcFunding = 0, ethFunding = 0, solFunding = 0, xrpFunding = 0;
  let liquidations24h = 0;

  if (Array.isArray(metaData) && metaData.length === 2) {
    const [meta, ctxs] = metaData;
    (meta?.universe || []).forEach((asset: any, i: number) => {
      const ctx = ctxs[i];
      if (!ctx) return;
      totalOI += parseFloat(ctx.openInterest || '0') * parseFloat(ctx.markPx || '0');
      if (asset.name === 'BTC') btcFunding = parseFloat(ctx.funding || '0');
      if (asset.name === 'ETH') ethFunding = parseFloat(ctx.funding || '0');
      if (asset.name === 'SOL') solFunding = parseFloat(ctx.funding || '0');
      if (asset.name === 'XRP') xrpFunding = parseFloat(ctx.funding || '0');
    });
  }

  if (Array.isArray(liqData)) {
    liquidations24h = (liqData as any[]).reduce((sum, l) => sum + parseFloat(l.ntl || '0'), 0);
  }

  return { totalOI, btcFunding, ethFunding, solFunding, xrpFunding, liquidations24h };
}

// ---- OI HISTORY (Binance BTC+ETH+SOL+XRP as proxy) ----
async function getOIHistory() {
  const results = await Promise.all(
    ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'].map(sym =>
      safeFetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=1h&limit=24`)
    )
  );

  const byTime: Record<number, number> = {};
  for (const data of results) {
    if (!Array.isArray(data)) continue;
    for (const point of data as any[]) {
      const t = Math.floor(point.timestamp / 1000);
      byTime[t] = (byTime[t] || 0) + parseFloat(point.sumOpenInterestValue || '0');
    }
  }

  return Object.entries(byTime)
    .map(([t, v]) => ({ t: Number(t), v }))
    .sort((a, b) => a.t - b.t);
}

// ---- FUNDING HISTORY (Binance BTC) ----
async function getFundingHistory() {
  const data = await safeFetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=24');
  if (!Array.isArray(data)) return [];
  return (data as any[]).map(d => ({
    t: Math.floor(d.fundingTime / 1000),
    v: parseFloat(d.fundingRate),
  }));
}

function avgRates(rates: number[]) {
  const valid = rates.filter(v => v !== 0);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

export async function GET() {
  try {
    const [binance, bybit, okx, bitget, gate, hyperliquid, oiHistory, fundingHistory, priceData] =
      await Promise.all([
        getBinanceTotal(),
        getBybitTotal(),
        getOKXTotal(),
        getBitgetTotal(),
        getGateTotal(),
        getHyperliquidTotal(),
        getOIHistory(),
        getFundingHistory(),
        safeFetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT'),
      ]);

    const totalOI =
      binance.totalOI + bybit.totalOI + okx.totalOI +
      bitget.totalOI + gate.totalOI + hyperliquid.totalOI;

    const avgFunding = avgRates([
      binance.btcFunding, bybit.btcFunding, okx.btcFunding,
      bitget.btcFunding, gate.btcFunding, hyperliquid.btcFunding,
    ]);

    const oiChange24h = oiHistory.length >= 2
      ? ((oiHistory[oiHistory.length - 1].v - oiHistory[0].v) / oiHistory[0].v) * 100
      : 0;

    return NextResponse.json({
      price: parseFloat(priceData?.price || '0'),
      openInterest: {
        current: totalOI,
        change24h: oiChange24h,
        chart: oiHistory,
        byExchange: {
          binance: binance.totalOI,
          bybit: bybit.totalOI,
          okx: okx.totalOI,
          bitget: bitget.totalOI,
          gate: gate.totalOI,
          hyperliquid: hyperliquid.totalOI,
        },
        note: 'Binance reflects BTC/ETH/SOL/XRP only. All other exchanges show full market totals.',
      },
      fundingRate: {
        current: avgFunding,
        annualized: avgFunding * 3 * 365,
        chart: fundingHistory,
        byAsset: {
          BTC: avgFunding,
          ETH: avgRates([binance.ethFunding, bybit.ethFunding, okx.ethFunding, bitget.ethFunding, gate.ethFunding, hyperliquid.ethFunding]),
          SOL: avgRates([binance.solFunding, bybit.solFunding, okx.solFunding, bitget.solFunding, gate.solFunding, hyperliquid.solFunding]),
          XRP: avgRates([binance.xrpFunding, bybit.xrpFunding, okx.xrpFunding, bitget.xrpFunding, gate.xrpFunding, hyperliquid.xrpFunding]),
        },
      },
      liquidations: {
        total24h: hyperliquid.liquidations24h,
        longs24h: 0,
        shorts24h: 0,
        chart: [],
        note: 'Hyperliquid on-chain liquidations only (~7% of market). Full market liquidation data requires a paid provider.',
      },
      volume: { total24h: 0, chart: [] },
      updatedAt: Date.now(),
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
