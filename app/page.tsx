import { TrendingUp, TrendingDown, Lock, Layers } from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import { TvlStackChart } from "@/components/overview/tvl-stack-chart"
import { UtilizationChart } from "@/components/overview/utilization-chart"
import { MarketShareChart } from "@/components/overview/market-share-chart"
import { NetFlowChart } from "@/components/overview/net-flow-chart"
import { ProtocolComparisonTable } from "@/components/overview/protocol-comparison-table"
import { TopMarketsCrossProtocolTable } from "@/components/overview/top-markets-cross-protocol-table"
import { RealYieldSpreadChart } from "@/components/overview/real-yield-spread-chart"
import { loadOverview } from "@/lib/overview"
import { loadTopMarketsAcrossProtocols } from "@/lib/cross-protocol-markets"
import { loadRealYieldSpread } from "@/lib/real-yield"

export const dynamic = "force-dynamic"
// Heavy first render: 4 protocol histories + cross-protocol markets + real-yield + liquidations.
export const maxDuration = 60

export default async function OverviewPage() {
  const [data, topMarkets, realYield] = await Promise.all([
    loadOverview(),
    loadTopMarketsAcrossProtocols(50),
    loadRealYieldSpread().catch(() => null),
  ])
  const { snapshot, protocols, tvlSeries } = data

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Sector Overview
        </h1>
        <p className="text-xs text-text-muted">
          Aggregate metrics across {snapshot.protocolCount} Ethereum lending protocols. Source:
          DefiLlama, the Liquidator Economy DB, and FRED.
        </p>
      </div>

      {/* Tier 1 headline counters — 24h delta + sparkline on the three USD
          totals; stablecoin debt share rides on the same row as a percentage. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Supplied"
          value={snapshot.totalSupplied}
          change24h={snapshot.suppliedDeltas.change24h}
          sparkline={snapshot.suppliedDeltas.sparkline}
          icon={<TrendingUp size={12} strokeWidth={2.5} />}
          accentColor="#10B981"
        />
        <MetricCard
          label="Total Borrows"
          value={snapshot.totalBorrowed}
          change24h={snapshot.borrowedDeltas.change24h}
          sparkline={snapshot.borrowedDeltas.sparkline}
          icon={<TrendingDown size={12} strokeWidth={2.5} />}
          accentColor="#EC4899"
        />
        <MetricCard
          label="Total Value Locked"
          value={snapshot.totalTvl}
          change24h={snapshot.tvlDeltas.change24h}
          sparkline={snapshot.tvlDeltas.sparkline}
          icon={<Lock size={12} strokeWidth={2.5} />}
          accentColor="#B44AFF"
        />
        <MetricCard
          label="Stablecoin Debt Share"
          value={snapshot.stablecoinDebtSharePct}
          format="percent"
          caption="of cross-protocol borrows"
          icon={<Layers size={12} strokeWidth={2.5} />}
          accentColor="#F59E0B"
        />
      </div>

      {/* Row 1: Supply + Borrows by protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TvlStackChart title="Total Supply by Protocol" data={data.supplySeries} paramKey="supply" />
        <TvlStackChart title="Total Borrows by Protocol" data={data.borrowedSeries} paramKey="borrow" />
      </div>

      {/* Row 2: TVL + Utilization by protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TvlStackChart title="TVL by Protocol" data={tvlSeries} showAllOption paramKey="tvl" />
        <UtilizationChart title="Utilization by Protocol" data={data.utilizationSeries} />
      </div>

      {/* Row 3: Market share + Net flows */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarketShareChart title="Market Share by TVL" data={data.marketShareSeries} />
        <NetFlowChart title="Net Supply Flows" data={data.netFlowMonthlySeries} />
      </div>

      {/* Real Yield Spread (Tier 2 / Section 7.2 of the blueprint) */}
      {realYield && realYield.history.length > 0 && (
        <RealYieldSpreadChart
          title="Real Yield Spread · Stablecoin Lending vs 4-week T-bill"
          data={realYield.history}
        />
      )}

      {/* Top 10 markets across all four protocols */}
      <TopMarketsCrossProtocolTable
        title="Top 10 Markets Across All Protocols"
        markets={topMarkets}
      />

      <ProtocolComparisonTable rows={protocols} />

      {data.errors.length > 0 && (
        <div
          className="text-[11px] text-text-muted border border-card-border rounded px-3 py-2"
          style={{ background: "var(--card-bg)" }}
        >
          Some protocols failed to load from DefiLlama:{" "}
          {data.errors.map((e) => e.slug).join(", ")}
        </div>
      )}
    </div>
  )
}
