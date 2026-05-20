'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import Image from 'next/image';
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
    <span className={`badge ${pos ? 'badge-green' : 'badge-red'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {pos ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {pos ? '+' : ''}{value.toFixed(2)}{suffix}
    </span>
  );
}

function TopMetric({ label, value, sub, change, valueColor, source }: { label: string; value: string; sub?: string; change?: number; valueColor?: string; source?: string }) {
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div className="card-title">{label}</div>
        {source && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{source}</div>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: valueColor || 'var(--text)', lineHeight: 1.1, marginBottom: 6 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: 20 }}>
        {change !== undefined && <StatBadge value={change} />}
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</span>}
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

  const fundingPct = c?.fundingRate?.current !== undefined ? (c.fundingRate.current * 100).toFixed(4) : null;
  const fundingColor = c?.fundingRate?.current !== undefined ? (c.fundingRate.current > 0 ? 'var(--green)' : c.fundingRate.current < 0 ? 'var(--red)' : 'var(--text)') : 'var(--text)';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Image src="/lmax-logo.jpg" alt="LMAX Digital" width={140} height={36} style={{ objectFit: 'contain' }} />
            <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Market Data Feed</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>Bitcoin Derivatives & Sentiment</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Live</span>
            </div>
            {lastFetch && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Updated {timeAgo(lastFetch)}</span>}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: refreshing ? 'var(--surface3)' : 'var(--accent)',
                color: refreshing ? 'var(--text-muted)' : '#fff',
                border: 'none', cursor: refreshing ? 'not-allowed' : 'pointer',
                fontFamily: 'DM Sans, sans-serif', transition: 'opacity 0.2s',
              }}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px' }}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8, background: 'var(--red-light)', border: '1px solid #fecaca', marginBottom: 16 }}>
            <AlertCircle size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 13, color: 'var(--red)' }}>Data error: {error}</span>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <PriceHeader price={c?.price} loading={loading} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <TopMetric
            label="Open Interest (24H)"
            value={loading ? '—' : formatUSD(c?.openInterest?.current || 0)}
            change={c?.openInterest?.change24h}
            source="Coinalyze"
          />
          <TopMetric
            label="Volume (24H)"
            value={loading ? '—' : formatUSD(c?.volume?.total24h || 0)}
            source="Coinalyze"
          />
          <TopMetric
            label="Total Liquidations (24H)"
            value={loading ? '—' : formatUSD(c?.liquidations?.total24h || 0)}
            sub={c?.liquidations ? `Longs: ${formatUSD(c.liquidations.longs24h)} · Shorts: ${formatUSD(c.liquidations.shorts24h)}` : undefined}
            source="Coinalyze"
          />
          <TopMetric
            label="Funding Rate (8H)"
            value={loading ? '—' : fundingPct ? `${fundingPct}%` : '—'}
            sub="Per 8-hour settlement period"
            valueColor={fundingColor}
            source="Coinalyze"
          />
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

        <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11, color: 'var(--text-muted)' }}>
          Data: Coinalyze · Deribit · Alternative.me · Farside Investors · Auto-refreshes every 5 minutes
        </div>
      </main>
    </div>
  );
}
