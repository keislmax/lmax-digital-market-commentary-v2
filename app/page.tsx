'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { DashboardData } from '@/lib/types';
import { timeAgo, formatUSD } from '@/lib/utils';
import PriceHeader from '@/components/PriceHeader';
import OpenInterestCard from '@/components/OpenInterestCard';
import LiquidationsCard from '@/components/LiquidationsCard';
import FundingRateCard from '@/components/FundingRateCard';
import VolumeCard from '@/components/VolumeCard';
import FearGreedCard from '@/components/FearGreedCard';
import OptionsCard from '@/components/OptionsCard';
import ETFCard from '@/components/ETFCard';

const REFRESH_INTERVAL = 5 * 60 * 1000;

function StatBadge({ value, suffix = '%' }: { value?: number; suffix?: string }) {
  if (value === undefined || value === null) return null;
  const pos = value >= 0;
  return (
    <span className={`badge ${pos ? 'badge-green' : 'badge-red'}`}>
      {pos ? <TrendingUp size={10} style={{ marginRight: 3 }} /> : <TrendingDown size={10} style={{ marginRight: 3 }} />}
      {pos ? '+' : ''}{value.toFixed(2)}{suffix}
    </span>
  );
}

function TopMetric({ label, value, sub, change, valueColor }: { label: string; value: string; sub?: string; change?: number; valueColor?: string }) {
  return (
    <div className="card p-5 flex flex-col gap-2">
      <div className="card-title">{label}</div>
      <div className="metric-value" style={{ color: valueColor }}>{value}</div>
      <div className="flex items-center gap-2 flex-wrap">
        {change !== undefined && <StatBadge value={change} />}
        {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/all', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetch(Date.now());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  const c = data?.coinalyze;
  const d = data?.deribit;
  const fg = data?.feargreed;
  const etf = data?.etf;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
              BTC Market Intelligence
            </div>
            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Live</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastFetch && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Updated {timeAgo(lastFetch)}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: refreshing ? 'var(--surface3)' : 'var(--accent)',
                color: refreshing ? 'var(--text-muted)' : '#fff',
                border: 'none', cursor: refreshing ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: 'var(--red-light)', border: '1px solid #fecaca', marginBottom: 20 }}>
            <AlertCircle size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 13, color: 'var(--red)' }}>Data error: {error}</span>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <PriceHeader price={c?.price} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <TopMetric label="Open Interest" value={loading ? '—' : formatUSD(c?.openInterest?.current || 0)} change={c?.openInterest?.change24h} sub="24h change" />
          <TopMetric label="24H Volume" value={loading ? '—' : formatUSD(c?.volume?.total24h || 0)} />
          <TopMetric label="Total Liquidations" value={loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)} sub={c?.liquidations ? `L: ${formatUSD(c.liquidations.longs24h)} · S: ${formatUSD(c.liquidations.shorts24h)}` : undefined} />
          <TopMetric label="Funding Rate" value={loading ? '—' : c?.fundingRate?.current !== undefined ? `${(c.fundingRate.current * 100).toFixed(4)}%` : '—'} sub={c?.fundingRate?.annualized !== undefined ? `${(c.fundingRate.annualized * 100).toFixed(1)}% annualised` : undefined} valueColor={c?.fundingRate?.current !== undefined ? (c.fundingRate.current > 0 ? 'var(--green)' : c.fundingRate.current < 0 ? 'var(--red)' : undefined) : undefined} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <OpenInterestCard data={c} loading={loading} />
          <LiquidationsCard data={c} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FundingRateCard data={c} loading={loading} />
          <VolumeCard data={c} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <FearGreedCard data={fg} loading={loading} />
          <OptionsCard data={d} loading={loading} />
          <ETFCard data={etf} loading={loading} />
        </div>

        <div style={{ textAlign: 'center', padding: '16px 0 8px', fontSize: 11, color: 'var(--text-muted)' }}>
          Data sources: Coinalyze · Deribit · Alternative.me · Farside Investors · Refreshes every 5 minutes
        </div>
      </main>
    </div>
  );
}
