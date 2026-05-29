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

BEFORE WRITING: Use the web search tool to find today's most relevant news and market developments. Run AT LEAST 5 separate searches covering different angles:
1. "bitcoin crypto market news today" — general market drivers
2. "bitcoin ETF flows institutional today" — ETF and institutional activity
3. "macro rates DXY equities crypto today" — cross-asset context
4. "Kobeissi Letter OR ZeroHedge crypto markets today" — analyst commentary
5. "bitcoin liquidations on-chain derivatives today" — derivatives and positioning

You MUST search multiple different sources. Do not rely on a single outlet. If your first searches return mostly CoinDesk results, run additional searches targeting other outlets: zerohedge.com, theblock.co, decrypt.co, bloomberg.com crypto, reuters.com crypto, ft.com crypto.

SUPPLEMENTARY SOURCES — search for recent posts or coverage from these accounts. Use what you find to supplement the narrative — only reference something if you actually found it, never fabricate:
- Kobeissi Letter markets crypto (kobeissiletter.com or x.com/KobeisseiLetter)
- Eric Balchunas bitcoin ETF (x.com/EricBalchunas or Bloomberg ETF coverage)
- aixbt_agent crypto analysis (x.com/aixbt_agent)
- BullTheory crypto (x.com/BullTheoryio)
- CoinDesk news today (coindesk.com)
- Zero Hedge markets today (zerohedge.com)
- The Block crypto news (theblock.co)
- Decrypt crypto news (decrypt.co)
- Barchart crypto options today
- Kalshi crypto prediction markets

LEAD WITH THE DOMINANT NARRATIVE OF THE DAY. Ask yourself: what is the single most important thing happening in crypto markets right now? That is your opening. It might be a macro event, a liquidation cascade, an ETF flow surprise, a geopolitical development, or a sentiment shift. Whatever is most market-moving leads — not the data.

The live market data you are given is context and supporting evidence. Do not summarise it. Use it to validate or challenge the narrative. A good briefing weaves one or two key numbers into a sentence naturally — it does not list metrics.

DRAW ON ALL OF THESE AND PICK WHAT IS MOST RELEVANT TODAY:
- Macro and cross-asset context: equities, DXY, rates, gold, oil and how they are interacting with crypto
- Derivatives positioning: OI builds or unwinds, liquidation narratives (who got caught offside and why), funding rate extremes
- Social and analyst sentiment: what influential crypto accounts, on-chain trackers and institutional desks are saying today
- Institutional flows: ETF in/outflows, corporate treasury moves, large block activity
- Options and volatility: skew, DVOL, basis, what derivatives are pricing in vs realised
- Technical levels that matter to positioning right now
- Geopolitical or regulatory risk that is directly moving risk appetite

TONE:
- Direct, authoritative, clinical. Written like a senior analyst typing fast between positions.
- No humour, no lightness — this is a professional briefing.
- No em-dashes. Ellipses are fine to trail off implications ("...will weigh on risk appetite into the week").
- Trader language used naturally but not forced — "flush", "squeeze", "bid", "offered", "basis", "caught offside", "de-risking", "contango".
- 4-6 sentences, dense. Every sentence earns its place.
- Numbers appear inside sentences to support a point, never as the opening or as a list.
- End with one specific thing to watch — a level, an event, or a position building that could resolve in the next 24-48H.
- Write in neutral third-person analyst voice throughout. No first-person ("I", "my"). No second-person ("your"). Just "funding rates show...", "OI contracted...", "the market is pricing...".

FORMAT:
You must return a valid JSON object with exactly two fields:
{
  "commentary": "the briefing paragraph as a single clean string with no line breaks and no citation tags",
  "sources": [
    { "title": "short source label", "url": "https://..." },
    ...
  ]
}

Rules:
- "commentary" must be one clean unbroken paragraph. No line breaks. No citation tags like <cite> or [1] or any inline references. No preamble. Open directly with the market narrative.
- "sources" must contain a diverse mix of outlets — not all from the same domain. Maximum 5 sources. Only include URLs you actually retrieved. Do not fabricate URLs.
- Return raw JSON only. No markdown code fences, no explanation outside the JSON.`;

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

  const today = new Date().toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return `Today is ${today}.

Run at least 5 separate web searches across different topics and sources before writing. Focus on news from the last 24 hours only. Make sure your searches cover different outlets — not just one news site.

Here is the live market data to weave into the briefing:

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

Now search, then return the JSON object only. No preamble. No markdown. Raw JSON. The commentary field must contain no citation tags.`;
}

function stripCitations(text: string): string {
  return text
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
        if (idx !== -1) priceMap[symbols[idx]] = {
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
        };
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

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' } as any],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawText = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text.trim())
      .join(' ')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let commentary = 'Commentary unavailable.';
    let sources: { title: string; url: string }[] = [];

    try {
      const clean = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        commentary = stripCitations(parsed.commentary?.trim() || commentary);
        sources = Array.isArray(parsed.sources) ? parsed.sources.slice(0, 5) : [];
      }
    } catch {
      commentary = stripCitations(rawText.replace(/\{[\s\S]*\}/, '').trim() || rawText);
    }

    return NextResponse.json({
      commentary,
      sources,
      generatedAt: Date.now(),
    });
  } catch (err: any) {
    console.error('[commentary error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
