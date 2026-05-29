'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown, Sparkles, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { timeAgo, formatUSD } from '@/lib/utils';
import FearGreedCard from '@/components/FearGreedCard';
import OptionsCard from '@/components/OptionsCard';
import ETFCard from '@/components/ETFCard';

const REFRESH_INTERVAL = 5 * 60 * 1000;
const TIMEFRAMES = ['24h', '7d', '30d', '90d', '1y'] as const;
const SPOT_TIMEFRAMES = ['7d', '30d', '90d', '1y'] as const;
type TF = typeof TIMEFRAMES[number];
const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'] as const;
type Asset = typeof ASSETS[number];
const CHART_ASSETS = ['ALL', 'BTC', 'ETH', 'SOL', 'XRP'] as const;
type ChartAsset = typeof CHART_ASSETS[number];

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

function InsightPill({ text, type = 'neutral' }: { text: string; type?: 'bullish' | 'bearish' | 'neutral' | 'warning' }) {
  const styles: Record<string, React.CSSProperties> = {
    bullish: { background: '#dcfce7', color: '#166534' },
    bearish: { background: '#fee2e2', color: '#991b1b' },
    warning: { background: '#fef9c3', color: '#854d0e' },
    neutral: { background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  };
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 4,
      display: 'inline-block', marginTop: 5, fontWeight: 500,
      ...styles[type],
    }}>{text}</span>
  );
}

function calcRegime(data: any): { label: string; color: string; bg: string; border: string; detail: string } {
  const c = data?.coinalyze;
  const d = data?.deribit;
  const fg = data?.feargreed;

  const funding = c?.fundingRate?.current ?? 0;
  const oiChange = c?.openInterest?.change24h ?? 0;
  const longLiqs = c?.liquidations?.longs24h ?? 0;
  const shortLiqs = c?.liquidations?.shorts24h ?? 0;
  const skew = d?.skew?.BTC?.value25d ?? 0;
  const fearGreed = fg?.value ?? 50;

  const shortSqueeze = shortLiqs > longLiqs * 3;
  const longFlush = longLiqs > shortLiqs * 3;
  const fundingElevated = funding > 0.001;
  const fundingNegative = funding < -0.0005;
  const bearishSkew = skew > 4;
  const oiContracting = oiChange < -1;
  const oiFilling = oiChange > 1;
  const fearExtreme = fearGreed < 25;
  const greedExtreme = fearGreed > 75;

  if (longFlush && oiContracting && fearExtreme) {
    return { label: 'Risk-Off, Deleveraging', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5', detail: 'Long flush underway, OI contracting, fear elevated' };
  }
  if (shortSqueeze && oiFilling && fundingElevated) {
    return { label: 'Risk-On, Short Squeeze', color: '#166534', bg: '#dcfce7', border: '#86efac', detail: 'Shorts being flushed, OI building, funding positive' };
  }
  if (bearishSkew && oiContracting) {
    return { label: 'Cautious, Hedging Active', color: '#854d0e', bg: '#fef9c3', border: '#fde047', detail: 'Options market bid for puts, OI softening' };
  }
  if (fundingNegative && fearExtreme) {
    return { label: 'Risk-Off, Bearish Bias', color: '#991b1b', bg: '#fee2e2', border: '#fca5a5', detail: 'Funding negative, fear elevated' };
  }
  if (greedExtreme && fundingElevated && oiFilling) {
    return { label: 'Risk-On, Elevated', color: '#166534', bg: '#dcfce7', border: '#86efac', detail: 'Greed elevated, funding high, OI building, watch for flush' };
  }
  return { label: 'Neutral, Wait and See', color: '#374151', bg: '#f3f4f6', border: '#d1d5db', detail: 'No dominant signal across funding, OI and sentiment' };
}

function Sparkline({ data, color = '#2563eb', height = 80, labels, formatValue, onHoverChange }: {
  data: number[]; color?: string; height?: number;
  labels?: string[]; formatValue?: (v: number) => string;
  onHoverChange?: (value: number | null, label: string | null) => void;
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

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height, display: 'block', cursor: 'crosshair' }}
        preserveAspectRatio="none"
        onMouseMove={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const idx = Math.max(0, Math.min(data.length - 1, Math.round((e.clientX - rect.left) / rect.width * (data.length - 1))));
          setHoverIdx(idx);
          onHoverChange?.(data[idx], labels?.[idx] || null);
        }}
        onMouseLeave={() => {
          setHoverIdx(null);
          onHoverChange?.(null, null);
        }}
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
          position: 'absolute', bottom: '100%',
          left: `${tooltipLeft}%`,
          transform: tooltipLeft > 70 ? 'translateX(-100%)' : tooltipLeft < 20 ? 'translateX(0)' : 'translateX(-50%)',
          background: 'rgba(28,28,26,.92)', color: '#fff',
          padding: '4px 10px', borderRadius: 4, fontSize: 11,
          fontFamily: 'var(--mono)', pointerEvents: 'none',
          whiteSpace: 'nowrap', marginBottom: 6, zIndex: 10,
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

