import { VerdictStrip } from "@/components/overview/verdict-strip"
import { MarketShareBorrowsHero } from "@/components/overview/market-share-borrows-hero"
import { CompositionStrip } from "@/components/overview/composition-strip"
import { NetFlows30d } from "@/components/overview/net-flows-30d"
import { CompositionDonuts } from "@/components/overview/composition-donuts"
import { TopMarketsCrossProtocolTable } from "@/components/overview/top-markets-cross-protocol-table"
import { WatchList } from "@/components/overview/watch-list"
import { ReportsFooter } from "@/components/overview/reports-footer"
import { ProtocolComparisonTable } from "@/components/overview/protocol-comparison-table"
import { loadSectorOverview } from "@/lib/sector-snapshot"
import { loadTopMarketsAcrossProtocols } from "@/lib/cross-protocol-markets"
import { loadRealYieldSpread } from "@/lib/real-yield"
import { loadWatchList } from "@/lib/watch-list"
import { sectorVerdictSentence } from "@/lib/headline-sentence"
import {
  biggestMover,
  interestAccrual30dByProtocol,
  marketShareByBorrowsSeries,
  netDeposits30dByProtocol,
  sectorTakeRatePct,
  sectorUtilizationPct,
  tvlMomChangeFraction,
} from "@/lib/sector-derived"

export const dynamic = "force-dynamic"
// Heavy first render only on cache miss / stale snapshot. Hot path is a
// single Neon SELECT (~5ms).
export const maxDuration = 60

export default async function OverviewPage() {
  const [overview, topMarkets, realYield, watchList] = await Promise.all([
    loadSectorOverview(),
    loadTopMarketsAcrossProtocols(50),
    loadRealYieldSpread().catch(() => null),
    loadWatchList().catch(() => null),
  ])
  const data = overview.payload
  const { snapshot, protocols, revenueSnapshot } = data

  // ─── Zone 1 inputs ────────────────────────────────────────────────────
  const utilizationPct = sectorUtilizationPct(data)
  const takeRatePct = sectorTakeRatePct(data)
  const realYieldSpreadPct = realYield?.current.spreadPct ?? null
  const verdictSummary = sectorVerdictSentence({
    asOf: overview.fetchedAt,
    totalTvlUsd: snapshot.totalTvl,
    tvlMomChange: tvlMomChangeFraction(data),
    protocolCount: snapshot.protocolCount,
    realYieldSpreadPct,
    sectorTakeRatePct: takeRatePct,
  })

  // ─── Zone 2 input ─────────────────────────────────────────────────────
  const borrowsShareSeries = marketShareByBorrowsSeries(data.borrowedSeries)

  // ─── Zone 3 / 4 inputs ────────────────────────────────────────────────
  const netDeps30d = netDeposits30dByProtocol(data.netFlowWeeklySeries)
  const interest30d = interestAccrual30dByProtocol(data.netInterestPaidDailySeries)
  const mover = biggestMover(netDeps30d)

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-6">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Sector Overview
        </h1>
        <p className="text-xs text-text-muted">
          Aggregate metrics across {snapshot.protocolCount} Ethereum lending protocols. Source:
          DefiLlama, the Liquidator Economy DB, and FRED.
        </p>
      </div>

      {/* Zone 1 — Verdict strip */}
      <VerdictStrip
        totalTvlUsd={snapshot.totalTvl}
        totalBorrowedUsd={snapshot.totalBorrowed}
        utilizationPct={utilizationPct}
        realYieldSpreadPct={realYieldSpreadPct}
        takeRatePct={takeRatePct}
        summary={verdictSummary}
      />

      {/* Zone 2 — Hero: Market Share by Borrows, 24-month */}
      <MarketShareBorrowsHero
        title="Market Share by Borrows"
        data={borrowsShareSeries}
        methodologyKey="sector-borrows-share"
      />

      {/* Zone 3 — Composition Strip (per-protocol) */}
      <CompositionStrip
        protocols={protocols}
        revenueSnapshot={revenueSnapshot}
        netDeposits30d={netDeps30d}
        biggestMover={mover}
      />

      {/* Zone 4 — Net Flows v1 (organic vs interest, trailing 30d) */}
      <NetFlows30d
        title="Net Supply Flows · Organic vs Interest"
        netDeposits30d={netDeps30d}
        interest30d={interest30d}
        methodologyKey="sector-net-flows-30d"
      />

      {/* Zone 5 — Composition donuts (collateral + borrow) */}
      <CompositionDonuts
        collateral={data.topCollateralAssets}
        borrowed={data.topBorrowedAssets}
      />

      {/* Zone 6 — Top 10 markets across protocols (freshened sort options) */}
      <TopMarketsCrossProtocolTable
        title="Top 10 Markets Across All Protocols"
        markets={topMarkets}
      />

      {/* Zone 7 — Watch List (rendered from content/watch.md) */}
      {watchList && watchList.items.length > 0 && <WatchList data={watchList} />}

      {/* Protocol comparison table — kept as a familiar dense reference */}
      <ProtocolComparisonTable rows={protocols} />

      {/* Zone 8 — Reports footer */}
      <ReportsFooter pageUrl="https://lending-intelligence-terminal.vercel.app/" />

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
