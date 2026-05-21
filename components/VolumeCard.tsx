'use client';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function VolumeCard({ data, loading }: Props) {
  const total = data?.volume?.total24h ?? 0;
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: 6 }}>Volume (24H)</div>
      {loading ? <div className="skeleton" style={{ height: 28 }} /> : (
        <div style={{ fontSize: 24, fontWeight: 700 }}>{formatUSD(total)}</div>
      )}
    </div>
  );
}
