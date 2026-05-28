import { NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a senior crypto market analyst writing a daily briefing for professional traders and institutional clients at LMAX Digital, a regulated crypto exchange. Your audience trades size, thinks in risk, and has zero patience for surface-level commentary.

Your briefing should read like it came from a trader who has already spent 2 hours on the desk — sharp, opinionated, and grounded in what actually moved markets.

PRIORITISE in this order:
1. On-chain and derivatives positioning — what are whales doing, who got liquidated and why, where is OI building or unwinding
2. Liquidation narratives — not just the number but the story (squeeze vs flush, who was caught offside)
3. Institutional flows — ETF in/outflows, corporate treasury moves, large block trades, notable wallet activity
4. Key technical levels traders are watching and why they matter
5. Options and volatility — skew, DVOL, basis, what the derivatives market is pricing in
6. Cross-asset context — how equities, gold, oil, and DXY are interacting with crypto today
7. Geopolitical risk where it is directly moving risk appetite
8. Notable market chatter — what influential accounts, analysts and on-chain trackers are saying

DEPRIORITISE:
- Central bank commentary unless it directly caused a move today
- Regulatory headlines unless they are actionable or market-moving
- Generic price description ("BTC is up X%") — lead with why, not what

TONE:
- Direct, authoritative, clinical. Written like a senior analyst typing fast between positions.
- No humour, no lightness — this is a professional briefing.
- No em-dashes. Ellipses are fine to trail off implications ("...will weigh on risk appetite into the week").
- Trader language used naturally but not forced — "flush", "squeeze", "bid", "offered", "basis", "contango".
- 4-6 sentences, dense. Every sentence earns its place.
- End with one specific thing to watch — a level, an event, a position building that could resolve in the next 24-48H.

FORMAT:
Return plain text only. No headers, no bullet points, no markdown. Just the paragraph.`;

function buildUserPrompt(data: any): string {
  const c = data?.coinalyze;
  const d = data?.deribit;
  const fg = data?.feargreed;
  const etf = data?.etf;
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

  const dvol = d?.dvol?.current ?? 'N/A';
  const skew = d?.skew?.BTC?.value25d ?? 'N/A';
  const skewInterp = d?.skew?.BTC?.interpretation ?? 'N/A';
  const basis = d?.basis?.basis ?? 'N/A';
  const basisExpiry = d?.basis?.expiry ?? 'N/A';
  const basisDays = d?.basis?.daysToExpiry ?? 'N/A';

  const fearGreed = fg?.value ?? 'N/A';
  const fearGreedLabel = fg?.label ?? 'N/A';

  const btcEtf = etf?.btc?.latest ?? 'N/A';
  const ethEtf = etf?.eth?.latest ?? 'N/A';

  const today = new Date().toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `Today is ${today}.

Here is the live market data. Use this as your factual foundation, then use your knowledge of recent market events and news to write the briefing.

LIVE MARKET DATA:

Spot prices:
- BTC: $${btcPrice} (${btcChange}% 24H)
- ETH: $${ethPrice} (${ethChange}% 24H)
- SOL: $${solPrice}
- XRP: $${xrpPrice}

Derivatives:
- Open Interest: $${typeof oi === 'number' ? (oi/1e9).toFixed(2) + 'B' : oi} (${oiChange}% 24H change)
- Total Liquidations 24H: $${typeof totalLiqs === 'number' ? (totalLiqs/1e6).toFixed(1) + 'M' : totalLiqs}
  - Longs liquidated: $${typeof longLiqs === 'number' ? (longLiqs/1e6).toFixed(1) + 'M' : longLiqs}
  - Shorts liquidated: $${typeof shortLiqs === 'number' ? (shortLiqs/1e6).toFixed(1) + 'M' : shortLiqs}
- Funding rate (avg): ${typeof funding === 'number' ? (funding * 100).toFixed(4) + '%' : funding}
  - BTC: ${typeof fundingByAsset.BTC === 'number' ? (fundingByAsset.BTC * 100).toFixed(4) + '%' : 'N/A'}
  - ETH: ${typeof fundingByAsset.ETH === 'number' ? (fundingByAsset.ETH * 100).toFixed(4) + '%' : 'N/A'}
  - SOL: ${typeof fundingByAsset.SOL === 'number' ? (fundingByAsset.SOL * 100).toFixed(4) + '%' : 'N/A'}
  - XRP: ${typeof fundingByAsset.XRP === 'number' ? (fundingByAsset.XRP * 100).toFixed(4) + '%' : 'N/A'}

Options (Deribit):
- BTC DVOL (30D implied vol): ${dvol}%
- 25-delta put/call skew: ${typeof skew === 'number' ? skew.toFixed(1) : skew} (${skewInterp})
- BTC futures basis: ${basis}% annualised (${basisExpiry}, ${basisDays} days to expiry)

Sentiment:
- Fear & Greed Index: ${fearGreed} — ${fearGreedLabel}

ETF flows (latest session):
- BTC ETFs: $${btcEtf}M
- ETH ETFs: $${ethEtf}M

Now write the briefing. Draw on your knowledge of what has been happening in crypto markets, macro, and geopolitics recently to add context beyond the raw numbers above.`;
}

export async function POST(request: Request) {
  try {
    const { origin } = new URL(request.url);

    const allRes = await fetch(`${origin}/api/all`);
    const allData = await allRes.json();

    const userPrompt = buildUserPrompt(allData);
    console.log('GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${err}`);
    }

    const result = await response.json();
    const commentary = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Commentary unavailable.';

    return NextResponse.json({
      commentary,
      generatedAt: Date.now(),
    });
  } catch (err: any) {
    console.error('[commentary error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
