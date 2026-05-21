'use client';
import { useState } from 'react';
import { DeribitData } from '@/lib/types';

interface Props { data?: DeribitData; loading: boolean; }

const TIMEFRAMES = ['24h', '7d', '30d', '90d', '1y'] as const;
type TF = typeof TIMEFRAMES[number];
const SYMBOLS = ['BTC', 'ETH'] as const;
type Sym = typeof SYMBOLS[number];

const CARD_TITLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: '#1a1917',
};

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function OptionsCard({ data, loading }: Props) {
  const [tf, setTf] = useState<TF>('24h');
  const [sym, setSym] = useState<Sym>('BTC');
  const [hovered, setHovered] = useState<{ v: number; label: string } | null>(null);

  const chartsByAsset = data?.dvol?.chartsByAsset;
  const chartData = chartsByAsset?.[sym]?.[tf] || [];
  const values = chartData.map((p: any) => p.v);
  const labels = chartData.map((p: any) => tf === '24h' ? fmtTime(p.t) : fmtDate(p.t));

  const current = hovered
    ? hovered.v
    : chartsByAsset?.[sym]?.['24h']?.slice(-1)[0]?.v ?? data?.dvol?.current;

  const skewData = data?.skew?.[sym] || data?.skew;
  const skew25d = skewData?.value25d;
  const skewColor = skew25d === null || skew25d === undefined ? 'var(--text-muted)'
    : skew25d > 3 ? 'var(--red)' : skew25d < -3 ? 'var(--green)' : '#d97706';
  const skewLabel = skew25d === null || skew25d === undefined ? 'Puts IV minus Calls IV at 25Δ'
    : skew25d > 5 ? 'Bearish — puts bid up'
    : skew25d > 2 ? 'Mildly bearish'
    : skew25d < -5 ? 'Bullish — calls bid up'
    : skew25d < -2 ? 'Mildly bullish'
    : 'Neutral positioning';

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 100;
  const range = max - min || 1;
  const W = 400, H = 80;

  const getPoint = (i: number) => ({
    x: (i / Math.max(values.length - 1, 1)) * W,
    y: H - ((values[i] - min) / range) * (H - 8) - 4,
  });

  const polyline = values.map((_, i) => { const p = getPoint(i); return `${p.x},${p.y}`; }).join(' ');

  const hoverIdx = hovered ? values.indexOf(hovered.v) : -1;
  const hoverPoint = hoverIdx >= 0 ? getPoint(hoverIdx) : null;
  const tooltipLeft = hoverPoint ? (hoverPoint.x / W * 100) : 0;

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={CARD_TITLE}>Options · Volatility & Skew</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Deribit</div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 180 }} /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '12px', border: '1px solid var(--border)' }}>
              <div style={{ ...CARD_TITLE, marginBottom: 4 }}>DVOL</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                {current !== null && current !== undefined ? `${(current as number).toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                30-day implied vol · {sym} VIX
              </div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '12px', border: '1px solid var(--border)' }}>
              <div style={{ ...CARD_TITLE, marginBottom: 4 }}>25Δ Put/Call Skew</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: skewColor }}>
                {skew25d !== null && skew25d !== undefined
                  ? `${skew25d >= 0 ? '+' : ''}${skew25d.toFixed(1)}` : '—'}
              </div>
              <div style={{ fontSize: 10, color: skewColor, marginTop: 3, lineHeight: 1.4, fontWeight: 500 }}>
                {skewLabel}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              DVOL — {hovered ? hovered.label : tf.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {TIMEFRAMES.map(t => (
                  <button key={t} onClick={() => { setTf(t); setHovered(null); }} style={{
                    padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                    background: tf === t ? 'var(--accent)' : 'var(--surface2)',
                    color: tf === t ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {SYMBOLS.map(s => (
                  <button key={s} onClick={() => { setSym(s); setHovered(null); }} style={{
                    padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                    background: sym === s ? '#1a1917' : 'var(--surface2)',
                    color: sym === s ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            {values.length > 1 ? (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
                preserveAspectRatio="none"
                onMouseMove={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const idx = Math.max(0, Math.min(values.length - 1, Math.round((e.clientX - rect.left) / rect.width * (values.length - 1))));
                  setHovered({ v: values[idx], label: labels[idx] || '' });
                }}
                onMouseLeave={() => setHovered(null)}
              >
                <polyline points={polyline} fill="none" stroke="#2563eb" strokeWidth="1.5" />
                {hoverPoint && (
                  <>
                    <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={H} stroke="#2563eb" strokeWidth="0.5" strokeDasharray="3,3" />
                    <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3.5" fill="#2563eb" />
                  </>
                )}
              </svg>
            ) : (
              <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No chart data</div>
            )}
            {hovered && (
              <div style={{
                position: 'absolute', bottom: '100%',
                left: `${tooltipLeft}%`,
                transform: tooltipLeft > 70 ? 'translateX(-100%)' : tooltipLeft < 20 ? 'translateX(0)' : 'translateX(-50%)',
                background: 'rgba(28,28,26,.92)', color: '#fff',
                padding: '4px 10px', borderRadius: 4, fontSize: 11,
                fontFamily: 'var(--mono)', pointerEvents: 'none',
                whiteSpace: 'nowrap', marginBottom: 6, zIndex: 10,
              }}>
                <div style={{ fontSize: 9, opacity: 0.65, marginBottom: 1 }}>{hovered.label}</div>
                {(hovered.v).toFixed(1)}%
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
