'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD, formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function VolumeCard({ data, loading }: Props) {
  const chart = (data?.volume?.chart || []).map(p => ({
    display: formatTimestamp(p.t),
    volume: p.volume,
  }));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label mb-1">24h Volume</div>
          {loading ? (
            <div className="h-7 w-32 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          ) : (
            <div className="metric-value text-2xl">{formatUSD(data?.volume?.total24h || 0)}</div>
          )}
        </div>
      </div>

      <div style={{ height: 140 }}>
        {loading ? (
          <div className="h-full rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        ) : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barSize={8}>
              <XAxis dataKey="display" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatUSD(v)} width={60} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'Space Mono' }}
                formatter={(v: unknown) => [formatUSD(v as number), 'Volume']}
              />
              <Bar dataKey="volume" fill="#38bdf8" opacity={0.7} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center label">No data</div>
        )}
      </div>
    </div>
  );
}
