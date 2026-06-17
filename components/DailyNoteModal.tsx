'use client';

import { useState } from 'react';
import { X, Copy, Check, Loader2 } from 'lucide-react';

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}
function fmtUSD(v: number | null | undefined): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtFlow(v: number | null | undefined): string {
  if (v == null) return '—';
  const abs = fmtUSD(Math.abs(v as number));
  return (v as number) >= 0 ? '+' + abs : '-' + abs;
}
function pctColor(v: number | null | undefined): string {
  if (v == null) return '#374151';
  return v >= 0 ? '#166534' : '#991b1b';
}
function flowColor(v: number | null | undefined): string {
  if (v == null) return '#374151';
  return (v as number) >= 0 ? '#166534' : '#991b1b';
}

const TH: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 700,
  background: '#1a1917', color: '#fff',
  textAlign: 'left', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '4px 10px', fontSize: 12,
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
};
const TDr: React.CSSProperties = { ...TD, textAlign: 'right' };
const SECTION: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: '#1a1917',
  padding: '10px 0 4px',
};

interface DailyNoteData {
  dateStr: string;
  spot: { rows: any[]; stablecoins: number | null; rwa: number | null; btcDominance: number | null; fearGreed: number | null; fearGreedLabel: string | null };
  funding: { rows: any[]; totalLiqs: number | null; longsLiqs: number | null; shortsLiqs: number | null };
  options: { btcIv7: number | null; btcRv7: number | null; btcIv30: number | null; btcRv30: number | null; ethIv7: number | null; ethRv7: number | null; ethIv30: number | null; ethRv30: number | null; optOiBtc: number | null; optOiEth: number | null; dvol: number | null; skew25d: number | null };
  etf: { rows: any[]; strategyValue: number | null; strategyHoldings: number | null; strategyAvgPrice: number | null };
}

