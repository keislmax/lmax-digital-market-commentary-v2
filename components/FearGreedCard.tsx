'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FearGreedData } from '@/lib/types';
import { fearGreedColor } from '@/lib/utils';

interface Props { data?: FearGreedData; loading: boolean; }

export default function FearGreedCard({ data, loading }: Props) {
  const value = data?.current?.value;
  const label = data?.current?.label;
  const color = value !== undefined ? fearGreedColor(value) : 'var(--text-muted)';

  const chart = (data?.chart || []).map(p => ({ display: new Date(p.t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' }), v: p.v }));

  // Gauge arc calculation
  const radius = 48;
  const cx = 64;
  const cy = 64;
  const startAngle = 180;
  const endAngle = 0;
  const angle = value !== undefined ? 180 - (value / 100) * 180 : 90;
  const rad = (angle * Math.PI) / 180;
  const needleX = cx + radius * Math.cos(rad);
  const needleY = cy - radius * Math.sin(rad);

  return (
    <div className="card p-4">
      <div className="label mb-4">Fear & Greed Index</div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-32 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          <div className="h-20 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        </div>
      ) : (
        <>
          {/* Gauge */}
          <div className="flex flex-col items-center mb-3">
            <svg width="128" height="72" viewBox="0 0 128 72">
              {/* Background arc */}
              <path d="M 8 64 A 56 56 0 0 1 120 64" fill="none" stroke="var(--surface3)" strokeWidth="10" strokeLinecap="round" />
              {/* Colored arc segments */}
              {[
                { pct: 0, col: '#ef4444' }, { pct: 0.25, col: '#f97316' },
                { pct: 0.5, col: '#eab308' }, { pct: 0.75, col: '#84cc16' },
              ].map((seg, i, arr) => {
                const next = arr[i + 1];
                const endPct = next ? next.pct : 1;
                const a1 = 180 - seg.pct * 180;
                const a2 = 180 - endPct * 180;
                const r1 = (a1 * Math.PI) / 180;
                const r2 = (a2 * Math.PI) / 180;
                const x1 = 64 + 56 * Math.cos(r1);
                const y1 = 64 - 56 * Math.sin(r1);
                const x2 = 64 + 56 * Math.cos(r2);
                const y2 = 64 - 56 * Math.sin(r2);
                return (
                  <path key={i} d={`M ${x1} ${y1} A 56 56 0 0 0 ${x2} ${y2}`}
                    fill="none" stroke={seg.col} strokeWidth="10" strokeLinecap="butt" opacity={0.4} />
                );
              })}
              {/* Needle */}
              {value !== undefined && (
                <>
                  <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="2" strokeLinecap="round" />
                  <circle cx={cx} cy={cy} r="4" fill={color} />
                </>
              )}
            </svg>
            <div className="metric-value text-3xl" style={{ color, marginTop: -8 }}>{value ?? '—'}</div>
            <div className="label mt-1" style={{ color }}>{label || '—'}</div>
          </div>

          {/* Changes */}
          {data?.changes && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: '1d', val: data.changes.yesterday },
                { label: '7d', val: data.changes.weekAgo },
                { label: '30d', val: data.changes.monthAgo },
              ].map(({ label: l, val }) => (
                <div key={l} className="text-center p-2 rounded" style={{ background: 'var(--surface2)' }}>
                  <div className="label">{l}</div>
                  <div className="text-sm mt-1" style={{ color: val === null ? 'var(--text-muted)' : val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'Space Mono' }}>
                    {val === null ? '—' : `${val > 0 ? '+' : ''}${val}`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 30d sparkline */}
          <div style={{ height: 60 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={[0, 100]} hide />
                <Tooltip
                  contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10, fontFamily: 'Space Mono' }}
                  labelFormatter={(l) => l}
                  formatter={(v: unknown) => [(v as number), 'F&G']}
                />
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#fgGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
