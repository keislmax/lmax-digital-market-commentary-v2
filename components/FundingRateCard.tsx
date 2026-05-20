'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function FundingRateCard({ data, loading }: Props) {
  const current = data?.fundingRate?.current;
  const chart = (data?.fundingRate?.chart || []).map(p => ({
    display: formatTimestamp(p.t),
    rate: parseFloat((p.v * 100).toFixed(5)),
  }));

  const isPositive = current !== undefined && current > 0;
  const isNegative = current !== undefined && current < 0;
  const rateColor = isPositive ? 'var(--green)' : isNegative ? 'var(--red)' : 'var(--text-muted)';

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label mb-1">Funding Rate</div>
          {loading ? (
            <div className="h-7 w-32 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          ) : (
            <div className="metric-value text-2xl" style={{ color: rateColor }}>
              {current !== undefined ? `${(current * 100).toFixed(4)}%` : '—'}
            </div>
          )}
        </div>
        {!loading && data?.fundingRate?.annualized !== undefined && (
          <div className="text-right">
            <div className="label mb-1">Annualized</div>
            <div className="metric-value text-lg" style={{ color: rateColor }}>
              {(data.fundingRate.annualized * 100).toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 140 }}>
        {loading ? (
          <div className="h-full rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        ) : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="display" tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: 'Space Mono' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={55} />
              <ReferenceLine y={0} stroke="var(--border2)" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontFamily: 'Space Mono' }}
                formatter={(v: unknown) => [`${(v as number)}%`, 'Rate']}
              />
              <Line type="monotone" dataKey="rate" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center label">No data</div>
        )}
      </div>
    </div>
  );
}
