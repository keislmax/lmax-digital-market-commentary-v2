'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD, formatTimestamp } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function LiquidationsCard({ data, loading }: Props) {
  const chart = (data?.liquidations?.chart || []).map(p => ({ t: formatTimestamp(p.t), Longs: p.long, Shorts: p.short }));
  const total = data?.liquidations?.total24h ?? 0;
  const longs = data?.liquidations?.longs24h ?? 0;
  const shorts = data?.liquidations?.shorts24h ?? 0;

  return (
    <div className="card" style={{ padding: '20px 20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 6 }}>Liquidations (24h)</div>
          {loading ? <div className="skeleton" style={{ height: 28, width: 140 }} /> :
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{formatUSD(total)}</div>}
        </div>
        {!loading && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'right' }}>
              <div className="card-title" style={{ marginBottom: 4 }}>Longs</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>{formatUSD(longs)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="card-title" style={{ marginBottom: 4 }}>Shorts</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>{formatUSD(shorts)}</div>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 160 }}>
        {loading ? <div className="skeleton" style={{ height: '100%' }} /> : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={5} barGap={1}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatUSD(v as number)} width={65} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, boxShadow: 'var(--shadow)' }} formatter={(v: unknown, name: unknown) => [formatUSD(v as number), name as string]} />
              <Bar dataKey="Longs" fill="#dc2626" opacity={0.8} radius={[2,2,0,0]} />
              <Bar dataKey="Shorts" fill="#16a34a" opacity={0.8} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No data available</div>}
      </div>
    </div>
  );
}
