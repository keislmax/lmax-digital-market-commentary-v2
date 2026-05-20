'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD, formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function VolumeCard({ data, loading }: Props) {
  const chart = (data?.volume?.chart || []).map(p => ({ t: formatTimestamp(p.t), volume: p.volume }));

  return (
    <div className="card" style={{ padding: '20px 20px 16px' }}>
      <div style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>24H Volume</div>
        {loading ? <div className="skeleton" style={{ height: 28, width: 140 }} /> :
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{formatUSD(data?.volume?.total24h || 0)}</div>}
      </div>
      <div style={{ height: 160 }}>
        {loading ? <div className="skeleton" style={{ height: '100%' }} /> : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatUSD(v as number)} width={65} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: 'var(--shadow)' }} formatter={(v: unknown) => [formatUSD(v as number), 'Volume']} />
              <Bar dataKey="volume" fill="#2563eb" opacity={0.75} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data available</div>}
      </div>
    </div>
  );
}
