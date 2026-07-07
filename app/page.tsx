'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown, Sparkles, Loader2, Newspaper } from 'lucide-react';
import Image from 'next/image';
import { timeAgo, formatUSD } from '@/lib/utils';
import FearGreedCard from '@/components/FearGreedCard';
import OptionsCard from '@/components/OptionsCard';
import DailyNoteModal from '@/components/DailyNoteModal';
import HealthCheckPanel from '@/components/HealthCheckPanel';

const REFRESH_INTERVAL = 5 * 60 * 1000;
const TIMEFRAMES = ['24h', '7d', '30d', '90d', '1y'] as const;
const SPOT_TIMEFRAMES = ['7d', '30d', '90d', '1y'] as const;
const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'] as const;
type Asset = typeof ASSETS[number];
const CHART_ASSETS = ['ALL', 'BTC', 'ETH', 'SOL', 'XRP'] as const;
type ChartAsset = typeof CHART_ASSETS[number];
const FUND_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'HYPE'] as const;
type FundAsset = typeof FUND_ASSETS[number];

const LIQ_COVERAGE = 'Binance, Bybit, OKX, Hyperliquid, Gate.io/Huobi per asset. ~82% of liquidations Coinalyze attributes to BTC/ETH/SOL/XRP/HYPE (~69% of all-coin total). Ceiling of Coinalyze free tier. Source: Coinalyze.';
const OI_COVERAGE = 'Binance, Bybit, OKX, Hyperliquid, Deribit/Gate.io/Huobi per asset. ~$29B = ~82% of the OI Coinalyze attributes to BTC/ETH/SOL/XRP/HYPE (~69% of all-coin total). Ceiling of Coinalyze free tier. Source: Coinalyze.';
const FUND_COVERAGE = 'Annualized mean funding rate across major perp venues per asset, computed aggregate. Source: Coinalyze.';

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
// Coinalyze funding values are per-settlement rates; annualize (3 settlements/day
// x 365) to match the scale shown in the prior dashboard/Daily Note.
function fmtPct2(v: number | null | undefined): string {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + (v * 3 * 365).toFixed(2) + '%';
}
function pctChange(latest?: number | null, prev?: number | null): number | undefined {
  if (typeof latest !== 'number' || typeof prev !== 'number' || prev === 0) return undefined;
  return ((latest - prev) / Math.abs(prev)) * 100;
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

function calcRegime(data: any): { label: string; color: string; bg: string; border: string; detail: string } {
  const c = data?.coinalyze;
  const fg = data?.feargreed;

  // Annualized funding as a percent (3 settlements/day x 365), same scale the
  // thresholds below were tuned for (e.g. >10 means >10% APR).
  const fundingApy = (c?.fundingRate?.byAsset?.BTC ?? 0) * 3 * 365;
  const oiChart = c?.openInterest?.chartsByAsset?.BTC?.['7d'] || [];
  const oiLatest = oiChart.length ? oiChart[oiChart.length - 1].v : 0;
  const oiFirst = oiChart.length ? oiChart[0].v : 0;
  const oiChange7d = pctChange(oiLatest, oiFirst) ?? 0;
  const longLiqs = c?.liquidations?.longs24h ?? 0;
  const shortLiqs = c?.liquidations?.shorts24h ?? 0;
  const skew = data?.deribit?.skew?.BTC?.value25d ?? 0;
  const fearGreed = fg?.current?.value ?? 50;

  const shortSqueeze = shortLiqs > longLiqs * 3;
  const longFlush = longLiqs > shortLiqs * 3;
  const fundingElevated = fundingApy > 10;
  const fundingNegative = fundingApy < -3;
  const bearishSkew = skew > 4;
  const oiContracting = oiChange7d < -5;
  const oiFilling = oiChange7d > 5;
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
  if (oiContracting && fundingApy < 3) {
    return { label: 'De-Risking, Leverage Unwinding', color: '#854d0e', bg: '#fef9c3', border: '#fde047', detail: 'Futures OI contracting over 7 days, funding subdued' };
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

function MiniTabs({ options, active, onChange }: { options: readonly string[]; active: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {options.map(a => (
        <button key={a} onClick={() => onChange(a)} style={{
          padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600,
          background: active === a ? 'var(--accent)' : 'var(--surface2)',
          color: active === a ? '#fff' : 'var(--text-muted)',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}>{a}</button>
      ))}
    </div>
  );
}

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

function ChartCard({ label, source, snapshotValue, sub, change, chartsByAsset, valueColor, color, formatValue, timeframes = TIMEFRAMES, footer }: {
  label: string; source?: string; snapshotValue: string; sub?: string; change?: number;
  chartsByAsset?: Record<string, Record<string, any[]>>;
  valueColor?: string; color?: string; formatValue?: (v: number) => string;
  timeframes?: readonly string[]; footer?: string;
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
      {footer && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, letterSpacing: '0.02em' }}>{footer}</div>}
    </div>
  );
}

// Open Interest, sourced from Coinalyze. Fuller layout (taller chart + per-asset
// breakdown) so it sits consistently beside the Funding card. NOTE: values are
// currently the tracked-majors subset; the all-markets total fix lives in the cron.
// Simplified OpenInterestCard — CoinGlass all-market headline only.
// The Coinalyze time-series chart has been removed: showing a ~$29B
// subset chart under a $107B all-market headline was misleading.
// Per-asset breakdown retained as directional context (Coinalyze subset).

function OpenInterestCard({ c, loading }: { c: any; loading: boolean }) {
  const cgOI      = c?.openInterest?.cgStatusOk ? (c?.openInterest?.cgAllMarketOI ?? null) : null;
  const caOI      = c?.openInterest?.current ?? 0;
  const headline  = cgOI ?? caOI;
  const change24h = c?.openInterest?.change24h;
  const source    = cgOI ? 'CoinGlass' : 'Coinalyze';

  const cgLiqs    = c?.liquidations?.cgStatusOk ? c?.liquidations?.cgTotal24h : null;
  const cgLongs   = c?.liquidations?.cgStatusOk ? c?.liquidations?.cgLongs24h : null;
  const cgShorts  = c?.liquidations?.cgStatusOk ? c?.liquidations?.cgShorts24h : null;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={CARD_TITLE_STYLE}>Futures Open Interest</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.1 }}>
          {loading || headline == null ? '...' : fmtUSD(headline)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {change24h !== undefined && <Badge value={change24h} />}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>vs 24 hours ago</span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          24H Liquidations
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.1, marginBottom: 6 }}>
          {loading || cgLiqs == null ? '...' : fmtUSD(cgLiqs)}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Longs: <span style={{ color: 'var(--red)', fontWeight: 600 }}>{cgLongs != null ? fmtUSD(cgLongs) : '—'}</span></span>
          <span>Shorts: <span style={{ color: 'var(--green)', fontWeight: 600 }}>{cgShorts != null ? fmtUSD(cgShorts) : '—'}</span></span>
        </div>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.4 }}>
        All-market figures across all coins and exchanges. Source: CoinGlass.
      </div>
    </div>
  );
}

