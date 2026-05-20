'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { ETFData } from '@/lib/types';
import { formatUSD, formatDateStr } from '@/lib/utils';

interface Props { data?: ETFData; loading: boolean; }

export default function ETFCard({ data, loading }: Props) {
  const latest = data?.latest;
  const chart = (data?.last30Days || []).map(row => ({ date: formatDateStr(row.date), total: row.total }));
  const totalLatest = latest?.total || 0;
  const latestColor = totalLatest > 0 ? 'var(--green)' : totalLatest < 0 ? 'var(--red)' : 'var(--text-muted)';
  const topETFs = Object.entries(data?.byETF || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 5);

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: 16 }}>Institutional ETF Flows</div>
      {loading ? <div className="skeleton" style={{ height: 200 }} /> : data?.error ? (
        <div style={{ color: 'var(--red)', fontSize: 13 }}>Data unavailable</div>
      ) : (
        <>
          <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '12px', border: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div className="card-title" style={{ marginBottom: 6 }}>Latest ({latest?.date || data?.lastTradingDay || '—'})</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: latestColor }}>{totalLatest >= 0 ? '+' : ''}{formatUSD(totalLatest)}M</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 100, lineHeight: 1.4 }}>Weekend days excluded</div>
            </div>
          </div>

          <div style={{ height: 80, marginBottom: 12 }}>
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barSize={6}>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
                  <ReferenceLine y={0} stroke="var(--border2)" />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} formatter={(v: unknown) => { const n = v as number; return [`${n >= 0 ? '+' : ''}${formatUSD(n)}M`, 'Flow']; }} />
                  <Bar dataKey="total" radius={[2,2,0,0]}>
                    {chart.map((entry, i) => <Cell key={i} fill={entry.total >= 0 ? '#16a34a' : '#dc2626'} opacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No chart data</div>}
          </div>

          {topETFs.length > 0 && (
            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>30d Flows by ETF</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topETFs.map(([name, val]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{name}</span>
                    <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--green)' : 'var(--red)' }}>{val >= 0 ? '+' : ''}{formatUSD(val)}M</span>
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
