'use client';

interface Props { price?: number; loading: boolean; }

export default function PriceHeader({ price, loading }: Props) {
  return (
    <div className="card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 24 }}>
      <div>
        <div className="card-title" style={{ marginBottom: 4 }}>BTC / USD · Spot Price</div>
        {loading || !price ? (
          <div className="skeleton" style={{ height: 40, width: 200 }} />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>
            ${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        )}
      </div>
    </div>
  );
}
