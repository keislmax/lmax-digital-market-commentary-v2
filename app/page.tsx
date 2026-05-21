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

function fmtUSD(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v/1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(2);
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
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

function Sparkline({ data, color = '#2563eb', height = 80, labels, formatValue }: {
  data: number[], color?: string, height?: number,
  labels?: string[], formatValue?: (v: number) => string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length < 2) return (
    <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
      No data
    </div>
  );

  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 400, H = height;

  const getPoint = (i: number) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((data[i] - min) / range) * (H - 8) - 4,
  });

  const polylinePoints = data.map((_, i) => { const p = getPoint(i); return `${p.x},${p.y}`; }).join(' ');
  const hoverPoint = hoverIdx !== null ? getPoint(hoverIdx) : null;
  const tooltipLeft = hoverPoint ? (hoverPoint.x / W * 100) : 0;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(xRatio * (data.length - 1))));
    setHoverIdx(idx);
  };

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="1.5" />
        {hoverPoint && (
          <>
            <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={H} stroke={color} strokeWidth="0.5" strokeDasharray="3,3" />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3.5" fill={color} />
          </>
        )}
      </svg>
      {hoverIdx !== null && data[hoverIdx] !== undefined && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: `${tooltipLeft}%`,
          transform: tooltipLeft > 70 ? 'translateX(-100%)' : tooltipLeft < 20 ? 'translateX(0)' : 'translateX(-50%)',
          background: 'rgba(28,28,26,.92)',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'var(--mono)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          marginBottom: 6,
          zIndex: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,.2)',
        }}>
          {labels?.[hoverIdx] && <div style={{ fontSize: 9, opacity: 0.65, marginBottom: 1 }}>{labels[hoverIdx]}</div>}
          {formatValue ? formatValue(data[hoverIdx]) : data[hoverIdx].toFixed(4)}
        </div>
      )}
    </div>
  );
}

const CARD_TITLE_STYLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: '#1a1917',
};

