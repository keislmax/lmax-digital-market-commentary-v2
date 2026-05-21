import { NextResponse } from 'next/server';

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const COINS = ['bitcoin', 'ethereum', 'solana', 'ripple'];
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];

export async function GET() {
  try {
    const [markets, global] = await Promise.all([
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINS.join(',')}&price_change_percentage=24h&x_cg_demo_api_key=${COINGECKO_KEY}`,
        { next: { revalidate: 60 } }
      ).then(r => r.json()),
      fetch(
        `https://api.coingecko.com/api/v3/global?x_cg_demo_api_key=${COINGECKO_KEY}`,
        { next: { revalidate: 60 } }
      ).then(r => r.json()),
    ]);

    const prices: Record<string, any> = {};
    if (Array.isArray(markets)) {
      markets.forEach((coin: any) => {
        const idx = COINS.indexOf(coin.id);
        if (idx !== -1) {
          prices[SYMBOLS[idx]] = {
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h,
            marketCap: coin.market_cap,
            volume24h: coin.total_volume,
          };
        }
      });
    }

    const globalData = global?.data || {};

    return NextResponse.json({
      prices,
      globalMarketCap: globalData.total_market_cap?.usd || 0,
      globalVolume24h: globalData.total_volume?.usd || 0,
      btcDominance: globalData.market_cap_percentage?.btc || 0,
      ethDominance: globalData.market_cap_percentage?.eth || 0,
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
