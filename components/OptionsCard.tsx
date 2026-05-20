'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DeribitData } from '@/lib/types';
import { formatTimestamp } from '@/lib/utils';

interface Props { data?: DeribitData; loading: boolean; }

export default function OptionsCard({ data, loading }: Props) {
  const dvol = data?.dvol?.current;
  const skew = data?.skew;
  const chart = (data?.dvol?.chart || []).map(p => ({ display: formatTimestamp(p.t), v: p.v }));

  const skewColor = skew?.value25d === null || skew?.value25d === undefined
    ? 'var(--text-muted)'
    : skew.value25d > 3 ? 'var(--red)'
    : skew.value25d < -3 ? 'var(--green)'
    : 'var(--yellow)';

  return (
    <div className="card p-4">
      <div className="label mb-4">Options — IV & Skew</div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-20 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          <div className="h-24 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="label mb-1">DVOL (30d IV)</div>
              <div className="metric-value text-2xl" style={{ color: 'var(--accent)' }}>
                {dvol !== null && dvol !== undefined ? `${dvol.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="label mb-1">25Δ Skew</div>
              <div className="metric-value text-xl" style={{ color: skewColor }}>
                {skew?.value25d !== null && skew?.value25d !== undefined
                  ? `${skew.value25d >= 0 ? '+' : ''}${skew.value25d.toFixed(1)}`
                  : '—'}
              </div>
              {skew?.interpretation && (
                <div className="label mt-1" style={{ color: skewColor }}>{skew.interpretation}</div>
              )}
            </div>
          </div>

          {/* DVOL chart */}
          <div style={{ height: 80 }}>
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dvolGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={['auto', 'auto']} hide />
                  <XAxis dataKey="display" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} interval={4} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10, fontFamily: 'Space Mono' }}
                    formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'DVOL']}
                  />
                  <Area type="monotone" dataKey="v" stroke="#0ea5e9" strokeWidth={1.5} fill="url(#dvolGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center label">No chart data</div>
            )}
          </div>

          {/* Strike table if available */}
          {skew?.strikes && skew.strikes.length > 0 && (
            <div className="mt-3">
              <div className="label mb-2">Sample IV by Strike</div>
              <div className="space-y-1">
                {skew.strikes.slice(0, 4).map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs" style={{ fontFamily: 'Space Mono', color: 'var(--text-muted)' }}>
                    <span>{s.strike.toLocaleString()} {s.type.toUpperCase()}</span>
                    <span style={{ color: s.type === 'put' ? 'var(--red)' : 'var(--green)' }}>{s.iv.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
