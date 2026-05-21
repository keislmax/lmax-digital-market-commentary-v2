'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import Image from 'next/image';
import { timeAgo, formatUSD } from '@/lib/utils';
import FearGreedCard from '@/components/FearGreedCard';
import OptionsCard from '@/components/OptionsCard';
import ETFCard from '@/components/ETFCard';

const REFRESH_INTERVAL = 5 * 60 * 1000;
const TIMEFRAMES = ['24h', '7d', '30d', '90d', '1y'] as const;
type TF = typeof TIMEFRAMES[number];
const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'] as const;
type Asset = typeof ASSETS[number];

const EXCHANGES = 'Binance · Bybit · OKX · Deribit · BitMEX · Kraken';

function fmtPct(n?: number, dp = 2) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(dp) + '%';
}

function Badge({ value }: { value?: number }) {
  if (value === undefined || value === null) return null;
  const pos = value >= 0;
  return (
    <span className={`badge ${pos ? 'badge-green' : 'badge-red'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function Sparkline({ data, color = '#2563eb', height = 80 }: { data: number[], color?: string, height?: number }) {
  if (!data || data.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      No data
    </div>
  );
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 400, h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 8) - 4}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function MetricCard({ label, value, sub, change, source, valueColor, children }: {
  label: string; value: string; sub?: string; change?: number;
  source?: string; valueColor?: string; children?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div className="card-title">{label}</div>
        {source && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source}</div>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor || 'var(--text)', lineHeight: 1.1, marginBottom: 4 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 18 }}>
        {change !== undefined && <Badge value={change} />}
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function ChartCard({ label, source, value, sub, change, charts, valueColor, color, formatY }: {
  label: string; source?: string; value: string; sub?: string; change?: number;
  charts?: Record<string, any[]>; valueColor?: string; color?: string;
  formatY?: (v: number) => string;
}) {
  const [tf, setTf] = useState<TF>('24h');
  const chartData = charts?.[tf] || [];
  const values = chartData.map((p: any) => p.v ?? (p.l + p.s) ?? 0);
  const chartColor = color || valueColor || '#2563eb';

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div className="card-title">{label}</div>
        {source && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor || 'var(--text)', lineHeight: 1.1 }}>{value}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 18 }}>
            {change !== undefined && <Badge value={change} />}
            {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600,
              background: tf === t ? 'var(--accent)' : 'var(--surface2)',
              color: tf === t ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>{t.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <Sparkline data={values} color={chartColor} height={80} />
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.02em' }}>{EXCHANGES}</div>
    </div>
  );
}

function SpotPriceCard({ prices }: { prices: any }) {
  const [asset, setAsset] = useState<Asset>('BTC');
  const p = prices?.[asset];

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div className="card-title">Spot Price</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CoinGecko</div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {ASSETS.map(a => (
          <button key={a} onClick={() => setAsset(a)} style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: asset === a ? 'var(--accent)' : 'var(--surface2)',
            color: asset === a ? '#fff' : 'var(--text-muted)',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>{a}</button>
        ))}
      </div>
      {p ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1 }}>
              {p.price ? '$' + p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </div>
            <div style={{ marginTop: 6 }}><Badge value={p.change24h} /></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Market Cap</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{formatUSD(p.marketCap)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, marginBottom: 2 }}>24H Volume</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{formatUSD(p.volume24h)}</div>
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
      )}
    </div>
  );
}

function GlobalMetricsCard({ prices }: { prices: any }) {
  if (!prices) return null;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div className="card-title">Global Market</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CoinGecko</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Market Cap</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{formatUSD(prices.globalMarketCap)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>BTC Dominance</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{prices.btcDominance?.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setLastFetch(Date.now());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const c = data?.coinalyze;
  const d = data?.deribit;
  const fg = data?.feargreed;
  const etf = data?.etf;
  const prices = data?.prices;

  const fundingPct = c?.fundingRate?.current !== undefined
    ? (c.fundingRate.current * 100).toFixed(4) + '%' : '—';
  const fundingColor = !c?.fundingRate?.current ? 'var(--text)'
    : c.fundingRate.current > 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Image src="/LMAXDigital-BlackRed-Logo-Horizontal.jpg" alt="LMAX Digital" width={140} height={36} style={{ objectFit: 'contain' }} />
            <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>Market Data Feed</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Live</span>
            </div>
            {lastFetch && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Updated {timeAgo(lastFetch)}</span>}
            <button onClick={() => fetchData(true)} disabled={refreshing || loading} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 6,
              fontSize: 13, fontWeight: 500, background: refreshing ? 'var(--surface3)' : 'var(--accent)',
              color: refreshing ? 'var(--text-muted)' : '#fff', border: 'none',
              cursor: refreshing ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: 'var(--red-light)', border: '1px solid #fecaca', marginBottom: 16 }}>
            <AlertCircle size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 13, color: 'var(--red)' }}>Data error: {error}</span>
          </div>
        )}

        {/* Row 1: Spot Price + Global Market */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <SpotPriceCard prices={prices} />
          <GlobalMetricsCard prices={prices} />
        </div>

        {/* Row 2: KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <MetricCard
            label="Open Interest" value={loading ? '—' : formatUSD(c?.openInterest?.current || 0)}
            change={c?.openInterest?.change24h} source="Coinalyze"
            sub="BTC/ETH/SOL/XRP · Major exchanges"
          />
          <MetricCard
            label="Volume 24H" value={loading ? '—' : formatUSD(c?.volume?.total24h || 0)}
            source="Coinalyze" sub="BTC/ETH/SOL/XRP · Major exchanges"
          />
          <MetricCard
            label="Liquidations 24H" value={loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)}
            sub={c?.liquidations ? `Longs: ${formatUSD(c.liquidations.longs24h)} · Shorts: ${formatUSD(c.liquidations.shorts24h)}` : undefined}
            source="Coinalyze"
          />
          <MetricCard
            label="Funding Rate (8H)" value={loading ? '—' : fundingPct}
            sub="Per 8-hour settlement" source="Coinalyze"
            valueColor={fundingColor}
          />
        </div>

        {/* Row 3: OI + Liquidations charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
            label="Open Interest" source="Coinalyze"
            value={loading ? '—' : formatUSD(c?.openInterest?.current || 0)}
            change={c?.openInterest?.change24h}
            charts={c?.openInterest?.charts}
            color="#2563eb"
          />
          <ChartCard
            label="Liquidations" source="Coinalyze"
            value={loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)}
            sub={c?.liquidations ? `Longs: ${formatUSD(c.liquidations.longs24h)} · Shorts: ${formatUSD(c.liquidations.shorts24h)}` : undefined}
            charts={c?.liquidations?.charts}
            color="#dc2626"
          />
        </div>

        {/* Row 4: Volume + Funding charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
            label="Volume" source="Coinalyze"
            value={loading ? '—' : formatUSD(c?.volume?.total24h || 0)}
            charts={c?.volume?.charts}
            color="#16a34a"
          />
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="card-title">Funding Rate (24H)</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coinalyze</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: fundingColor, marginBottom: 4 }}>{fundingPct}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              {c?.fundingRate?.current > 0 ? 'Longs paying shorts' : c?.fundingRate?.current < 0 ? 'Shorts paying longs' : 'Per 8-hour settlement'}
            </div>
            <Sparkline data={(c?.fundingRate?.chart || []).map((p: any) => p.v)} color={fundingColor || '#2563eb'} height={80} />
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>{EXCHANGES}</div>
          </div>
        </div>

        {/* Row 5: Fear & Greed, Options, ETF */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FearGreedCard data={fg} loading={loading} />
          <OptionsCard data={d} loading={loading} />
          <ETFCard data={etf} loading={loading} />
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
          Derivatives: Coinalyze ({EXCHANGES}) · Prices & Global: CoinGecko · Options: Deribit · Sentiment: Alternative.me · ETF Flows: Farside Investors
        </div>
      </main>
    </div>
  );
}
