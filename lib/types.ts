export interface ChartPoint {
  t: number;
  v: number;
}
export interface LiqPoint {
  t: number;
  l: number;
  s: number;
}
export interface CoinalyzeData {
  price: number;
  openInterest: {
    current: number;
    change24h: number;
    chartsByAsset: Record<string, Record<string, ChartPoint[]>>;
  };
  fundingRate: {
    current: number;
    annualized: number;
    byAsset: Record<string, number>;
    chartsByAsset: Record<string, Record<string, ChartPoint[]>>;
  };
  liquidations: {
    total24h: number;
    longs24h: number;
    shorts24h: number;
    chartsByAsset: Record<string, Record<string, LiqPoint[]>>;
  };
  volume: {
    total24h: number;
    chartsByAsset: Record<string, Record<string, ChartPoint[]>>;
  };
  updatedAt: number;
  error?: string;
}
export interface DeribitData {
  dvol: {
    current: number;
    chartsByAsset: Record<string, Record<string, ChartPoint[]>>;
  };
  skew: {
    value25d: number | null;
    interpretation: string;
    BTC?: { value25d: number | null; interpretation: string };
    ETH?: { value25d: number | null; interpretation: string };
  };
  updatedAt: number;
  error?: string;
}
export interface FearGreedData {
  current: {
    value: number;
    label: string;
  };
  changes: {
    yesterday: number | null;
    weekAgo: number | null;
    monthAgo: number | null;
  };
  chart: Array<{ t: number; v: number; label: string }>;
  updatedAt: number;
  error?: string;
}
export interface ETFRow {
  date: string;
  flows: Record<string, number | null>;
  total: number;
}
export interface AssetETFData {
  asset: string;
  latest: ETFRow | null;
  last30Days: ETFRow[];
  byETF: Record<string, number>;
  lastTradingDay: string;
  error?: string;
}
export interface ETFData {
  btc: AssetETFData;
  eth: AssetETFData;
  sol: AssetETFData;
  hype: AssetETFData;
  lastTradingDay: string;
  note: string;
  updatedAt: number;
  error?: string;
}
export interface DashboardData {
  coinalyze: CoinalyzeData;
  deribit: DeribitData;
  feargreed: FearGreedData;
  etf: ETFData;
  updatedAt: number;
}
