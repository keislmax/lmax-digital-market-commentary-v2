'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { ETFData } from '@/lib/types';
import { formatUSD, formatDateStr } from '@/lib/utils';

interface Props { data?: ETFData; loading: boolean; }

export default function ETFCard({ data, loading }: Props) {
  const latest = data?.latest;
  const chart = (data?.last30Days || []).map(row => ({
    date: formatDateStr(row.date),
    total: row.total,
  }));

  const totalLatest = latest?.total || 0;
  const latestColor = totalLatest > 0 ? 'var(--green)' : totalLatest < 0 ? 'var(--red)' : 'var(--text-muted)';

  // Top ETFs by 30d flow
  const topETFs = Object.entries(data?.byETF || {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 5);

  return (
    <div className="card p-4">
      <div className="label mb-4">Institutional ETF Flows</div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-20 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          <div className="h-24 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        </div>
      ) : data?.error ? (
        <div className="label" style={{ color: 'var(--red)' }}>Farside data unavailable: {data.error}</div>
      ) : (
        <>
          {/* Latest day */}
          <div className="p-3 rounded mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="label mb-1">Latest ({latest?.date || data?.lastTradingDay || '—'})</div>
                <div className="metric-value text-2xl" style={{ color: latestColor }}>
                  {totalLatest >= 0 ? '+' : ''}{formatUSD(totalLatest)}M
                </div>
              </div>
              <div className="label text-right" style={{ color: 'var(--text-dim)', maxWidth: 120 }}>
                {data?.note}
              </div>
            </div>
          </div>

          {/* 30-day bar chart */}
          <div style={{ height: 80 }}>
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barSize={6}>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 8, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} interval={6} />
                  <ReferenceLine y={0} stroke="var(--border2)" />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 10, fontFamily: 'Space Mono' }}
                    formatter={(v: unknown) => { const n = v as number; return [`${n >= 0 ? '+' : ''}${formatUSD(n)}M`, 'Flow']; }}
                  />
                  <Bar dataKey="total" radius={[2,2,0,0]}>
                    {chart.map((entry, index) => (
                      <Cell key={index} fill={entry.total >= 0 ? '#22c55e' : '#ef4444'} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center label">No chart data</div>
            )}
          </div>

          {/* Top ETFs */}
          {topETFs.length > 0 && (
            <div className="mt-3">
              <div className="label mb-2">30d Flows by ETF</div>
              <div className="space-y-1">
                {topETFs.map(([name, val]) => (
                  <div key={name} className="flex items-center justify-between text-xs" style={{ fontFamily: 'Space Mono', color: 'var(--text-muted)' }}>
                    <span>{name}</span>
                    <span style={{ color: val >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {val >= 0 ? '+' : ''}{formatUSD(val)}M
                    </span>
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
