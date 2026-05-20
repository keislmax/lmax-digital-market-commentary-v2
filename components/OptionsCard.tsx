'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { DeribitData } from '@/lib/types';
import { formatTimestamp } from '@/lib/utils';

interface Props { data?: DeribitData; loading: boolean; }

export default function OptionsCard({ data, loading }: Props) {
  const dvol = data?.dvol?.current;
  const skew = data?.skew;
  const chart = (data?.dvol?.chart || []).map(p => ({ t: formatTimestamp(p.t), v: p.v }));

  const skewColor = skew?.value25d === null || skew?.value25d === undefined ? 'var(--text-muted)'
    : skew.value25d > 3 ? 'var(--red)'
    : skew.value25d < -3 ? 'var(--green)'
    : 'var(--yellow)';

  const skewLabel = skew?.value25d === null || skew?.value25d === undefined ? null
    : skew.value25d > 5 ? 'Bearish — puts bid up'
    : skew.value25d > 2 ? 'Mildly bearish'
    : skew.value25d < -5 ? 'Bullish — calls bid up'
    : skew.value25d < -2 ? 'Mildly bullish'
    : 'Neutral positioning';

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="card-title">Options · Volatility & Skew</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Deribit</div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 180 }} /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '12px', border: '1px solid var(--border)' }}>
              <div className="card-title" style={{ marginBottom: 4 }}>DVOL</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                {dvol !== null && dvol !== undefined ? `${dvol.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                30-day implied volatility index (Deribit's "VIX for BTC")
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '12px', border: '1px solid var(--border)' }}>
              <div className="card-title" style={{ marginBottom: 4 }}>25Δ Put/Call Skew</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: skewColor }}>
                {skew?.value25d !== null && skew?.value25d !== undefined
                  ? `${skew.value25d >= 0 ? '+' : ''}${skew.value25d.toFixed(1)}`
                  : '—'}
              </div>
              <div style={{ fontSize: 10, color: skewColor, marginTop: 3, lineHeight: 1.4, fontWeight: 500 }}>
                {skewLabel || 'Puts IV minus Calls IV at 25-delta strikes'}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>DVOL — 24H</div>
          <div style={{ height: 80 }}>
            {chart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dvolGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={['auto', 'auto']} hide />
                  <XAxis dataKey="t" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} tickLine={false} axisLine={false} interval={4} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'DVOL']} />
                  <Area type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={1.5} fill="url(#dvolGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No chart data</div>}
          </div>
        </>
      )}
    </div>
  );
}
