import { NextResponse } from 'next/server';

interface ETFRow {
  date: string;
  flows: Record<string, number | null>;
  total: number;
}

interface AssetETFData {
  asset: string;
  latest: ETFRow | null;
  last30Days: ETFRow[];
  byETF: Record<string, number>;
  lastTradingDay: string;
  error?: string;
}

function parseFlowValue(val: string): number | null {
  const cleaned = val.trim().replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned.toLowerCase() === 'n/a') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getLastTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const offset = day === 0 ? 2 : day === 1 ? 3 : 1;
  const last = new Date(now);
  last.setUTCDate(now.getUTCDate() - offset);
  return last.toISOString().split('T')[0];
}

async function scrapeFarside(url: string): Promise<ETFRow[]> {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  let html = '';
  let lastError = '';

  for (const ua of userAgents) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://farside.co.uk/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Upgrade-Insecure-Requests': '1',
        },
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        html = await res.text();
        break;
      }
      lastError = `HTTP ${res.status}`;
    } catch (e: any) {
      lastError = e.message;
    }
  }

  if (!html) throw new Error(`Farside blocked: ${lastError}`);

  const rows: ETFRow[] = [];
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
  if (!tableMatch) throw new Error('No table found in Farside response');

  const mainTable = tableMatch.reduce((a, b) => a.length > b.length ? a : b);

  const headerMatch = mainTable.match(/<thead[\s\S]*?<\/thead>/i);
  const headers: string[] = [];
  if (headerMatch) {
    const ths = headerMatch[0].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    ths.forEach(th => headers.push(th.replace(/<[^>]+>/g, '').trim()));
  }

  const tbodyMatch = mainTable.match(/<tbody[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch) return rows;

  const trMatches = tbodyMatch[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trMatches) {
    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    if (tds.length < 3) continue;
    const cells = tds.map(td => td.replace(/<[^>]+>/g, '').trim());
    const dateRaw = cells[0];
    if (!dateRaw) continue;

    let dateObj: Date | null = null;
    if (/^\d{1,2}\s\w+\s\d{4}$/.test(dateRaw)) {
      dateObj = new Date(dateRaw);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateRaw)) {
      const [d, m, y] = dateRaw.split('/');
      dateObj = new Date(`${y}-${m}-${d}`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      dateObj = new Date(dateRaw);
    }

    if (!dateObj || isNaN(dateObj.getTime())) continue;
    const dateStr = dateObj.toISOString().split('T')[0];

    const flows: Record<string, number | null> = {};
    for (let i = 1; i < cells.length - 1 && i < headers.length; i++) {
      flows[headers[i]] = parseFlowValue(cells[i]);
    }
    const total = parseFlowValue(cells[cells.length - 1]) || 0;
    rows.push({ date: dateStr, flows, total });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

async function fetchAsset(asset: string, url: string): Promise<AssetETFData> {
  try {
    const rows = await scrapeFarside(url);
    const last30 = rows.slice(0, 30).reverse();
    const byETF: Record<string, number> = {};
    for (const row of last30) {
      for (const [etf, val] of Object.entries(row.flows)) {
        if (val !== null && etf !== 'Total') {
          byETF[etf] = (byETF[etf] || 0) + val;
        }
      }
    }
    return { asset, latest: rows[0] || null, last30Days: last30, byETF, lastTradingDay: getLastTradingDay() };
  } catch (err: any) {
    return { asset, latest: null, last30Days: [], byETF: {}, lastTradingDay: getLastTradingDay(), error: err.message };
  }
}

export async function GET() {
  try {
    const [btc, eth, sol, hype] = await Promise.all([
      fetchAsset('BTC', 'https://farside.co.uk/bitcoin-etf-flow-all-data/'),
      fetchAsset('ETH', 'https://farside.co.uk/eth/'),
      fetchAsset('SOL', 'https://farside.co.uk/sol/'),
      fetchAsset('HYPE', 'https://farside.co.uk/hyp/'),
    ]);

    return NextResponse.json({
      btc, eth, sol, hype,
      lastTradingDay: getLastTradingDay(),
      note: 'Farside Investors data. Weekend days excluded — Monday shows Friday values.',
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
