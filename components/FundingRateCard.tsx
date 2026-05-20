'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function FundingRateCard({ data, loading }: Props) {
  const current = data?.fundingRate?.current;
  const chart = (data?.fundingRate?.chart || []).map(p => ({
    t: formatTimestamp(p.t),
    rate: parseFloat((p.v * 100).toFixed(5)),
  }));
  const rateColor = current === undefined ? 'var(--text)' : current > 0 ? 'var(--green)' : current < 0 ? 'var(--red)' : 'var(--text)';

  return (
    <div className="card" style={{ padding: '20px 20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div className="card-title">Funding Rate (24H)</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Coinalyze</div>
      </div>
      <div style={{ marginBottom: 4 }}>
        {loading ? <div className="skeleton" style={{ height: 28, width: 120, marginBottom: 4 }} /> :
          <div style={{ fontSize: 24, fontWeight: 700, color: rateColor }}>
            {current !== undefined ? `${(current * 100).toFixed(4)}%` : '—'}
          </div>}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          Rate per 8-hour settlement · {current !== undefined && current > 0 ? 'Longs pay shorts' : current !== undefined && current < 0 ? 'Shorts pay longs' : ''}
        </div>
      </div>
      <div style={{ height: 160, marginTop: 12 }}>
        {loading ? <div className="skeleton" style={{ height: '100%' }} /> : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={55} />
              <ReferenceLine y={0} stroke="var(--border2)" strokeWidth={1.5} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: 'var(--shadow)' }}
                formatter={(v: unknown) => [`${(v as number).toFixed(4)}%`, '8H Funding Rate']}
              />
              <Line type="monotone" dataKey="rate" stroke="#7c3aed" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data available</div>}
      </div>
    </div>
  );
}
