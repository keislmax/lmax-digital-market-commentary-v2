'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD, formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function OpenInterestCard({ data, loading }: Props) {
  const chart = data?.openInterest?.chart || [];
  const formatted = chart.map(p => ({ ...p, display: formatTimestamp(p.t) }));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label mb-1">Open Interest</div>
          {loading ? (
            <div className="h-7 w-32 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          ) : (
            <div className="metric-value text-2xl">{formatUSD(data?.openInterest?.current || 0)}</div>
          )}
        </div>
        {!loading && data?.openInterest?.change24h !== undefined && (
          <div className="text-right">
            <div className="label mb-1">24h Change</div>
            <div className="metric-value text-lg" style={{ color: data.openInterest.change24h >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {data.openInterest.change24h >= 0 ? '+' : ''}{data.openInterest.change24h.toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 140 }}>
        {loading ? (
          <div className="h-full rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        ) : formatted.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="display" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatUSD(v)} width={60} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'Space Mono' }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(v: unknown) => [formatUSD(v as number), 'OI']}
              />
              <Area type="monotone" dataKey="v" stroke="#0ea5e9" strokeWidth={1.5} fill="url(#oiGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center label">No data</div>
        )}
      </div>
    </div>
  );
}
