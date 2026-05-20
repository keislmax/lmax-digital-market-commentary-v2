'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD, formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function OpenInterestCard({ data, loading }: Props) {
  const chart = (data?.openInterest?.chart || []).map(p => ({ t: formatTimestamp(p.t), v: p.v }));
  const change = data?.openInterest?.change24h;
  const changeColor = change === undefined ? 'var(--text-muted)' : change >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="card" style={{ padding: '20px 20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="card-title">Open Interest (24H)</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Coinalyze</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          {loading ? <div className="skeleton" style={{ height: 28, width: 140 }} /> :
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{formatUSD(data?.openInterest?.current || 0)}</div>}
        </div>
        {!loading && change !== undefined && (
          <div style={{ textAlign: 'right' }}>
            <div className="card-title" style={{ marginBottom: 4 }}>24H Change</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: changeColor }}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</div>
          </div>
        )}
      </div>
      <div style={{ height: 160 }}>
        {loading ? <div className="skeleton" style={{ height: '100%' }} /> : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatUSD(v)} width={65} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: 'var(--shadow)' }} formatter={(v: unknown) => [formatUSD(v as number), 'Open Interest']} />
              <Area type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={2} fill="url(#oiGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data available</div>}
      </div>
    </div>
  );
}
