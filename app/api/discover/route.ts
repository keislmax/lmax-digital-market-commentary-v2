// TEMPORARY DISCOVERY ROUTE - delete after Phase 0 is complete.
// Authenticates with The Block API, runs chart searches across all
// candidate metric keywords, and returns the deduplicated catalogue
// of matching charts (title, slug, type, last updated, categories).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://www.theblock.pro/api-public";

const KEYWORDS = [
  "open interest",
  "liquidations",
  "funding rate",
  "futures volume",
  "exchange volume",
  "spot volume",
  "ETF flow",
  "ETF AUM",
  "ETF",
  "implied volatility",
  "realized volatility",
  "ATM",
  "skew",
  "put call",
  "options open interest",
  "options volume",
  "basis",
  "CME",
  "stablecoin",
  "RWA",
  "tokenized",
  "dominance",
  "market cap",
  "MicroStrategy",
  "Strategy",
  "NAV",
  "Hyperliquid",
  "price",
];

type ChartResult = {
  id?: number;
  url?: string;
  type?: string;
  title?: string;
  slug?: string;
  lastUpdated?: string;
  categories?: { name?: string }[];
};

async function getAuthToken(): Promise<{ token?: string; error?: string }> {
  const email = process.env.THEBLOCK_EMAIL;
  const apiKey = process.env.THEBLOCK_API_KEY_DATA;
  if (!email || !apiKey) {
    return { error: "Missing THEBLOCK_EMAIL or THEBLOCK_API_KEY env vars" };
  }
  try {
    const res = await fetch(`${BASE}/v1/users/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, apiKey }),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        error: `Auth failed (HTTP ${res.status}): ${JSON.stringify(json).slice(0, 300)}`,
      };
    }
    // Handle the possible shapes the token might come back in
    const token =
      json?.token ??
      json?.data?.token ??
      json?.data?.accessToken ??
      json?.accessToken ??
      null;
    if (!token) {
      return {
        error: `Auth succeeded but no token found in response. Keys seen: ${Object.keys(
          json?.data ?? json ?? {}
        ).join(", ")}`,
      };
    }
    return { token };
  } catch (e) {
    return { error: `Auth request threw: ${String(e)}` };
  }
}

async function searchCharts(
  token: string,
  searchTerm: string
): Promise<{ results: ChartResult[]; error?: string }> {
  try {
    const url = `${BASE}/v1/charts/search?searchTerm=${encodeURIComponent(
      searchTerm
    )}`;
    const res = await fetch(url, {
      headers: { "x-auth-token": token },
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        results: [],
        error: `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
      };
    }
    const results: ChartResult[] = json?.data?.results ?? [];
    return { results };
  } catch (e) {
    return { results: [], error: String(e) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET() {
  const auth = await getAuthToken();
  if (!auth.token) {
    return NextResponse.json({ ok: false, stage: "auth", error: auth.error });
  }

  const catalogue: Record
    string,
    {
      title?: string;
      slug?: string;
      type?: string;
      lastUpdated?: string;
      categories?: string[];
      matchedKeywords: string[];
    }
  > = {};
  const perKeyword: Record<string, number | string> = {};

  for (const kw of KEYWORDS) {
    const { results, error } = await searchCharts(auth.token, kw);
    perKeyword[kw] = error ? `ERROR: ${error}` : results.length;
    for (const r of results) {
      const key = r.slug ?? `${r.id}`;
      if (!catalogue[key]) {
        catalogue[key] = {
          title: r.title,
          slug: r.slug,
          type: r.type,
          lastUpdated: r.lastUpdated,
          categories: (r.categories ?? [])
            .map((c) => c?.name)
            .filter(Boolean) as string[],
          matchedKeywords: [kw],
        };
      } else {
        catalogue[key].matchedKeywords.push(kw);
      }
    }
    await sleep(400); // be polite, avoid rate limits
  }

  const charts = Object.values(catalogue).sort((a, b) =>
    (a.title ?? "").localeCompare(b.title ?? "")
  );

  return NextResponse.json({
    ok: true,
    totalUniqueCharts: charts.length,
    perKeyword,
    charts,
  });
}
