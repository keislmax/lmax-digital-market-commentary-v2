'use client';
import { useState } from 'react';
import { FearGreedData } from '@/lib/types';
import { fearGreedColor } from '@/lib/utils';

interface Props { data?: FearGreedData; loading: boolean; }

const TIMEFRAMES = ['7d', '30d'] as const;
type TF = typeof TIMEFRAMES[number];

const CARD_TITLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: '#1a1917',
};

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function FearGreedCard({ data, loading }: Props) {
  const [tf, setTf] = useState<TF>('30d');
  const [hovered, setHovered] = useState<{ v: number; label: string; date: string } | null>(null);

  const value = data?.current?.value;
  const label = data?.current?.label;
  const color = value !== undefined ? fearGreedColor(value) : 'var(--text-muted)';

  const allChart = data?.chart || [];
  const now = Date.now() / 1000;
  const daysMap: Record<TF, number> = { '7d': 7, '30d': 30 };
  const chart = allChart.filter(p => p.t > now - daysMap[tf] * 86400);

  const pct = value !== undefined ? (value / 100) * 180 : 90;
  const rad = ((180 - pct) * Math.PI) / 180;
  const cx = 80, cy = 70, r = 52;
  const nx = cx + r * Math.cos(rad);
  const ny = cy - r * Math.sin(rad);

  const displayValue = hovered ? hovered.v : value;
  const displayColor = displayValue !== undefined ? fearGreedColor(displayValue) : color;
  const displayLabel = hovered ? hovered.label : label;

  const values = chart.map(p => p.v);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 100;
  const range = max - min || 1;
  const W = 400, H = 50;

  const getPoint = (i: number) => ({
    x: (i / Math.max(values.length - 1, 1)) * W,
    y: H - ((values[i] - min) / range) * (H - 6) - 3,
  });

  const polyline = values.map((_, i) => { const p = getPoint(i); return `${p.x},${p.y}`; }).join(' ');

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!values.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = Math.max(0, Math.min(values.length - 1, Math.round((e.clientX - rect.left) / rect.width * (values.length - 1))));
    const p = chart[idx];
    if (p) setHovered({ v: p.v, label: p.label, date: fmtDate(p.t) });
  };

  const hoverIdx = hovered ? chart.findIndex(p => p.v === hovered.v && fmtDate(p.t) === hovered.date) : -1;
  const hoverPoint = hoverIdx >= 0 ? getPoint(hoverIdx) : null;
  const tooltipLeft = hoverPoint ? (hoverPoint.x / W * 100) : 0;

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={CARD_TITLE}>Fear & Greed Index</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Alternative.me</div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 200 }} /> : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
            <svg width="160" height="90" viewBox="0 0 160 90">
              <path d="M 16 72 A 64 64 0 0 1 144 72" fill="none" stroke="var(--surface3)" strokeWidth="12" strokeLinecap="round" />
              {[
                { pct: 0, end: 0.25, col: '#ef4444' },
                { pct: 0.25, end: 0.5, col: '#f97316' },
                { pct: 0.5, end: 0.75, col: '#eab308' },
                { pct: 0.75, end: 1, col: '#22c55e' },
              ].map((seg, i) => {
                const a1 = (180 - seg.pct * 180) * Math.PI / 180;
                const a2 = (180 - seg.end * 180) * Math.PI / 180;
                const x1 = 80 + 64 * Math.cos(a1), y1 = 72 - 64 * Math.sin(a1);
                const x2 = 80 + 64 * Math.cos(a2), y2 = 72 - 64 * Math.sin(a2);
                return <path key={i} d={`M ${x1} ${y1} A 64 64 0 0 0 ${x2} ${y2}`} fill="none" stroke={seg.col} strokeWidth="12" strokeLinecap="butt" opacity={0.35} />;
              })}
              {value !== undefined && <>
                <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={cx} cy={cy} r="5" fill={color} />
              </>}
            </svg>
            <div style={{ fontSize: 36, fontWeight: 700, color: displayColor, marginTop: -8 }}>
              {hovered ? hovered.v : (value ?? '—')}
            </div>
            <div style={{ fontSize: 11, color: displayColor, marginTop: 2, fontWeight: 600 }}>
              {hovered ? `${hovered.label} · ${hovered.date}` : (displayLabel || '—')}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { l: '1D', v: data?.changes?.yesterday },
              { l: '7D', v: data?.changes?.weekAgo },
              { l: '30D', v: data?.changes?.monthAgo },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: '#1a1917', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: v === null || v === undefined ? 'var(--text-muted)' : v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                  {v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}`}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 3, marginBottom: 6 }}>
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => { setTf(t); setHovered(null); }} style={{
                padding: '2px 7px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                background: tf === t ? 'var(--accent)' : 'var(--surface2)',
                color: tf === t ? '#fff' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}>{t.toUpperCase()}</button>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: '100%', height: 50, display: 'block', cursor: 'crosshair' }}
              preserveAspectRatio="none"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHovered(null)}
            >
              {values.length > 1 && <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" />}
              {hoverPoint && (
                <>
                  <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={H} stroke={color} strokeWidth="0.5" strokeDasharray="3,3" />
                  <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3" fill={color} />
                </>
              )}
            </svg>
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
                <div style={{ fontSize: 9, opacity: 0.65, marginBottom: 1 }}>{hovered.date}</div>
                F&G: {hovered.v} · {hovered.label}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
