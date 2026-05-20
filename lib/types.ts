export interface ChartPoint {
  t: number;
  v: number;
}

export interface LiqPoint {
  t: number;
  long: number;
  short: number;
  total: number;
}

export interface VolumePoint {
  t: number;
  volume: number;
  price: number;
}

export interface CoinalyzeData {
  price: number;
  openInterest: {
    current: number;
    change24h: number;
    chart: ChartPoint[];
  };
  fundingRate: {
    current: number;
    annualized: number;
    chart: ChartPoint[];
  };
  liquidations: {
    total24h: number;
    longs24h: number;
    shorts24h: number;
    chart: LiqPoint[];
  };
  volume: {
    total24h: number;
    chart: VolumePoint[];
  };
  updatedAt: number;
  error?: string;
}

export interface DeribitData {
  dvol: {
    current: number;
    chart: ChartPoint[];
  };
  skew: {
    value25d: number | null;
    interpretation: string;
    strikes: Array<{ strike: number; type: string; iv: number }>;
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

export interface ETFData {
  lastTradingDay: string;
  latest: ETFRow | null;
  last30Days: ETFRow[];
  cumulativeChart: Array<{ date: string; daily: number; cumulative: number }>;
  byETF: Record<string, number>;
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
