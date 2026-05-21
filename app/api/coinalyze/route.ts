import { NextResponse } from 'next/server';

async function safeFetch(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000), cache: 'no-store' });
    if (!res.ok) return { error: res.status };
    return res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

export async function GET() {
  const [binanceOI, binancePrice, bybitTickers, gateContract, hlMeta] = await Promise.all([
    safeFetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
    safeFetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT'),
    safeFetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT'),
    safeFetch('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT'),
    safeFetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    }),
  ]);

  return NextResponse.json({
    binanceOI,
    binancePrice,
    bybitTickers,
    gateContract,
    hlMetaSample: Array.isArray(hlMeta) ? {
      universeCount: hlMeta[0]?.universe?.length,
      firstAsset: hlMeta[0]?.universe?.[0],
      firstCtx: hlMeta[1]?.[0],
    } : hlMeta,
  });
}
