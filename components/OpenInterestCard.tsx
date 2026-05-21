'use client';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function OpenInterestCard({ data, loading }: Props) {
  const current = data?.openInterest?.current ?? 0;
  const change = data?.openInterest?.change24h;
  const changeColor = change === undefined ? 'var(--text-muted)' : change >= 0 ? 'var(--green)' : 'var(--red)';
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: 6 }}>Open Interest</div>
      {loading ? <div className="skeleton" style={{ height: 28 }} /> : (
        <div style={{ fontSize: 24, fontWeight: 700 }}>{formatUSD(current)}</div>
      )}
      {!loading && change !== undefined && (
        <div style={{ fontSize: 11, color: changeColor, marginTop: 4 }}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}% 24H
        </div>
      )}
    </div>
  );
}
