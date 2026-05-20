'use client';

interface Props {
  price?: number;
  loading: boolean;
}

export default function PriceHeader({ price, loading }: Props) {
  return (
    <div className="card px-6 py-4 flex items-center gap-6" style={{ background: 'var(--surface)' }}>
      <div>
        <div className="label mb-1">BTC / USD</div>
        {loading || !price ? (
          <div className="h-10 w-48 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        ) : (
          <div className="metric-value text-4xl" style={{ color: 'var(--text)' }}>
            ${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        )}
      </div>
      <div className="h-10 w-px" style={{ background: 'var(--border)' }} />
      <div className="label" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent)' }}>●</span> LIVE
      </div>
    </div>
  );
}
