'use client';
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FearGreedData } from '@/lib/types';
import { fearGreedColor } from '@/lib/utils';

interface Props { data?: FearGreedData; loading: boolean; }

export default function FearGreedCard({ data, loading }: Props) {
  const value = data?.current?.value;
  const label = data?.current?.label;
  const color = value !== undefined ? fearGreedColor(value) : 'var(--text-muted)';
  const chart = (data?.chart || []).map(p => ({ v: p.v }));

  const pct = value !== undefined ? (value / 100) * 180 : 90;
  const rad = ((180 - pct) * Math.PI) / 180;
  const cx = 80, cy = 70, r = 52;
  const nx = cx + r * Math.cos(rad);
  const ny = cy - r * Math.sin(rad);

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: 16 }}>Fear & Greed Index</div>
      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
            <svg width="160" height="90" viewBox="0 0 160 90">
              <path d="M 16 72 A 64 64 0 0 1 144 72" fill="none" stroke="var(--surface3)" strokeWidth="12" strokeLinecap="round" />
              {[
                { pct: 0, end: 0.25, col: '#ef4444' },
                { pct: 0.25, end: 0.5, col: '#f97316' },
                { pct: 0.5, end: 0.75, col: '#eab308' },
                { pct: 0.75, end: 1, col: '#22c55e' },
              ].map((seg, i) => {
                const a1 = (180 - seg.pct * 180) * Math.PI / 180;
                const a2 = (180 - seg.end * 180) * Math.PI / 180;
                const x1 = 80 + 64 * Math.cos(a1), y1 = 72 - 64 * Math.sin(a1);
                const x2 = 80 + 64 * Math.cos(a2), y2 = 72 - 64 * Math.sin(a2);
                return <path key={i} d={`M ${x1} ${y1} A 64 64 0 0 0 ${x2} ${y2}`} fill="none" stroke={seg.col} strokeWidth="12" strokeLinecap="butt" opacity={0.35} />;
              })}
              {value !== undefined && <>
                <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={cx} cy={cy} r="5" fill={color} />
              </>}
            </svg>
            <div style={{ fontSize: 36, fontWeight: 700, color, marginTop: -8 }}>{value ?? '—'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 2 }}>{label || '—'}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { l: '1d', v: data?.changes?.yesterday },
              { l: '7d', v: data?.changes?.weekAgo },
              { l: '30d', v: data?.changes?.monthAgo },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                <div className="card-title" style={{ marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: v === null || v === undefined ? 'var(--text-muted)' : v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                  {v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v}`}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 50 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={[0, 100]} hide />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }} formatter={(v: unknown) => [(v as number), 'F&G']} />
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill="url(#fgGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
