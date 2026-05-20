'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD, formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function LiquidationsCard({ data, loading }: Props) {
  const chart = (data?.liquidations?.chart || []).map(p => ({
    display: formatTimestamp(p.t),
    Longs: p.long,
    Shorts: p.short,
  }));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label mb-1">Liquidations (24h)</div>
          {loading ? (
            <div className="h-7 w-32 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          ) : (
            <div className="metric-value text-2xl">{formatUSD(data?.liquidations?.total24h || 0)}</div>
          )}
        </div>
        {!loading && data && (
          <div className="flex gap-4 text-right">
            <div>
              <div className="label mb-1">Longs</div>
              <div className="text-sm" style={{ color: 'var(--red)', fontFamily: 'Space Mono' }}>{formatUSD(data.liquidations.longs24h)}</div>
            </div>
            <div>
              <div className="label mb-1">Shorts</div>
              <div className="text-sm" style={{ color: 'var(--green)', fontFamily: 'Space Mono' }}>{formatUSD(data.liquidations.shorts24h)}</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 140 }}>
        {loading ? (
          <div className="h-full rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        ) : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barSize={6} barGap={1}>
              <XAxis dataKey="display" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatUSD(v)} width={60} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'Space Mono' }}
                formatter={(v: unknown, name: unknown) => [formatUSD(v as number), name as string]}
              />
              <Bar dataKey="Longs" fill="#ef4444" opacity={0.85} radius={[2,2,0,0]} />
              <Bar dataKey="Shorts" fill="#22c55e" opacity={0.85} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center label">No data</div>
        )}
      </div>
    </div>
  );
}
