'use client';
import { CoinalyzeData } from '@/lib/types';
import { formatUSD } from '@/lib/utils';

interface Props { data?: CoinalyzeData; loading: boolean; }

export default function LiquidationsCard({ data, loading }: Props) {
  const total = data?.liquidations?.total24h ?? 0;
  const longs = data?.liquidations?.longs24h ?? 0;
  const shorts = data?.liquidations?.shorts24h ?? 0;
  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="card-title" style={{ marginBottom: 6 }}>Liquidations (24H)</div>
      {loading ? <div className="skeleton" style={{ height: 28 }} /> : (
        <div style={{ fontSize: 24, fontWeight: 700 }}>{formatUSD(total)}</div>
      )}
      {!loading && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          Longs: {formatUSD(longs)} · Shorts: {formatUSD(shorts)}
        </div>
      )}
    </div>
  );
}
