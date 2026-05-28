import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import Anthropic from '@anthropic-ai/sdk';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a senior crypto market analyst writing a daily briefing for professional traders and institutional clients at LMAX Digital, a regulated crypto exchange. Your audience trades size, thinks in risk, and has zero patience for surface-level commentary.

Your briefing should read like it came from a trader who has already spent 2 hours on the desk — sharp, opinionated, and grounded in what actually moved markets. It should feel like a Bloomberg terminal note, not a data summary.

LEAD WITH NARRATIVE, NOT NUMBERS. The data supports the story — it does not lead it. Never open with a statistic. Open with what happened and why it matters to positioning.

PRIORITISE in this order:
1. The macro narrative — what is the dominant story driving crypto today (risk-off, squeeze, flush, accumulation, rotation, regime change)
2. Liquidation narratives — not just the number but the story (who got caught offside, what triggered it, was it mechanical or conviction)
3. Institutional flows — ETF in/outflows, corporate treasury moves, large block trades, notable wallet activity
4. Cross-asset context — how equities, gold, DXY, and rates are interacting with crypto today
5. Key technical levels and why they matter to positioning right now
6. Options and volatility — skew, DVOL, basis, what the derivatives market is pricing in vs realised
7. Geopolitical or macro risk directly moving risk appetite today
8. Notable market chatter from influential analysts, on-chain trackers, or institutional desks

DEPRIORITISE:
- Central bank commentary unless it directly caused a move today
- Regulatory headlines unless they are actionable or market-moving
- Listing metrics one by one — weave data into the narrative, don't enumerate it

TONE:
- Direct, authoritative, clinical. Written like a senior analyst typing fast between positions.
- No humour, no lightness — this is a professional briefing.
- No em-dashes. Ellipses are fine to trail off implications ("...will weigh on risk appetite into the week").
- Trader language used naturally but not forced — "flush", "squeeze", "bid", "offered", "basis", "contango", "caught offside", "de-risking".
- 4-6 sentences, dense. Every sentence earns its place.
- Numbers appear inside sentences to support a point, never as the opening or as a list.
- End with one specific thing to watch — a level, an event, a position building that could resolve in the next 24-48H.

FORMAT:
Return plain text only. No headers, no bullet points, no markdown. Just the paragraph.

EXAMPLE OF GOOD TONE (do not copy, just match the style):
"Risk appetite is fragile after last night's long flush, which cleared the crowded positioning that had built through the week without triggering a trend reversal. Spot held the key level, but the derivatives market is telling a more cautious story — puts are bid up and basis has compressed, suggesting institutional desks are hedging rather than adding. ETF flows came in softer than expected, removing a demand catalyst the bulls were counting on. Watch whether BTC can reclaim and hold above the 72k level into the US open; failure there opens the door to another leg lower as leveraged longs that survived last night's flush face margin pressure again."`;

function buildUserPrompt(data: any): string {
  const c = data?.coinalyze;
  const prices = data?.prices?.prices;

  const btcPrice = prices?.BTC?.price ?? 'N/A';
  const btcChange = prices?.BTC?.change24h ?? 'N/A';
  const ethPrice = prices?.ETH?.price ?? 'N/A';
  const ethChange = prices?.ETH?.change24h ?? 'N/A';
  const solPrice = prices?.SOL?.price ?? 'N/A';
  const xrpPrice = prices?.XRP?.price ?? 'N/A';

  const oi = c?.openInterest?.current ?? 'N/A';
  const oiChange = c?.openInterest?.change24h ?? 'N/A';
  const totalLiqs = c?.liquidations?.total24h ?? 'N/A';
  const longLiqs = c?.liquidations?.longs24h ?? 'N/A';
  const shortLiqs = c?.liquidations?.shorts24h ?? 'N/A';
  const funding = c?.fundingRate?.current ?? 'N/A';
  const fundingByAsset = c?.fundingRate?.byAsset ?? {};

  const today = new Date().toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `Today is ${today}.

Here is the live market data. Use this as your factual foundation, then draw on your knowledge of recent market events and news to write the briefing.

LIVE MARKET DATA:

Spot prices:
- BTC: $${btcPrice} (${typeof btcChange === 'number' ? btcChange.toFixed(2) : btcChange}% 24H)
- ETH: $${ethPrice} (${typeof ethChange === 'number' ? ethChange.toFixed(2) : ethChange}% 24H)
- SOL: $${solPrice}
- XRP: $${xrpPrice}

Derivatives:
- Open Interest: $${typeof oi === 'number' ? (oi/1e9).toFixed(2) + 'B' : oi} (${typeof oiChange === 'number' ? oiChange.toFixed(2) : oiChange}% 24H change)
- Total Liquidations 24H: $${typeof totalLiqs === 'number' ? (totalLiqs/1e6).toFixed(1) + 'M' : totalLiqs}
  - Longs liquidated: $${typeof longLiqs === 'number' ? (longLiqs/1e6).toFixed(1) + 'M' : longLiqs}
  - Shorts liquidated: $${typeof shortLiqs === 'number' ? (shortLiqs/1e6).toFixed(1) + 'M' : shortLiqs}
- Funding rate (avg): ${typeof funding === 'number' ? (funding * 100).toFixed(4) + '%' : funding}
  - BTC: ${typeof fundingByAsset.BTC === 'number' ? (fundingByAsset.BTC * 100).toFixed(4) + '%' : 'N/A'}
  - ETH: ${typeof fundingByAsset.ETH === 'number' ? (fundingByAsset.ETH * 100).toFixed(4) + '%' : 'N/A'}
  - SOL: ${typeof fundingByAsset.SOL === 'number' ? (fundingByAsset.SOL * 100).toFixed(4) + '%' : 'N/A'}
  - XRP: ${typeof fundingByAsset.XRP === 'number' ? (fundingByAsset.XRP * 100).toFixed(4) + '%' : 'N/A'}

Now write the briefing. Draw on your knowledge of what has been happening in crypto markets, macro, and geopolitics recently to add context beyond the raw numbers above.`;
}

export async function POST() {
  try {
    const [cached, pricesRes] = await Promise.all([
      redis.get('coinalyze:data'),
      fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,ripple&price_change_percentage=24h&x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}`,
        { cache: 'no-store' }
      ).then(r => r.json()),
    ]);

    const raw: any = cached ? (typeof cached === 'string' ? JSON.parse(cached) : cached) : {};
    const symbols = ['BTC', 'ETH', 'SOL', 'XRP'];
    const coinIds = ['bitcoin', 'ethereum', 'solana', 'ripple'];
    const priceMap: Record<string, any> = {};
    if (Array.isArray(pricesRes)) {
      pricesRes.forEach((coin: any) => {
        const idx = coinIds.indexOf(coin.id);
        if (idx !== -1) priceMap[symbols[idx]] = { price: coin.current_price, change24h: coin.price_change_percentage_24h };
      });
    }

    const allData = {
      coinalyze: {
        openInterest: { current: raw.totalOI, change24h: raw.oiChange24h },
        liquidations: { total24h: raw.totalLiqs24h, longs24h: raw.totalLongLiqs24h, shorts24h: raw.totalShortLiqs24h },
        fundingRate: { current: raw.avgFunding, byAsset: raw.fundingByAsset || {} },
      },
      prices: { prices: priceMap },
    };

    const userPrompt = buildUserPrompt(allData);

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const commentary = message.content[0].type === 'text' ? message.content[0].text : 'Commentary unavailable.';

    return NextResponse.json({
      commentary,
      generatedAt: Date.now(),
    });
  } catch (err: any) {
    console.error('[commentary error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
