import { NextResponse } from 'next/server';

const COINGECKO_KEY = process.env.COINGECKO_API_KEY;
const COINS = ['bitcoin', 'ethereum', 'solana', 'ripple'];
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP'];

export async function GET() {
  try {
    const results = await Promise.all(
      COINS.map(coin =>
        fetch(
          `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=365&interval=daily&x_cg_demo_api_key=${COINGECKO_KEY}`,
          { next: { revalidate: 3600 } }
        ).then(r => r.json())
      )
    );

    const data: Record<string, { t: number; v: number }[]> = {};
    const totalByTime: Record<number, number> = {};

    SYMBOLS.forEach((sym, i) => {
      const volumes: [number, number][] = results[i]?.total_volumes || [];
      data[sym] = volumes.map(([ts, v]) => ({ t: Math.floor(ts / 1000), v }));
      data[sym].forEach(({ t, v }) => {
        totalByTime[t] = (totalByTime[t] || 0) + v;
      });
    });

    data['total'] = Object.entries(totalByTime)
      .map(([t, v]) => ({ t: +t, v }))
      .sort((a, b) => a.t - b.t);

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
