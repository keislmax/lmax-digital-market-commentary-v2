'use client';
import { CoinalyzeData } from '@/lib/types';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function FundingRateCard({ data, loading }: Props) {
  const current = data?.fundingRate?.current;
  const rateColor = current === undefined ? 'var(--text)' : current > 0 ? 'var(--green)' : current < 0 ? 'var(--red)' : 'var(--text)';
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div className="card-title">Funding Rate</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Coinalyze</div>
      </div>
      {loading ? <div className="skeleton" style={{ height: 28 }} /> : (
        <div style={{ fontSize: 24, fontWeight: 700, color: rateColor }}>
          {current !== undefined ? `${(current * 100).toFixed(4)}%` : '—'}
        </div>
      )}
    </div>
  );
}
