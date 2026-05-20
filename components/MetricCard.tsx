'use client';

interface Props {
  label: string;
  value: string;
  change?: number;
  changeSuffix?: string;
  subValue?: string;
  valueColor?: string;
  loading: boolean;
}

export default function MetricCard({ label, value, change, changeSuffix = '', subValue, valueColor, loading }: Props) {
  const changeColor = change === undefined ? undefined : change > 0 ? 'var(--green)' : change < 0 ? 'var(--red)' : 'var(--text-muted)';

  return (
    <div className="card px-4 py-4">
      <div className="label mb-2">{label}</div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-3/4 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
          <div className="h-3 w-1/2 rounded animate-pulse" style={{ background: 'var(--surface3)' }} />
        </div>
      ) : (
        <>
          <div className="metric-value text-2xl" style={{ color: valueColor || 'var(--text)' }}>
            {value}
          </div>
          {change !== undefined && (
            <div className="text-xs mt-1" style={{ color: changeColor, fontFamily: 'Space Mono, monospace' }}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}{changeSuffix} 24h
            </div>
          )}
          {subValue && (
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace' }}>
              {subValue}
            </div>
          )}
        </>
      )}
    </div>
  );
}