function AssetTabs({ active, onChange }: { active: ChartAsset; onChange: (a: ChartAsset) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {CHART_ASSETS.map(a => (
        <button key={a} onClick={() => onChange(a)} style={{
          padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600,
          background: active === a ? '#1a1917' : 'var(--surface2)',
          color: active === a ? '#fff' : 'var(--text-muted)',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}>{a}</button>
      ))}
    </div>
  );
}

function ChartCard({ label, source, snapshotValue, sub, change, chartsByAsset, valueColor, color, formatValue, timeframes = TIMEFRAMES }: {
  label: string; source?: string; snapshotValue: string; sub?: string; change?: number;
  chartsByAsset?: Record<string, Record<string, any[]>>;
  valueColor?: string; color?: string; formatValue?: (v: number) => string;
  timeframes?: readonly string[];
}) {
  const [tf, setTf] = useState(timeframes[0] as string);
  const [asset, setAsset] = useState<ChartAsset>('ALL');
  const [hovered, setHovered] = useState<{ value: number; label: string } | null>(null);

  const assetKey = asset === 'ALL' ? 'total' : asset;
  const chartData = chartsByAsset?.[assetKey]?.[tf] || [];
  const values = chartData.map((p: any) => p.v !== undefined ? p.v : (p.l || 0) + (p.s || 0));
  const isHourly = tf === '24h';
  const labels = chartData.map((p: any) => isHourly ? fmtTime(p.t) : fmtDate(p.t));
  const chartColor = color || valueColor || '#2563eb';

  const lastChartValue = values.length > 0 ? values[values.length - 1] : null;
  const displayValue = hovered
    ? (formatValue ? formatValue(hovered.value) : fmtUSD(hovered.value))
    : asset !== 'ALL' && lastChartValue !== null
      ? (formatValue ? formatValue(lastChartValue) : fmtUSD(lastChartValue))
      : snapshotValue;
  const displayLabel = hovered?.label || null;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={CARD_TITLE_STYLE}>{label}</div>
        {source && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source}</div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div>
          {displayLabel && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{displayLabel}</div>}
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor || 'var(--text)', lineHeight: 1.1 }}>{displayValue}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, minHeight: 18 }}>
            {!hovered && asset === 'ALL' && change !== undefined && <Badge value={change} />}
            {!hovered && asset === 'ALL' && sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {timeframes.map(t => (
              <button key={t} onClick={() => setTf(t)} style={{
                padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                background: tf === t ? 'var(--accent)' : 'var(--surface2)',
                color: tf === t ? '#fff' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>{t.toUpperCase()}</button>
            ))}
          </div>
          <AssetTabs active={asset} onChange={setAsset} />
        </div>
      </div>
      <Sparkline
        data={values} color={chartColor} height={80} labels={labels}
        formatValue={formatValue}
        onHoverChange={(v, l) => v !== null ? setHovered({ value: v, label: l || '' }) : setHovered(null)}
      />
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.02em' }}>{EXCHANGES}</div>
    </div>
  );
}

function FundingRateKPI({ byAsset, loading }: { byAsset?: Record<string, number>; loading: boolean }) {
  const [asset, setAsset] = useState<Asset>('BTC');
  const rate = byAsset?.[asset] || 0;
  const pct = !loading && rate !== 0 ? (rate * 100).toFixed(4) + '%' : '—';
  const rateColor = rate > 0 ? 'var(--green)' : rate < 0 ? 'var(--red)' : 'var(--text)';

  const getInsight = (r: number): { text: string; type: 'bullish' | 'bearish' | 'warning' | 'neutral' } => {
    if (r > 0.1) return { text: 'Elevated, longs overextended', type: 'warning' };
    if (r > 0.05) return { text: 'Positive, longs paying', type: 'neutral' };
    if (r > 0) return { text: 'Mild, not overextended', type: 'neutral' };
    if (r < -0.05) return { text: 'Negative, shorts paying', type: 'bullish' };
    return { text: 'Neutral', type: 'neutral' };
  };
  const insight = getInsight(rate);

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={CARD_TITLE_STYLE}>Funding Rate</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coinalyze</div>
      </div>
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {ASSETS.map(a => (
          <button key={a} onClick={() => setAsset(a)} style={{
            padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
            background: asset === a ? 'var(--accent)' : 'var(--surface2)',
            color: asset === a ? '#fff' : 'var(--text-muted)',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>{a}</button>
        ))}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: rateColor, lineHeight: 1.1, marginBottom: 4 }}>{pct}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Current 8H rate · avg across exchanges</div>
      {!loading && rate !== 0 && <InsightPill text={insight.text} type={insight.type} />}
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

function GlobalMetricsCard({ pricesData }: { pricesData: any }) {
  if (!pricesData?.globalMarketCap) return null;
  const rows = [
    { label: 'Total Market Cap', value: formatUSD(pricesData.globalMarketCap), source: 'CoinGecko' },
    { label: '24H Market Volume', value: formatUSD(pricesData.globalVolume24h), source: 'CoinGecko' },
    { label: 'BTC Dominance', value: pricesData.btcDominance?.toFixed(1) + '%', source: 'CoinGecko' },
    { label: 'ETH Dominance', value: pricesData.ethDominance?.toFixed(1) + '%', source: 'CoinGecko' },
  ];
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={CARD_TITLE_STYLE}>Global Market</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CoinGecko</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map(({ label, value, source }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 5 }}>{source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function RegimeBar({ data }: { data: any }) {
  const regime = calcRegime(data);
  const now = new Date();
  const timeStr = now.toLocaleString('en-SG', { timeZone: 'Asia/Singapore', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' SGT';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 16px',
      background: regime.bg,
      border: `1px solid ${regime.border}`,
      borderRadius: 8, marginBottom: 12,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: regime.color, opacity: 0.7 }}>Market Regime</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: regime.color }}>{regime.label}</span>
      <span style={{ fontSize: 11, color: regime.color, opacity: 0.75 }}>{regime.detail}</span>
      <span style={{ fontSize: 11, color: regime.color, opacity: 0.6, marginLeft: 'auto' }}>{timeStr}</span>
    </div>
  );
}

function CommentaryCard() {
  const [commentary, setCommentary] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/commentary', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCommentary(data.commentary);
      setSources(data.sources || []);
      setGeneratedAt(data.generatedAt);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <span style={CARD_TITLE_STYLE}>Daily Market Commentary</span>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 6,
            fontSize: 12, fontWeight: 500,
            background: loading ? 'var(--surface2)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : '#fff',
            border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {loading ? 'Generating...' : commentary ? 'Regenerate' : 'Generate for today'}
        </button>
      </div>

      {!commentary && !loading && !error && (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 13,
          borderTop: '1px solid var(--border)',
        }}>
          Click "Generate for today" to produce an AI-written market briefing based on live data and today's news.
        </div>
      )}

      {loading && (
        <div style={{
          padding: '24px 0', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 13,
          borderTop: '1px solid var(--border)',
        }}>
          <Loader2 size={16} className="animate-spin" style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
          Searching today's news and analysing market structure...
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 6,
          background: 'var(--red-light)', border: '1px solid #fecaca',
          fontSize: 12, color: 'var(--red)',
        }}>
          Error generating commentary: {error}
        </div>
      )}

      {commentary && !loading && (
        <>
          <div style={{
            fontSize: 13, lineHeight: 1.8,
            color: 'var(--text)',
            borderLeft: '2px solid var(--border)',
            paddingLeft: 16,
            borderTop: '1px solid var(--border)',
            paddingTop: 12,
          }}>
            {commentary}
          </div>

          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            {generatedAt && (
              <span style={{
                fontSize: 10, color: 'var(--text-muted)',
                padding: '2px 8px', borderRadius: 4,
                background: 'var(--surface2)',
              }}>
                Generated {new Date(generatedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' })} SGT
              </span>
            )}
            <span style={{
              fontSize: 10, color: 'var(--text-muted)',
              padding: '2px 8px', borderRadius: 4,
              background: 'var(--surface2)',
            }}>
              Live data + Web search
            </span>
          </div>

          {sources.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Sources
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sources.map((s: { title: string; url: string }, i: number) => (
  <button
    key={i}
    onClick={() => window.open(s.url, '_blank', 'noopener,noreferrer')}
    style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 4,
      background: 'var(--surface2)',
      color: 'var(--accent)',
      border: '1px solid var(--border)',
      textDecoration: 'none',
      fontWeight: 500,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }}
  >{s.title}</button>
))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildSpotVolumeCharts(rawData: any): Record<string, Record<string, any[]>> {
  if (!rawData) return {};
  const now = Date.now() / 1000;
  const result: Record<string, Record<string, any[]>> = {};
  const assets = ['total', 'BTC', 'ETH', 'SOL', 'XRP'];
  for (const asset of assets) {
    const all: any[] = rawData[asset] || [];
    result[asset] = {
      '7d':  all.filter(p => p.t > now - 7*86400),
      '30d': all.filter(p => p.t > now - 30*86400),
      '90d': all.filter(p => p.t > now - 90*86400),
      '1y':  all,
    };
  }
  return result;
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
  const spotVolumeCharts = buildSpotVolumeCharts(data?.spotvolume);

  const longLiqs = c?.liquidations?.longs24h ?? 0;
  const shortLiqs = c?.liquidations?.shorts24h ?? 0;
  const liqInsight = shortLiqs > longLiqs * 3
    ? { text: 'Short squeeze, not deleveraging', type: 'bullish' as const }
    : longLiqs > shortLiqs * 3
    ? { text: 'Long flush, deleveraging event', type: 'bearish' as const }
    : { text: 'Mixed, no dominant direction', type: 'neutral' as const };

  const oiChange = c?.openInterest?.change24h ?? 0;
  const oiInsight = oiChange > 1
    ? { text: 'Building, new money entering', type: 'warning' as const }
    : oiChange < -1
    ? { text: 'Contracting, de-risking signal', type: 'warning' as const }
    : { text: 'Stable, no major shift', type: 'neutral' as const };

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

        {data && <RegimeBar data={data} />}
        <CommentaryCard />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <SpotPriceCard prices={prices} />
          <GlobalMetricsCard pricesData={pricesData} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={CARD_TITLE_STYLE}>Open Interest</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coinalyze</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 4 }}>
              {loading ? '—' : formatUSD(c?.openInterest?.current || 0)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 18 }}>
              <Badge value={c?.openInterest?.change24h} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>BTC/ETH/SOL/XRP</span>
            </div>
            {!loading && <InsightPill text={oiInsight.text} type={oiInsight.type} />}
          </div>

          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={CARD_TITLE_STYLE}>Total Market Volume</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>CoinGecko</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 4 }}>
              {loading ? '—' : pricesData?.globalVolume24h ? formatUSD(pricesData.globalVolume24h) : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>All assets · All exchanges · 24H</div>
          </div>

          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={CARD_TITLE_STYLE}>Liquidations 24H</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coinalyze</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, marginBottom: 4 }}>
              {loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)}
            </div>
            {c?.liquidations && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Longs: {formatUSD(c.liquidations.longs24h)} · Shorts: {formatUSD(c.liquidations.shorts24h)}
              </div>
            )}
            {!loading && <InsightPill text={liqInsight.text} type={liqInsight.type} />}
          </div>

          <FundingRateKPI byAsset={c?.fundingRate?.byAsset} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
            label="Open Interest" source="Coinalyze"
            snapshotValue={loading ? '—' : formatUSD(c?.openInterest?.current || 0)}
            change={c?.openInterest?.change24h}
            chartsByAsset={c?.openInterest?.chartsByAsset}
            color="#2563eb" formatValue={fmtUSD}
          />
          <ChartCard
            label="Liquidations" source="Coinalyze"
            snapshotValue={loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)}
            sub={c?.liquidations ? `Longs: ${formatUSD(c.liquidations.longs24h)} · Shorts: ${formatUSD(c.liquidations.shorts24h)}` : undefined}
            chartsByAsset={c?.liquidations?.chartsByAsset}
            color="#dc2626" formatValue={fmtUSD}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
            label="Spot Volume — BTC/ETH/SOL/XRP" source="CoinGecko"
            snapshotValue="—"
            chartsByAsset={spotVolumeCharts}
            color="#7c3aed" formatValue={fmtUSD}
            timeframes={SPOT_TIMEFRAMES}
          />
          <ChartCard
            label="Funding Rate" source="Coinalyze"
            snapshotValue={!loading && c?.fundingRate?.current !== 0 ? (c?.fundingRate?.current * 100).toFixed(4) + '%' : '—'}
            sub={c?.fundingRate?.current > 0 ? 'Longs paying shorts' : c?.fundingRate?.current < 0 ? 'Shorts paying longs' : 'Avg per 8-hour settlement'}
            chartsByAsset={c?.fundingRate?.chartsByAsset}
            valueColor={!c?.fundingRate?.current ? 'var(--text)' : c?.fundingRate?.current > 0 ? 'var(--green)' : 'var(--red)'}
            color={!c?.fundingRate?.current ? '#6b6860' : c?.fundingRate?.current > 0 ? 'var(--green)' : '#dc2626'}
            formatValue={v => (v * 100).toFixed(4) + '%'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FearGreedCard data={fg} loading={loading} />
          <OptionsCard data={d} loading={loading} />
          <ETFCard data={etf} loading={loading} />
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
          Derivatives: Coinalyze ({EXCHANGES}) · Prices, Volume & Global: CoinGecko · Options & Basis: Deribit · Sentiment: Alternative.me · ETF Flows: Farside Investors
        </div>
      </main>
    </div>
  );
}
