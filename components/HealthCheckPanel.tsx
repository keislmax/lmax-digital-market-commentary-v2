'use client';

import { useState } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface FeedResult {
  key: string;
  name: string;
  status: 'operational' | 'stale' | 'down';
  detail: string;
  ageMinutes: number | null;
}
interface HealthData {
  headline: string;
  operational: number;
  total: number;
  allHealthy: boolean;
  feeds: FeedResult[];
  checkedAt: number;
}

const LEGEND: { card: string; source: string; composition: string }[] = [
  {
    card: 'Spot Performance',
    source: 'CoinGecko',
    composition: 'Live spot prices and 1d/7d/30d changes for BTC, ETH, SOL, XRP, HYPE.',
  },
  {
    card: 'Stablecoins / RWA / Dominance',
    source: 'DefiLlama + CoinGecko',
    composition: 'Total stablecoin supply from DefiLlama (sum of all pegs, computed aggregate). Tokenised RWA TVL from DefiLlama (sum across RWA category). BTC dominance from CoinGecko global data.',
  },
  {
    card: 'Futures Open Interest',
    source: 'Coinalyze',
    composition: 'Sum of open interest across Binance, Bybit, OKX, Hyperliquid, and Deribit/Gate.io/Huobi per asset. Covers ~82% of the OI Coinalyze attributes to BTC/ETH/SOL/XRP/HYPE (~69% of Coinalyze\'s full all-coin total). Ceiling of the free API tier. Refreshed daily via cron.',
  },
  {
    card: 'Funding Rate (Annualized)',
    source: 'Coinalyze',
    composition: 'Annualized mean funding rate across major perp venues per asset, computed aggregate. All five assets (BTC, ETH, SOL, XRP, HYPE) from Coinalyze. Refreshed every ~2 hours via cron.',
  },
  {
    card: 'Liquidations',
    source: 'CoinGlass + Coinalyze',
    composition: 'All-market 24H liquidation totals (total/longs/shorts, traders liquidated, largest single order) scraped from CoinGlass (coinglass.com/liquidations) via Apify Playwright actor each morning. Chart data from Coinalyze (~82% of the OI Coinalyze attributes to BTC/ETH/SOL/XRP/HYPE). If CoinGlass scrape fails, headline shows Coinalyze subset. CoinGlass feed status visible below.',
  },
  {
    card: 'Options · Volatility & Skew',
    source: 'Deribit',
    composition: 'DVOL (30-day implied vol index), 25-delta put/call skew, futures basis (BTC & ETH), put/call OI ratio, and options open interest — all from Deribit live API. Options OI is Deribit-only, not a multi-venue aggregate. Realised vol computed from CoinGecko daily closes.',
  },
  {
    card: 'ETF Flows',
    source: 'Farside Investors',
    composition: 'BTC, ETH, SOL and HYPE ETF net flows from Farside Investors via Apify scraper. Farside updates after US market close; latest trading day may lag by one calendar day.',
  },
  {
    card: 'ETF AUM',
    source: 'SoSoValue',
    composition: 'True market-value net assets for BTC, ETH, SOL and XRP spot ETFs from SoSoValue. HYPE AUM not published by any free source.',
  },
  {
    card: 'Strategy',
    source: 'CoinGecko',
    composition: 'Strategy (MicroStrategy) BTC holdings and average cost basis from CoinGecko public treasury data. Average price is entry value ÷ holdings as reported by CoinGecko.',
  },
  {
    card: 'Fear & Greed',
    source: 'Alternative.me',
    composition: 'Daily crypto Fear & Greed index, current value plus 1d/7d/30d change.',
  },
];

function statusColor(s: string) {
  if (s === 'operational') return '#166534';
  if (s === 'stale') return '#b45309';
  return '#991b1b';
}
function StatusIcon({ s }: { s: string }) {
  if (s === 'operational') return <CheckCircle2 size={15} color="#166534" />;
  if (s === 'stale') return <AlertTriangle size={15} color="#b45309" />;
  return <XCircle size={15} color="#991b1b" />;
}

export default function HealthCheckPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthData | null>(null);
  const [cgStatus, setCgStatus] = useState<{ ok: boolean; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, allRes] = await Promise.all([
        fetch('/api/health', { cache: 'no-store' }),
        fetch('/api/all', { cache: 'no-store' }),
      ]);
      if (!healthRes.ok) throw new Error(`HTTP ${healthRes.status}`);
      const json = await healthRes.json();
      setData(json);
      if (allRes.ok) {
        const allJson = await allRes.json();
        const liq = allJson?.derivatives?.liquidations;
        if (liq) setCgStatus({ ok: liq.cgStatusOk ?? false, reason: liq.cgStatusReason ?? 'no data' });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '16px 18px', marginBottom: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={16} color="#1a1917" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1917' }}>Data Health Check</span>
          {data && (
            <span style={{
              fontSize: 12, fontWeight: 700, marginLeft: 6,
              color: data.allHealthy ? '#166534' : '#b45309',
            }}>{data.headline}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowLegend(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: '#f8f8f7', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer',
          }}>
            Data Sources {showLegend ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          <button onClick={runCheck} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: '#1a1917', color: '#fff', border: 'none',
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Activity size={13} />}
            {loading ? 'Verifying...' : 'Verify Data'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: '#991b1b', fontSize: 12, background: '#fee2e2', borderRadius: 6, padding: '8px 12px' }}>
          Health check failed: {error}
        </div>
      )}

      {data && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {data.feeds.map(f => (
            <div key={f.key} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 12px', background: '#fafafa', borderRadius: 6,
              border: '1px solid #f0f0ef',
            }}>
              <div style={{ marginTop: 1 }}><StatusIcon s={f.status} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1917' }}>{f.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: statusColor(f.status) }}>{f.status}</span>
                  {f.ageMinutes !== null && (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      {f.ageMinutes === 0 ? 'live' : `${f.ageMinutes} min old`}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{f.detail}</div>
              </div>
            </div>
          ))}
          {cgStatus && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderTop: '1px solid #f3f4f6', marginTop: 4 }}>
              <div style={{ marginTop: 1 }}>
                {cgStatus.ok
                  ? <CheckCircle2 size={14} color="#16a34a" />
                  : <AlertTriangle size={14} color="#d97706" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1917' }}>CoinGlass Liquidations</span>
                  <span style={{ fontSize: 10, color: cgStatus.ok ? '#16a34a' : '#d97706', fontWeight: 600 }}>
                    {cgStatus.ok ? 'live' : 'unavailable'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {cgStatus.ok
                    ? 'All-market 24H liquidations scraped from coinglass.com — live in dashboard and Daily Note.'
                    : `Fallback: Daily Note will show "enter from CoinGlass". Reason: ${cgStatus.reason}`}
                </div>
              </div>
            </div>
          )}
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
            Last checked {new Date(data.checkedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })} SGT. Each feed verified by an independent live call to its source.
          </div>
        </div>
      )}

      {showLegend && (
        <div style={{ marginTop: 14, borderTop: '1px solid #e5e7eb', paddingTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1917' }}>What each card is made of</div>
          {LEGEND.map((row, i) => (
            <div key={i} style={{ display: 'grid', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1917' }}>{row.card}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb' }}>{row.source}</span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{row.composition}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