function buildHTML(note: DailyNoteData): string {
  const { dateStr, spot, funding, options, etf } = note;

  const spotRowsHTML = spot.rows.map(r => `
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.asset}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${pctColor(r.change1d)}">${fmtPct(r.change1d)}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${pctColor(r.change1w)}">${fmtPct(r.change1w)}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${pctColor(r.change1m)}">${fmtPct(r.change1m)}</td>
    </tr>`).join('');

  // Single merged funding table, all five assets. Source attribution moved to footnote.
  const fundingRowsHTML = funding.rows.map((r: any) => `
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.asset}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${pctColor(r.today)}">${r.today != null ? fmtPct(r.today) : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${pctColor(r.sevenDaysAgo)}">${r.sevenDaysAgo != null ? fmtPct(r.sevenDaysAgo) : '—'}</td>
    </tr>`).join('');

  const fmtAum = (v: number | null | undefined) => v == null ? '<span style="color:#9ca3af;font-style:italic">Data Not Published</span>' : fmtUSD(v);
  const etfRowsHTML = etf.rows.map(r => `
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;font-weight:600">${r.asset}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${flowColor(r.flow)}">${fmtFlow(r.flow)}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right">${fmtAum(r.aum)}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right">${fmtAum(r.aum30d)}</td>
    </tr>`).join('');

  return `
<div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1917">
  <p style="font-size:13px;color:#6b7280;margin:0 0 16px">${dateStr} · LMAX Digital Market Data</p>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 0 4px;margin-bottom:4px">Crypto Market Overview</div>
  <ul style="margin:0 0 20px 0;padding-left:20px;font-size:12px;color:#1a1917;line-height:2">
    <li>&nbsp;</li>
    <li>&nbsp;</li>
    <li>&nbsp;</li>
  </ul>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 0 4px;margin-bottom:4px">Macro Overview</div>
  <ul style="margin:0 0 20px 0;padding-left:20px;font-size:12px;color:#1a1917;line-height:2">
    <li>&nbsp;</li>
    <li>&nbsp;</li>
    <li>&nbsp;</li>
  </ul>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 0 4px;margin-bottom:4px">Chatter / Market Sentiment</div>
  <ul style="margin:0 0 20px 0;padding-left:20px;font-size:12px;color:#1a1917;line-height:2">
    <li>&nbsp;</li>
    <li>&nbsp;</li>
    <li>&nbsp;</li>
  </ul>

  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:16px;width:100%;border-bottom:1px solid #e5e7eb">
    <tr>
      <td valign="middle" style="padding:0 8px 8px 0;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;white-space:nowrap">Market Data, Brought to you by</td>
      <td valign="middle" style="padding:0 0 8px 0;width:100%">
        <a href="https://www.theblock.co/" style="text-decoration:none"><img src="https://market-data-eta.vercel.app/images.png" alt="The Block" height="44" style="height:44px;display:inline-block;border:0" /></a>
      </td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 10px 4px">Spot Performance</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px">
    <tr>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:left"></th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1 day</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1 week</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1 month</th>
    </tr>
    ${spotRowsHTML}
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Total Stablecoins</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(spot.stablecoins)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Total Tokenised RWA (TVL)</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(spot.rwa)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">BTC Dominance</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${spot.btcDominance != null ? spot.btcDominance.toFixed(1) + '%' : '—'}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;color:#6b7280">Fear &amp; Greed Index</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right;font-weight:600">${spot.fearGreed != null ? spot.fearGreed + (spot.fearGreedLabel ? ' (' + spot.fearGreedLabel + ')' : '') : '—'}</td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 10px 4px">Funding, Liquidation and Leverage</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px">
    <tr>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:left"></th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">Latest</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">7 days ago</th>
    </tr>
    ${fundingRowsHTML}
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Total Liquidations 24H, no crying at the casino</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(funding.totalLiqs)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Longs Liquidated</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(funding.longsLiqs)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Shorts Liquidated</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(funding.shortsLiqs)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Number of Traders Liquidated</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700"><b>XXX (enter from Coinglass)</b></td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;color:#6b7280">Largest Single Liquidation Order</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right;font-weight:700"><b>XXX (enter from Coinglass)</b></td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 10px 4px">Options</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px">
    <tr>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:left"></th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1W ATM Vol</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1W Realised Vol</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1M ATM Vol</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">1M Realised Vol</th>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;font-weight:600">BTC</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right">${options.btcIv7 != null ? fmt(options.btcIv7) + '%' : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right">${options.btcRv7 != null ? fmt(options.btcRv7) + '%' : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right">${options.btcIv30 != null ? fmt(options.btcIv30) + '%' : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right">${options.btcRv30 != null ? fmt(options.btcRv30) + '%' : '—'}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;font-weight:600">ETH</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right">${options.ethIv7 != null ? fmt(options.ethIv7) + '%' : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right">${options.ethRv7 != null ? fmt(options.ethRv7) + '%' : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right">${options.ethIv30 != null ? fmt(options.ethIv30) + '%' : '—'}</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right">${options.ethRv30 != null ? fmt(options.ethRv30) + '%' : '—'}</td>
    </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Aggregate Options OI (BTC)</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(options.optOiBtc)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Aggregate Options OI (ETH)</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(options.optOiEth)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">BTC DVOL (30-day implied vol index)</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${options.dvol != null ? fmt(options.dvol) + '%' : '—'}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;color:#6b7280">BTC 25D Put/Call Skew</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right;font-weight:600">${options.skew25d != null ? (options.skew25d >= 0 ? '+' : '') + options.skew25d.toFixed(1) : '—'}</td>
    </tr>
  </table>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:0 10px 4px">ETF</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px">
    <tr>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:left"></th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">Inflow / Outflow</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">Total AUM</th>
      <th style="padding:5px 10px;font-size:11px;font-weight:700;background:#1a1917;color:#fff;text-align:right">AUM 30 days ago</th>
    </tr>
    ${etfRowsHTML}
  </table>

  <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1917;padding:8px 10px 4px">Strategy</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">
    <tr>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;color:#6b7280">Value of Holdings</td>
      <td style="padding:4px 10px;font-size:12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${fmtUSD(etf.strategyValue)}</td>
    </tr>
    <tr>
      <td style="padding:4px 10px;font-size:12px;color:#6b7280">BTC Holdings (avg price $${etf.strategyAvgPrice != null ? etf.strategyAvgPrice.toLocaleString('en-US') : '—'})</td>
      <td style="padding:4px 10px;font-size:12px;text-align:right;font-weight:600">${etf.strategyHoldings != null ? etf.strategyHoldings.toLocaleString('en-US') + ' BTC' : '—'}</td>
    </tr>
  </table>

  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:28px;width:100%">
    <tr>
      <td style="font-size:6pt;line-height:13pt;color:#9ca3af;font-style:italic;font-family:Arial,sans-serif;padding:8px 0 0 0"><i>Funding rates are 7-day averages shown as a percentage. BTC & ETH from The Block (Binance exchange). SOL, XRP & HYPE calculated from Coinalyze daily rates. The two sources use slightly different calculation bases. Liquidations from Coinalyze. Trader count and largest single order from Coinglass.</i></td>
    </tr>
  </table>
</div>`;
}

export default function DailyNoteModal({ data, onClose }: { data: any; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<DailyNoteData | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dailynote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setNote(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!note) return;
    const html = buildHTML(note);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 10,
        width: '92vw', maxWidth: 980,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1917' }}>Daily Note</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!note && !loading && (
              <button onClick={generate} style={{
                padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: '#1a1917', color: '#fff', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit',
              }}>Generate</button>
            )}
            {note && (
              <button onClick={copy} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: copied ? '#166534' : '#2563eb', color: '#fff',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy for Outlook'}
              </button>
            )}
            {note && (
              <button onClick={generate} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'var(--surface2)', color: '#374151',
                border: '1px solid #e5e7eb', cursor: 'pointer', fontFamily: 'inherit',
              }}>Refresh</button>
            )}
            <button onClick={onClose} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 6,
              background: 'var(--surface2)', border: 'none', cursor: 'pointer',
            }}><X size={14} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {!note && !loading && !error && (
            <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, padding: '40px 0' }}>
              Click Generate to build today's note from live data.
            </div>
          )}
          {loading && (
            <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, padding: '40px 0' }}>
              <Loader2 size={18} style={{ display: 'block', margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
              Building note...
            </div>
          )}
          {error && (
            <div style={{ color: '#991b1b', fontSize: 13, padding: '16px', background: '#fee2e2', borderRadius: 6 }}>
              Error: {error}
            </div>
          )}
          {note && (
            <div dangerouslySetInnerHTML={{ __html: buildHTML(note) }} />
          )}
        </div>
      </div>
    </div>
  );
}
