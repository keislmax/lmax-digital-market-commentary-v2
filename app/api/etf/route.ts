import { NextResponse } from 'next/server';

interface ETFRow {
  date: string;
  flows: Record<string, number | null>;
  total: number;
}

function parseFlowValue(val: string): number | null {
  const cleaned = val.trim().replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '—' || cleaned.toLowerCase() === 'n/a') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Farside updates manually — weekend dates have no data.
// On Monday, the last valid day is Friday.
// We return the last N trading days of data.
function getLastTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const offset = day === 0 ? 2 : day === 1 ? 3 : 1; // Sun→Fri, Mon→Fri, else yesterday
  const last = new Date(now);
  last.setUTCDate(now.getUTCDate() - offset);
  return last.toISOString().split('T')[0];
}

export async function GET() {
  try {
    const res = await fetch('https://farside.co.uk/bitcoin-etf-flow-all-data/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; dashboard/1.0)',
        'Accept': 'text/html',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`Farside fetch failed: ${res.status}`);
    const html = await res.text();

    // Parse the main data table from Farside's HTML
    // Table rows look like: <tr><td>date</td><td>IBIT</td>...<td>Total</td></tr>
    const rows: ETFRow[] = [];

    // Extract table rows with regex — Farside's HTML structure is consistent
    const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    if (!tableMatch) throw new Error('Could not find data table in Farside HTML');

    // Find the main ETF flow table (has the most rows)
    let mainTable = tableMatch.reduce((a, b) => a.length > b.length ? a : b);

    // Extract headers
    const headerMatch = mainTable.match(/<thead[\s\S]*?<\/thead>/i);
    const headers: string[] = [];
    if (headerMatch) {
      const ths = headerMatch[0].match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      ths.forEach(th => {
        headers.push(th.replace(/<[^>]+>/g, '').trim());
      });
    }

    // Extract data rows
    const tbodyMatch = mainTable.match(/<tbody[\s\S]*?<\/tbody>/i);
    if (tbodyMatch) {
      const trMatches = tbodyMatch[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const tr of trMatches) {
        const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
        if (tds.length < 3) continue;
        const cells = tds.map(td => td.replace(/<[^>]+>/g, '').trim());
        const dateRaw = cells[0];
        if (!dateRaw || !/^\d{1,2}\s\w+\s\d{4}$/.test(dateRaw)) continue;

        // Parse date like "16 May 2025"
        const dateObj = new Date(dateRaw);
        if (isNaN(dateObj.getTime())) continue;
        const dateStr = dateObj.toISOString().split('T')[0];

        const flows: Record<string, number | null> = {};
        for (let i = 1; i < cells.length - 1 && i < headers.length; i++) {
          flows[headers[i]] = parseFlowValue(cells[i]);
        }

        const totalCell = cells[cells.length - 1];
        const total = parseFlowValue(totalCell) || 0;

        rows.push({ date: dateStr, flows, total });
      }
    }

    // Sort descending (most recent first)
    rows.sort((a, b) => b.date.localeCompare(a.date));

    const lastTradingDay = getLastTradingDay();
    const latest = rows[0] || null;
    const last30 = rows.slice(0, 30).reverse(); // ascending for charts

    // Cumulative flow
    const cumulative = last30.reduce((acc, row, i) => {
      const prev = acc[i - 1]?.cumulative || 0;
      acc.push({ date: row.date, daily: row.total, cumulative: prev + row.total });
      return acc;
    }, [] as Array<{ date: string; daily: number; cumulative: number }>);

    // Total flows by ETF (sum of last 30 days)
    const byETF: Record<string, number> = {};
    for (const row of last30) {
      for (const [etf, val] of Object.entries(row.flows)) {
        if (val !== null && etf !== 'Total') {
          byETF[etf] = (byETF[etf] || 0) + val;
        }
      }
    }

    return NextResponse.json({
      lastTradingDay,
      latest,
      last30Days: last30,
      cumulativeChart: cumulative,
      byETF,
      note: 'Farside data — weekend days have no ETF flow data. Monday shows Friday values.',
      updatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
