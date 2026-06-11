// app/api/theblock/route.ts
// Consolidated endpoint serving all The Block sourced metrics plus news.
// Verification endpoint for Phase 1; will be wired into /api/all afterwards.

import { NextResponse } from "next/server";
import {
  fetchCharts,
  searchNews,
  latest,
  valueDaysAgo,
  totalsByTimestamp,
  lastNonZeroTotal,
  lastN,
  type ParsedChart,
  type RawPoint,
} from "@/lib/theblock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SLUGS = {
  oiBtc: "aggregated-open-interest-of-bitcoin-futures-daily",
  oiEth: "aggregated-open-interest-of-ethereum-futures-daily",
  fundingBtc: "btc-funding-rates",
  fundingEth: "eth-funding-rates",
  basisBtc: "btc-annualized-basis-binance",
  ivBtc: "btc-atm-implied-volatility",
  ivEth: "eth-atm-implied-volatility",
  realizedVolBtc: "annualized-btc-volatility-30d",
  putCallOi: "open-interest-put-call-ratio",
  optionsOiBtc: "aggregated-open-interest-of-bitcoin-options",
  optionsOiEth: "aggregated-open-interest-of-ethereum-options",
  optionsVolBtc: "volume-of-bitcoin-options",
  etfFlowsBtc: "spot-bitcoin-etf-flows",
  etfFlowsEth: "spot-ethereum-etf-flows",
  etfFlowsHype: "hype-spot-etf-flows",
  etfAumBtc: "spot-bitcoin-etf-assets",
  etfAumEth: "spot-ethereum-etf-aum-daily",
  stablecoins: "total-stablecoin-supply-2",
  strategyHoldings: "microstrategy-bitcoin-holdings",
  spotVolumeByAsset: "spot-volume-by-asset",
} as const;

// Summed-series metric (e.g. OI stacked by exchange, AUM by product).
function summedMetric(chart: ParsedChart | null, historyPoints = 90) {
  if (!chart) return null;
  const totals = totalsByTimestamp(chart.series);
  const last = totals.length ? totals[totals.length - 1] : null;
  const prev7 = valueDaysAgo(totals, 7);
  const prev30 = valueDaysAgo(totals, 30);
  return {
    description: chart.description,
    latest: last?.Result ?? null,
    latestTs: last?.Timestamp ?? null,
    sevenDaysAgo: prev7?.Result ?? null,
    thirtyDaysAgo: prev30?.Result ?? null,
    history: lastN(totals, historyPoints),
  };
}

// Flow metric: latest meaningful (non-zero) day plus per-product breakdown.
function flowMetric(chart: ParsedChart | null, historyPoints = 30) {
  if (!chart) return null;
  const totals = totalsByTimestamp(chart.series);
  const lastFlow = lastNonZeroTotal(chart.series);
  const byProduct: Record<string, number | null> = {};
  if (lastFlow) {
    for (const [name, pts] of Object.entries(chart.series)) {
      const match = pts.find((p) => p.Timestamp === lastFlow.Timestamp);
      byProduct[name] = match ? match.Result : null;
    }
  }
  return {
    description: chart.description,
    latestFlow: lastFlow?.Result ?? null,
    latestFlowTs: lastFlow?.Timestamp ?? null,
    byProduct,
    history: lastN(totals, historyPoints),
  };
}

// Multi-series metric where each series stands alone (e.g. IV by tenor,
// put/call by currency). Returns latest plus 7d ago per series.
function perSeriesMetric(chart: ParsedChart | null, historyPoints = 90) {
  if (!chart) return null;
  const out: Record<string, { latest: number | null; latestTs: number | null; sevenDaysAgo: number | null; thirtyDaysAgo: number | null; history: RawPoint[] }> = {};
  for (const [name, pts] of Object.entries(chart.series)) {
    const last = latest(pts);
    out[name] = {
      latest: last?.Result ?? null,
      latestTs: last?.Timestamp ?? null,
      sevenDaysAgo: valueDaysAgo(pts, 7)?.Result ?? null,
      thirtyDaysAgo: valueDaysAgo(pts, 30)?.Result ?? null,
      history: lastN(pts, historyPoints),
    };
  }
  return { description: chart.description, series: out };
}

export async function GET() {
  const slugList = Object.values(SLUGS);
  const charts = await fetchCharts(slugList);

  const errors: string[] = [];
  for (const slug of slugList) {
    if (!charts[slug]) errors.push(`Failed to fetch chart: ${slug}`);
  }

  const news = await searchNews({ hours: 24, size: 20 });
  if (!news.length) errors.push("News fetch returned no articles");

  return NextResponse.json({
    ok: errors.length < slugList.length,
    fetchedAt: new Date().toISOString(),
    metrics: {
      openInterest: {
        btc: summedMetric(charts[SLUGS.oiBtc]),
        eth: summedMetric(charts[SLUGS.oiEth]),
      },
      funding: {
        btc: perSeriesMetric(charts[SLUGS.fundingBtc]),
        eth: perSeriesMetric(charts[SLUGS.fundingEth]),
      },
      basis: {
        btc: perSeriesMetric(charts[SLUGS.basisBtc]),
      },
      options: {
        ivBtc: perSeriesMetric(charts[SLUGS.ivBtc]),
        ivEth: perSeriesMetric(charts[SLUGS.ivEth]),
        realizedVolBtc: perSeriesMetric(charts[SLUGS.realizedVolBtc]),
        putCallOi: perSeriesMetric(charts[SLUGS.putCallOi]),
        oiBtc: summedMetric(charts[SLUGS.optionsOiBtc]),
        oiEth: summedMetric(charts[SLUGS.optionsOiEth]),
        volumeBtc: summedMetric(charts[SLUGS.optionsVolBtc]),
      },
      etf: {
        flowsBtc: flowMetric(charts[SLUGS.etfFlowsBtc]),
        flowsEth: flowMetric(charts[SLUGS.etfFlowsEth]),
        flowsHype: flowMetric(charts[SLUGS.etfFlowsHype]),
        aumBtc: summedMetric(charts[SLUGS.etfAumBtc]),
        aumEth: summedMetric(charts[SLUGS.etfAumEth]),
      },
      stablecoins: summedMetric(charts[SLUGS.stablecoins]),
      strategyHoldings: perSeriesMetric(charts[SLUGS.strategyHoldings]),
      spotVolumeByAsset: perSeriesMetric(charts[SLUGS.spotVolumeByAsset], 30),
    },
    news,
    errors,
  });
}