const FUNDING_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c'];

// Funding, sourced from Coinalyze for all five assets (decision: single
// source for consistency, now that The Block is fully retired). NOTE: this
// is a mean across whichever exchanges Coinalyze's symbol list covers per
// asset — a computed aggregate, same caveat that triggered the original
// funding-card redesign, just on a different vendor. Labelled as such below.
function FundingCard({ c, loading }: { c: any; loading: boolean }) {
  const [days, setDays] = useState<number>(30);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<{ x: number; items: { name: string; value: number; color: string }[]; label: string } | null>(null);

  const chartsByAsset: Record<string, Record<string, any[]>> = c?.fundingRate?.chartsByAsset || {};
  const tfKey = days === 30 ? '30d' : days === 90 ? '90d' : '1y';

  const colorFor = (i: number) => FUNDING_COLORS[i % FUNDING_COLORS.length];
  const toggle = (name: string) => setHidden(h => ({ ...h, [name]: !h[name] }));

  const lines = FUND_ASSETS.map((name, i) => {
    const pts = chartsByAsset?.[name]?.[tfKey] || [];
    return { name, color: colorFor(i), points: pts, hidden: !!hidden[name] };
  });

  const visibleLines = lines.filter(l => !l.hidden && l.points.length > 1);
  const allValues = visibleLines.flatMap(l => l.points.map((p: any) => p.v));
  const minV = allValues.length ? Math.min(...allValues) : 0;
  const maxV = allValues.length ? Math.max(...allValues) : 1;
  const range = maxV - minV || 1;

  const axisLine = visibleLines.reduce((a, b) => (b.points.length > a.points.length ? b : a), visibleLines[0] || { points: [] });
  const axisTs: number[] = (axisLine.points || []).map((p: any) => p.t);

  const W = 400, H = 110;
  const xFor = (i: number, n: number) => n <= 1 ? 0 : (i / (n - 1)) * W;
  const yFor = (v: number) => H - ((v - minV) / range) * (H - 10) - 5;

  // Today / 7d-ago / 30d-ago snapshot per asset, derived from the 90d series
  // so the "7d ago" / "30d ago" lookups have enough history regardless of
  // the chart's currently-selected timeframe.
  // "Today" = Coinalyze live FR AVG (matches coinalyze.net markets page). 7d/30d
  // ago come from the historical funding series for week/month-over-month trend.
  const byAsset: Record<string, number> = c?.fundingRate?.byAsset || {};
  const lookback = (name: string, daysAgo: number): number | null => {
    if (daysAgo === 0) {
      return typeof byAsset[name] === 'number' ? byAsset[name] : null;
    }
    const series = chartsByAsset?.[name]?.['90d'] || chartsByAsset?.[name]?.['1y'] || [];
    if (!series.length) return null;
    const cutoff = series[series.length - 1].t - daysAgo * 86400;
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].t <= cutoff) return series[i].v;
    }
    return null;
  };

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={CARD_TITLE_STYLE}>Funding Rate (annualized)</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coinalyze</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {[{ label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map(t => (
            <button key={t.label} onClick={() => { setDays(t.days); setHover(null); }} style={{
              padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600,
              background: days === t.days ? 'var(--accent)' : 'var(--surface2)',
              color: days === t.days ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {loading || !visibleLines.length ? (
        <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          {loading ? 'Loading...' : 'No data'}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
            preserveAspectRatio="none"
            onMouseMove={e => {
              if (!axisTs.length) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const idx = Math.max(0, Math.min(axisTs.length - 1, Math.round((e.clientX - rect.left) / rect.width * (axisTs.length - 1))));
              const ts = axisTs[idx];
              const items = visibleLines.map(l => {
                const match = l.points.find((p: any) => p.t === ts) || l.points[Math.min(idx, l.points.length - 1)];
                return match ? { name: l.name, value: match.v, color: l.color } : null;
              }).filter(Boolean) as { name: string; value: number; color: string }[];
              setHover({ x: xFor(idx, axisTs.length), items, label: fmtDate(ts) });
            }}
            onMouseLeave={() => setHover(null)}
          >
            {minV < 0 && maxV > 0 && (
              <line x1={0} y1={yFor(0)} x2={W} y2={yFor(0)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />
            )}
            {visibleLines.map(l => {
              const pts = l.points.map((p: any, i: number) => `${xFor(i, l.points.length)},${yFor(p.v)}`).join(' ');
              return <polyline key={l.name} points={pts} fill="none" stroke={l.color} strokeWidth="1.3" />;
            })}
            {hover && <line x1={hover.x} y1={0} x2={hover.x} y2={H} stroke="var(--text-muted)" strokeWidth="0.5" strokeDasharray="3,3" />}
          </svg>
          {hover && hover.items.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%',
              left: `${(hover.x / W) * 100}%`,
              transform: (hover.x / W) > 0.6 ? 'translateX(-100%)' : 'translateX(0)',
              background: 'rgba(28,28,26,.94)', color: '#fff',
              padding: '5px 9px', borderRadius: 4, fontSize: 10,
              fontFamily: 'var(--mono)', pointerEvents: 'none',
              whiteSpace: 'nowrap', marginBottom: 6, zIndex: 10,
            }}>
              <div style={{ opacity: 0.65, marginBottom: 3 }}>{hover.label}</div>
              {hover.items.sort((a, b) => b.value - a.value).map(it => (
                <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: it.color, display: 'inline-block' }} />
                  <span style={{ minWidth: 36 }}>{it.name}</span>
                  <span style={{ fontWeight: 600 }}>{fmtPct2(it.value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {FUND_ASSETS.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8 }}>
          {FUND_ASSETS.map((name, i) => (
            <button key={name} onClick={() => toggle(name)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: 'inherit', opacity: hidden[name] ? 0.35 : 1,
            }}>
              <span style={{ width: 9, height: 2.5, background: colorFor(i), display: 'inline-block', borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textDecoration: hidden[name] ? 'line-through' : 'none' }}>{name}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '3px 12px', fontSize: 10 }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Asset</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Today</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>7d ago</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>30d ago</span>
          {FUND_ASSETS.map((name, i) => {
            const today = lookback(name, 0);
            const d7 = lookback(name, 7);
            const d30 = lookback(name, 30);
            return (
              <React.Fragment key={name}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 2.5, background: colorFor(i), display: 'inline-block', borderRadius: 1 }} />
                  <span style={{ color: 'var(--text)' }}>{name}</span>
                </span>
                <span style={{ textAlign: 'right', color: (today ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtPct2(today)}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmtPct2(d7)}</span>
                <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmtPct2(d30)}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>{FUND_COVERAGE}</div>
    </div>
  );
}

function SpotEtfCard({ etfFarside, loading }: { etfFarside: any; loading: boolean }) {
  const ETF_TABS = ['BTC', 'ETH', 'SOL', 'HYPE'] as const;
  const [asset, setAsset] = useState<string>('BTC');

  // All four assets now read from Farside (decision: swap ETF flows fully
  // to Farside, drop The Block). Shape mirrors what the SOL branch already
  // produced — Farside's scraped data has `latest.total` and `last30Days`.
  const key = asset.toLowerCase() as 'btc' | 'eth' | 'sol' | 'hype';
  const assetData = etfFarside?.[key];
  const flowVal = typeof assetData?.latest?.total === 'number' ? assetData.latest.total * 1e6 : null;
  const flowColor = flowVal == null ? 'var(--text)' : flowVal >= 0 ? 'var(--green)' : 'var(--red)';
  const movers: [string, number][] = Object.entries(assetData?.latest?.flows || {})
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3);
  const lastTradingDay = assetData?.lastTradingDay;

  const history = (assetData?.last30Days || []).map((d: any) => ({
    t: Math.floor(new Date(d.date).getTime() / 1000),
    v: (d.total || 0) * 1e6,
  }));
  const values = history.map((p: any) => p.v);
  const labels = history.map((p: any) => fmtDate(p.t));

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={CARD_TITLE_STYLE}>Spot ETF Flows</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Farside Investors</div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <MiniTabs options={ETF_TABS} active={asset} onChange={setAsset} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: flowColor, lineHeight: 1.1, marginBottom: 2 }}>
        {loading || flowVal == null ? '...' : (flowVal >= 0 ? '+' : '') + fmtUSD(flowVal).replace('$-', '-$')}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        {lastTradingDay ? `Net flow across all funds, latest trading day (${lastTradingDay})` : 'Net flow across all funds'}
      </div>
      {movers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
          {movers.map(([name, v]) => (
            <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: 'var(--text-muted)' }}>{name}</span>
              <span style={{ fontWeight: 600, color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>{(v >= 0 ? '+' : '') + fmtUSD(v).replace('$-', '-$')}</span>
            </div>
          ))}
        </div>
      )}
      <Sparkline data={values} color="#0891b2" height={44} labels={labels} formatValue={v => (v >= 0 ? '+' : '') + fmtUSD(v).replace('$-', '-$')} />
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6 }}>
        Farside updates after US market close; the latest trading day may lag by one calendar day.
      </div>
    </div>
  );
}

// Replaces BlockMacroCard. Stablecoins + RWA from DefiLlama, Strategy
// holdings from CoinGecko treasury, ETF AUM from SoSoValue (true market
// value, not a cumulative-flow figure).
function MacroCard({ macro, c, etfFarside, loading }: { macro: any; c: any; etfFarside: any; loading: boolean }) {
  const sc = macro?.stablecoins;
  const rwa = macro?.rwa;
  const strategy = macro?.strategy;
  const aumBtc = typeof etfFarside?.btc?.cumulativeTotal === 'number' ? etfFarside.btc.cumulativeTotal * 1e6 : null;
  const aumEth = typeof etfFarside?.eth?.cumulativeTotal === 'number' ? etfFarside.eth.cumulativeTotal * 1e6 : null;
  const aumSol = typeof etfFarside?.sol?.cumulativeTotal === 'number' ? etfFarside.sol.cumulativeTotal * 1e6 : null;
  const aumXrp = c?.xrpEtf?.totalMarketCap ?? null;
  const values = (sc?.history || []).map((p: any) => p.v);
  const labels = (sc?.history || []).map((p: any) => fmtDate(p.t));

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={CARD_TITLE_STYLE}>Stablecoins & Strategy</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>DefiLlama / CoinGecko</div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', lineHeight: 1.1, marginBottom: 2 }}>
        {loading || sc?.latest == null ? '...' : fmtUSD(sc.latest)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Badge value={pctChange(sc?.latest, sc?.sevenDaysAgo)} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total supply, sum of all stablecoins (computed aggregate). Source: DefiLlama.</span>
      </div>
      <Sparkline data={values} color="#16a34a" height={44} labels={labels} formatValue={fmtUSD} />
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Tokenised RWA (TVL)</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{rwa?.latest != null ? fmtUSD(rwa.latest) : '...'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Strategy BTC Holdings</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{strategy?.holdings != null ? strategy.holdings.toLocaleString('en-US') + ' BTC' : '...'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg Purchase Price</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{strategy?.avgPrice != null ? '$' + Math.round(strategy.avgPrice).toLocaleString('en-US') : '...'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total ETF AUM (BTC)</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{aumBtc != null ? fmtUSD(aumBtc) : 'Data Not Published'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total ETF AUM (ETH)</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{aumEth != null ? fmtUSD(aumEth) : 'Data Not Published'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total ETF AUM (SOL)</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{aumSol != null ? fmtUSD(aumSol) : 'Data Not Published'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total ETF AUM (XRP)</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{aumXrp != null ? fmtUSD(aumXrp) : 'Data Not Published'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total ETF AUM (HYPE)</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{c?.hypeEtf?.totalMarketCap != null ? fmtUSD(c.hypeEtf.totalMarketCap) : 'Data Not Published'}</span>
        </div>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8 }}>
        RWA TVL: sum across DefiLlama&apos;s RWA category, computed aggregate. Strategy holdings: CoinGecko treasury data. ETF AUM: BTC/ETH/SOL/HYPE cumulative net flow from Farside Investors; XRP from CoinGlass.
      </div>
    </div>
  );
}

function HeadlinesCard({ news }: { news: any[] }) {
  if (!news || news.length === 0) return null;
  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Newspaper size={14} style={{ color: 'var(--accent)' }} />
        <span style={CARD_TITLE_STYLE}>Latest Headlines</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
        {news.slice(0, 10).map((a: any) => (
          <button
            key={a.id}
            onClick={() => a.url && window.open(a.url, '_blank', 'noopener,noreferrer')}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              background: 'none', border: 'none', cursor: 'pointer',
              textAlign: 'left', padding: '3px 0', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{a.title}</span>
            {a.category && <span style={{ fontSize: 9, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.category}</span>}
          </button>
        ))}
      </div>
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
              {p.price ? '$' + p.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'}
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
  const [showDailyNote, setShowDailyNote] = useState(false);

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
  const macro = data?.macro;
  const pricesData = data?.prices;
  const prices = pricesData?.prices;
  const spotVolumeCharts = buildSpotVolumeCharts(data?.spotvolume);

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
            <button onClick={() => setShowDailyNote(true)} style={{
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 6,
  fontSize: 13, fontWeight: 500, background: '#fff',
  color: '#1a1917', border: '1px solid #e5e7eb',
  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
}}>
  Daily Note
</button>
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

        <HealthCheckPanel />
        {data && <RegimeBar data={data} />}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <SpotPriceCard prices={prices} />
          <GlobalMetricsCard pricesData={pricesData} />
        </div>

        {/* The Volatility & Options card (The Block) has been removed.
            OptionsCard below now also carries Deribit-only options OI. */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <FundingCard c={c} loading={loading} />
          <OpenInterestCard c={c} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <SpotEtfCard etfFarside={data?.etf} loading={loading} />
          <MacroCard macro={macro} c={c} etfFarside={data?.etf} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <ChartCard
  label="Liquidations"
  source={c?.liquidations?.cgStatusOk ? 'CoinGlass' : 'Coinalyze'}
  snapshotValue={loading ? '...' : formatUSD(
    c?.liquidations?.cgStatusOk ? (c.liquidations.cgTotal24h || 0) : (c?.liquidations?.total24h || 0)
  )}
  sub={c?.liquidations?.cgStatusOk
    ? `Longs: ${formatUSD(c.liquidations.cgLongs24h)} · Shorts: ${formatUSD(c.liquidations.cgShorts24h)}${c.liquidations.cgTraders24h ? ' · ' + c.liquidations.cgTraders24h.toLocaleString() + ' traders' : ''}`
    : c?.liquidations ? `Longs: ${formatUSD(c.liquidations.longs24h)} · Shorts: ${formatUSD(c.liquidations.shorts24h)} (Coinalyze ~40% coverage)` : undefined}
  chartsByAsset={c?.liquidations?.chartsByAsset}
  color="#dc2626" formatValue={fmtUSD}
  footer={c?.liquidations?.cgStatusOk
    ? `All-market 24H liquidations from CoinGlass. Largest: ${(c.liquidations.cgLargestLiquidation?.exchange ?? '')} ${(c.liquidations.cgLargestLiquidation?.symbol ?? '')} ${formatUSD(c.liquidations.cgLargestLiquidation?.value ?? 0)}. Chart: Coinalyze (~82% of 5-asset universe).`
    : LIQ_COVERAGE}
/>
          <ChartCard
            label="Spot Volume" source="CoinGecko"
            snapshotValue="..."
            chartsByAsset={spotVolumeCharts}
            color="#7c3aed" formatValue={fmtUSD}
            timeframes={SPOT_TIMEFRAMES}
            footer="Sum of BTC, ETH, SOL, XRP spot volume across all exchanges, computed aggregate. Source: CoinGecko."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FearGreedCard data={fg} loading={loading} />
          <OptionsCard data={d} loading={loading} />
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
          Derivatives & Funding: Coinalyze · ETF Flows: Farside Investors · ETF AUM: Farside / CoinGlass · Stablecoins & RWA: DefiLlama · Strategy: CoinGecko · Spot & Global: CoinGecko · Skew, Basis & Options OI: Deribit · Sentiment: Alternative.me
        </div>

        {showDailyNote && (
          <DailyNoteModal data={data} onClose={() => setShowDailyNote(false)} />
        )}
      </main>
    </div>
  );
}