function MetricCard({ label, value, sub, change, source, valueColor, children }: {
  label: string; value: string; sub?: string; change?: number;
  source?: string; valueColor?: string; children?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={CARD_TITLE_STYLE}>{label}</div>
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

function ChartCard({ label, source, value, sub, change, charts, chartLabels, valueColor, color, formatValue }: {
  label: string; source?: string; value: string; sub?: string; change?: number;
  charts?: Record<string, any[]>; chartLabels?: Record<string, string[]>;
  valueColor?: string; color?: string; formatValue?: (v: number) => string;
}) {
  const [tf, setTf] = useState<TF>('24h');
  const chartData = charts?.[tf] || [];
  const values = chartData.map((p: any) => p.v !== undefined ? p.v : (p.l || 0) + (p.s || 0));
  const labels = chartLabels?.[tf];
  const chartColor = color || valueColor || '#2563eb';

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={CARD_TITLE_STYLE}>{label}</div>
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
      <Sparkline data={values} color={chartColor} height={80} labels={labels} formatValue={formatValue} />
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
        <div style={CARD_TITLE_STYLE}>Spot Price</div>
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

function GlobalMetricsCard({ globalMarketCap, btcDominance }: { globalMarketCap?: number, btcDominance?: number }) {
  if (!globalMarketCap) return null;
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={CARD_TITLE_STYLE}>Global Market</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CoinGecko</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Market Cap</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{formatUSD(globalMarketCap)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>BTC Dominance</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{btcDominance?.toFixed(1)}%</span>
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
  const pricesData = data?.prices;
  const prices = pricesData?.prices;
  const globalMarketCap = pricesData?.globalMarketCap;
  const btcDominance = pricesData?.btcDominance;

  const fundingPct = c?.fundingRate?.current !== undefined && c.fundingRate.current !== 0
    ? (c.fundingRate.current * 100).toFixed(4) + '%' : '—';
  const fundingColor = !c?.fundingRate?.current ? 'var(--text)'
    : c.fundingRate.current > 0 ? 'var(--green)' : 'var(--red)';

  const buildLabels = (charts: any, tf: string, isHourly: boolean) =>
    (charts?.[tf] || []).map((p: any) => isHourly ? fmtTime(p.t) : fmtDate(p.t));

  const oiChartLabels: Record<string, string[]> = {
    '24h': buildLabels(c?.openInterest?.charts, '24h', true),
    '7d':  buildLabels(c?.openInterest?.charts, '7d', false),
    '30d': buildLabels(c?.openInterest?.charts, '30d', false),
    '90d': buildLabels(c?.openInterest?.charts, '90d', false),
    '1y':  buildLabels(c?.openInterest?.charts, '1y', false),
  };
  const liqChartLabels: Record<string, string[]> = {
    '24h': buildLabels(c?.liquidations?.charts, '24h', true),
    '7d':  buildLabels(c?.liquidations?.charts, '7d', false),
    '30d': buildLabels(c?.liquidations?.charts, '30d', false),
    '90d': buildLabels(c?.liquidations?.charts, '90d', false),
    '1y':  buildLabels(c?.liquidations?.charts, '1y', false),
  };
  const volChartLabels: Record<string, string[]> = {
    '24h': buildLabels(c?.volume?.charts, '24h', true),
    '7d':  buildLabels(c?.volume?.charts, '7d', false),
    '30d': buildLabels(c?.volume?.charts, '30d', false),
    '90d': buildLabels(c?.volume?.charts, '90d', false),
    '1y':  buildLabels(c?.volume?.charts, '1y', false),
  };
  const fundChartLabels: Record<string, string[]> = {
    '24h': buildLabels(c?.fundingRate?.charts, '24h', true),
    '7d':  buildLabels(c?.fundingRate?.charts, '7d', false),
    '30d': buildLabels(c?.fundingRate?.charts, '30d', false),
    '90d': buildLabels(c?.fundingRate?.charts, '90d', false),
    '1y':  buildLabels(c?.fundingRate?.charts, '1y', false),
  };

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

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <SpotPriceCard prices={prices} />
          <GlobalMetricsCard globalMarketCap={globalMarketCap} btcDominance={btcDominance} />
        </div>

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
            label="Funding Rate" value={loading ? '—' : fundingPct}
            sub="BTC avg · per 8-hour settlement" source="Coinalyze"
            valueColor={fundingColor}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
            label="Open Interest" source="Coinalyze"
            value={loading ? '—' : formatUSD(c?.openInterest?.current || 0)}
            change={c?.openInterest?.change24h}
            charts={c?.openInterest?.charts}
            chartLabels={oiChartLabels}
            color="#2563eb"
            formatValue={fmtUSD}
          />
          <ChartCard
            label="Liquidations" source="Coinalyze"
            value={loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)}
            sub={c?.liquidations ? `Longs: ${formatUSD(c.liquidations.longs24h)} · Shorts: ${formatUSD(c.liquidations.shorts24h)}` : undefined}
            charts={c?.liquidations?.charts}
            chartLabels={liqChartLabels}
            color="#dc2626"
            formatValue={fmtUSD}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
            label="Volume" source="Coinalyze"
            value={loading ? '—' : formatUSD(c?.volume?.total24h || 0)}
            charts={c?.volume?.charts}
            chartLabels={volChartLabels}
            color="#16a34a"
            formatValue={fmtUSD}
          />
          <ChartCard
            label="Funding Rate" source="Coinalyze"
            value={loading ? '—' : fundingPct}
            sub={c?.fundingRate?.current > 0 ? 'Longs paying shorts' : c?.fundingRate?.current < 0 ? 'Shorts paying longs' : 'BTC avg across exchanges'}
            charts={c?.fundingRate?.charts}
            chartLabels={fundChartLabels}
            valueColor={fundingColor}
            color={fundingColor === 'var(--text)' ? '#6b6860' : fundingColor}
            formatValue={v => (v * 100).toFixed(4) + '%'}
          />
        </div>

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
