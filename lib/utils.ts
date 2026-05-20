export function formatUSD(value: number, compact = true): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (compact) {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatPct(value: number, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatFundingRate(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${(value * 100).toFixed(4)}%`;
}

export function formatTimestamp(t: number): string {
  // t is unix seconds
  return new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(t: number): string {
  return new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDateStr(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function fearGreedColor(value: number): string {
  if (value <= 25) return '#ef4444';   // Extreme Fear - red
  if (value <= 45) return '#f97316';   // Fear - orange
  if (value <= 55) return '#eab308';   // Neutral - yellow
  if (value <= 75) return '#84cc16';   // Greed - lime
  return '#22c55e';                    // Extreme Greed - green
}

export function changeColor(value: number): string {
  if (value > 0) return '#22c55e';
  if (value < 0) return '#ef4444';
  return '#94a3b8';
}
