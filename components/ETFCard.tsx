'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { ETFData } from '@/lib/types';
import { formatUSD, formatDateStr } from '@/lib/utils';

interface Props { data?: ETFData; loading: boolean; }

const ASSETS = ['BTC', 'ETH', 'SOL', 'HYPE'] as const;
type Asset = typeof ASSETS[number];

export default function ETFCard({ data, loading }: Props) {
  const [activeAsset, setActiveAsset] = useState<Asset>('BTC');

  const assetData = data ? data[activeAsset.toLowerCase() as 'btc' | 'eth' | 'sol' | 'hype'] : null;
  const latest = assetData?.latest;
  const chart = (assetData?.last30Days || [])
  .map(row => {
    const computedTotal = Object.values(row.flows || {})
      .reduce((sum, v) => (sum as number) + (v !== null && v !== undefined ? (v as number) : 0), 0) as number;
    return { date: formatDateStr(row.date), total: computedTotal };
  })
  .filter(row => row.total !== 0);
  const totalLatest = latest
  ? Object.values(latest.flows || {}).reduce((sum, v) => (sum as number) + (v !== null && v !== undefined ? (v as number) : 0), 0) as number
  : 0;
  const latestColor = totalLatest > 0 ? 'var(--green)' : totalLatest < 0 ? 'var(--red)' : 'var(--text-muted)';
  const topETFs = Object.entries(assetData?.byETF || {})
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 4);

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div className="card-title">Institutional ETF Flows</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>Farside Investors</div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {ASSETS.map(asset => (
          <button
            key={asset}
            onClick={() => setActiveAsset(asset)}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              border: '1px solid',
              borderColor: activeAsset === asset ? 'var(--accent)' : 'var(--border)',
              background: activeAsset === asset ? 'var(--accent-light)' : 'transparent',
              color: activeAsset === asset ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              transition: 'all 0.15s',
            }}
          >
            {asset}
          </button>
        ))}
      </div>

      {loading ? <div className="skeleton" style={{ height: 180 }} /> : assetData?.error ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          Data unavailable for {activeAsset}
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div className="card-title" style={{ marginBottom: 4 }}>
                  Latest ({latest?.date || assetData?.lastTradingDay || '—'})
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: latestColor }}>
                  {totalLatest >= 0 ? '+' : ''}{formatUSD(totalLatest)}M
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', lineHeight: 1.5 }}>
                Weekends excluded<br />Monday = Friday data
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Daily flows — last 30 trading days (US$M)</div>
            <div style={{ height: 70 }}>
              {chart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barSize={6}>
                    <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 8 }} tickLine={false} axisLine={false} interval={6} />
                    <ReferenceLine y={0} stroke="var(--border2)" />
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
                      formatter={(v: unknown) => { const n = v as number; return [`${n >= 0 ? '+' : ''}${formatUSD(n)}M`, 'Net Flow']; }}
                    />
                    <Bar dataKey="total" radius={[2,2,0,0]}>
                      {chart.map((entry, i) => <Cell key={i} fill={entry.total >= 0 ? '#16a34a' : '#dc2626'} opacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No chart data</div>}
            </div>
          </div>

          {topETFs.length > 0 && (
            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>30-day flows by product (US$M)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topETFs.map(([name, val]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{name}</span>
                    <span style={{ fontWeight: 600, color: val >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {val >= 0 ? '+' : ''}{formatUSD(val)}M
                    </span>
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
