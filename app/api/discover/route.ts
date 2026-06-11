// TEMPORARY DISCOVERY ROUTE - delete after Phase 0 is complete.
// Authenticates with The Block API, runs chart searches across all
// candidate metric keywords, and returns the deduplicated catalogue
// of matching charts (title, slug, type, last updated, categories).

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://www.theblock.pro/api-public";

const KEYWORDS = [
  "futures",
  "options",
  "perpetual",
  "perpetuals",
  "volatility",
  "funding",
  "interest",
  "liquidation",
  "volume",
  "skew",
  "puts",
  "bitcoin",
  "ethereum",
  "solana",
  "XRP",
  "AUM",
  "NAV",
  "treasuries",
  "derivatives",
  "dominance",
  "marketcap",
  "RWA",
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
  const email = (process.env.THEBLOCK_EMAIL ?? "").trim();
  const apiKey = (process.env.THEBLOCK_API_KEY_DATA ?? "").trim();
  if (!email || !apiKey) {
    return { error: "Missing THEBLOCK_EMAIL or THEBLOCK_API_KEY_DATA env vars" };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    Accept: "application/json",
  };

  // Sanity check 1: unauthenticated ping
  let pingStatus = "unreached";
  try {
    const ping = await fetch(`${BASE}/ping`, { headers, cache: "no-store" });
    pingStatus = `HTTP ${ping.status}`;
  } catch (e) {
    pingStatus = `threw: ${String(e)}`;
  }

  try {
    const res = await fetch(`${BASE}/v1/users/auth`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, apiKey }),
      cache: "no-store",
    });
    const raw = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(raw); } catch { json = null; }
    if (!res.ok) {
      return {
        error: `Auth failed (HTTP ${res.status}). Ping: ${pingStatus}. Raw: ${raw.slice(0, 300)}. TrimmedEmailLen: ${email.length}, TrimmedKeyLen: ${apiKey.length}`,
      };
    }
    const token =
      json?.token ??
      (json?.data as Record<string, unknown>)?.token ??
      (json?.data as Record<string, unknown>)?.accessToken ??
      json?.accessToken ??
      null;
    if (!token) {
      return { error: `Auth OK but no token found. Full response: ${raw.slice(0, 500)}` };
    }
    return { token: token as string };
  } catch (e) {
    return { error: `Auth request threw: ${String(e)}. Ping: ${pingStatus}` };
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

export async function GET(request: Request) {
  const auth = await getAuthToken();
  if (!auth.token) {
    return NextResponse.json({ ok: false, stage: "auth", error: auth.error });
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  // Slug mode: fetch a single chart and return its raw payload
  if (slug) {
    try {
      const res = await fetch(
        `${BASE}/v1/charts/?slug=${encodeURIComponent(slug)}`,
        {
          headers: {
            "x-auth-token": auth.token,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            Accept: "application/json",
          },
          cache: "no-store",
        }
      );
      const raw = await res.text();
      let json: unknown = null;
      try { json = JSON.parse(raw); } catch { json = null; }
      return NextResponse.json({
        ok: res.ok,
        status: res.status,
        slug,
        payload: json ?? raw.slice(0, 2000),
      });
    } catch (e) {
      return NextResponse.json({ ok: false, slug, error: String(e) });
    }
  }

  // Default mode: keyword discovery (unchanged)
  const catalogue: Record<string, { title?: string; slug?: string; type?: string; lastUpdated?: string; categories?: string[]; matchedKeywords: string[]; }> = {};
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
          categories: (r.categories ?? []).map((c) => c?.name).filter(Boolean) as string[],
          matchedKeywords: [kw],
        };
      } else {
        catalogue[key].matchedKeywords.push(kw);
      }
    }
    await sleep(400);
  }

  const charts = Object.values(catalogue).sort((a, b) =>
    (a.title ?? "").localeCompare(b.title ?? "")
  );

  return NextResponse.json({ ok: true, totalUniqueCharts: charts.length, perKeyword, charts });
}
