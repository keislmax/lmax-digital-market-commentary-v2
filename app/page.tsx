'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, WifiOff } from 'lucide-react';
import { DashboardData } from '@/lib/types';
import { timeAgo, formatUSD } from '@/lib/utils';
import PriceHeader from '@/components/PriceHeader';
import MetricCard from '@/components/MetricCard';
import OpenInterestCard from '@/components/OpenInterestCard';
import LiquidationsCard from '@/components/LiquidationsCard';
import FundingRateCard from '@/components/FundingRateCard';
import VolumeCard from '@/components/VolumeCard';
import FearGreedCard from '@/components/FearGreedCard';
import OptionsCard from '@/components/OptionsCard';
import ETFCard from '@/components/ETFCard';

const REFRESH_INTERVAL = 5 * 60 * 1000;

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
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="sticky top-0 z-50 border-b" style={{ background: 'rgba(8,11,15,0.95)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold tracking-tight">
              BTC<span style={{ color: 'var(--accent)' }}>DESK</span>
            </div>
            <div className="label" style={{ marginTop: '-2px' }}>Bitcoin Market Intelligence</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {error ? (
                <WifiOff size={12} style={{ color: 'var(--red)' }} />
              ) : (
                <div className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
              )}
              <span className="label">
                {error ? 'error' : lastFetch ? `updated ${timeAgo(lastFetch)}` : 'loading...'}
              </span>
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: refreshing ? 'var(--text-muted)' : 'var(--text)', cursor: refreshing ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <AlertCircle size={14} style={{ color: 'var(--red)' }} />
            <span className="text-xs" style={{ color: 'var(--red)' }}>API error: {error}. Showing last cached data.</span>
          </div>
        )}

        <PriceHeader price={c?.price} loading={loading} />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Open Interest" value={formatUSD(c?.openInterest?.current || 0)} change={c?.openInterest?.change24h} changeSuffix="%" loading={loading} />
          <MetricCard label="24H Volume" value={formatUSD(c?.volume?.total24h || 0)} loading={loading} />
          <MetricCard label="Total Liquidations" value={formatUSD(c?.liquidations?.total24h || 0)} subValue={c?.liquidations ? `L: ${formatUSD(c.liquidations.longs24h)} / S: ${formatUSD(c.liquidations.shorts24h)}` : undefined}
          <MetricCard label="Funding Rate" value={c?.fundingRate?.current !== undefined ? `${(c.fundingRate.current * 100).toFixed(4)}%` : '—'} subValue={c?.fundingRate?.annualized !== undefined ? `${(c.fundingRate.annualized * 100).toFixed(1)}% ann.` : undefined} valueColor={c?.fundingRate?.current !== undefined ? (c.fundingRate.current > 0 ? 'var(--green)' : c.fundingRate.current < 0 ? 'var(--red)' : undefined) : undefined} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <OpenInterestCard data={c} loading={loading} />
          <LiquidationsCard data={c} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FundingRateCard data={c} loading={loading} />
          <VolumeCard data={c} loading={loading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <FearGreedCard data={fg} loading={loading} />
          <OptionsCard data={d} loading={loading} />
          <ETFCard data={etf} loading={loading} />
        </div>

        <footer className="pt-4 pb-8 text-center label" style={{ color: 'var(--text-dim)' }}>
          Data: Coinalyze · Deribit · Alternative.me · Farside Investors — auto-refreshes every 5 minutes
        </footer>
      </main>
    </div>
  );
}
