import { VerdictStrip } from "@/components/overview/verdict-strip"
import { MarketShareHero } from "@/components/overview/market-share-hero"
import { CompositionStrip } from "@/components/overview/composition-strip"
import { NetFlowSummaryTable } from "@/components/overview/net-flow-summary-table"
import { CompositionDonuts } from "@/components/overview/composition-donuts"
import { TopMarketsCrossProtocolTable } from "@/components/overview/top-markets-cross-protocol-table"
import { WatchList } from "@/components/overview/watch-list"
import { CiteThisPage } from "@/components/overview/cite-this-page"
import { loadSectorOverview } from "@/lib/sector-snapshot"
import { loadTopMarketsAcrossProtocols } from "@/lib/cross-protocol-markets"
import { loadRealYieldSpread } from "@/lib/real-yield"
import { loadWatchList } from "@/lib/watch-list"
import { sectorVerdictSentence } from "@/lib/headline-sentence"
import {
  biggestMover,
  buildDailyDeltaTriple,
  buildHeroLenses,
  interestAccrual30dByProtocol,
  netDeposits30dByProtocol,
  sectorTakeRatePct,
  sectorUtilizationDailySeries,
  sectorUtilizationPct,
  suppliedMomChangeFraction,
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

  // ─── Verdict strip inputs ─────────────────────────────────────────────
  const utilizationPct = sectorUtilizationPct(data)
  const takeRatePct = sectorTakeRatePct(data)
  const realYieldSpreadPct = realYield?.current.spreadPct ?? null

  // Daily series → MoM/YoY pp + sparkline for the rate cards.
  const utilDaily = sectorUtilizationDailySeries(data)
  const utilizationDeltas = buildDailyDeltaTriple(utilDaily)
  const realYieldDailySeries =
    realYield?.history
      .filter((p) => p.spreadPct != null && Number.isFinite(p.spreadPct))
      .map((p) => ({ timestamp: p.timestamp, value: p.spreadPct as number })) ?? []
  const realYieldDeltas =
    realYieldDailySeries.length > 0
      ? buildDailyDeltaTriple(realYieldDailySeries)
      : null

  const verdictSummary = sectorVerdictSentence({
    asOf: overview.fetchedAt,
    totalSuppliedUsd: snapshot.totalSupplied,
    suppliedMomChange: suppliedMomChangeFraction(data),
    protocolCount: snapshot.protocolCount,
    realYieldSpreadPct,
    sectorTakeRatePct: takeRatePct,
  })

  // ─── Hero lens series + insight ───────────────────────────────────────
  const hero = buildHeroLenses(data)

  // ─── Net Flows v2 + Composition strip mover line ──────────────────────
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

      {/* Zone 1 — Verdict strip (3 scale + 3 rate cards + summary) */}
      <VerdictStrip
        totalSuppliedUsd={snapshot.totalSupplied}
        totalSuppliedDeltas={snapshot.suppliedDeltas}
        totalBorrowedUsd={snapshot.totalBorrowed}
        totalBorrowedDeltas={snapshot.borrowedDeltas}
        availableLiquidityUsd={snapshot.totalTvl}
        availableLiquidityDeltas={snapshot.tvlDeltas}
        utilizationPct={utilizationPct}
        utilizationDeltas={{
          changeMoM: utilizationDeltas.changeMoM,
          changeYoY: utilizationDeltas.changeYoY,
          sparkline: utilizationDeltas.sparkline,
        }}
        realYieldSpreadPct={realYieldSpreadPct}
        realYieldDeltas={
          realYieldDeltas
            ? {
                changeMoM: realYieldDeltas.changeMoM,
                changeYoY: realYieldDeltas.changeYoY,
                sparkline: realYieldDeltas.sparkline,
              }
            : null
        }
        takeRatePct={takeRatePct}
        summary={verdictSummary}
      />

      {/* Zone 2 — Hero: Market Share with Borrows / Supply / Available toggle */}
      <MarketShareHero
        borrowsShare={hero.borrowsShare}
        supplyShare={hero.supplyShare}
        availableShare={hero.availableShare}
        insight={hero.insight}
        methodologyKey="sector-borrows-share"
      />

      {/* Zone 3 — Composition Strip (per-protocol cards w/ Fees + biggest mover) */}
      <CompositionStrip
        protocols={protocols}
        revenueSnapshot={revenueSnapshot}
        netDeposits30d={netDeps30d}
        biggestMover={mover}
      />

      {/* Zone 4 — Net Flow Summary table (replaces the broken stacked-bar chart) */}
      <NetFlowSummaryTable
        netDeposits30d={netDeps30d}
        interest30d={interest30d}
        protocols={protocols}
        methodologyKey="sector-net-flows-30d"
      />

      {/* Zone 5 — Composition donuts (totals reconciled to Verdict cards) */}
      <CompositionDonuts
        collateral={data.topCollateralAssets}
        borrowed={data.topBorrowedAssets}
        totalSuppliedUsd={snapshot.totalSupplied}
        totalBorrowedUsd={snapshot.totalBorrowed}
      />

      {/* Zone 6 — Top 10 markets across protocols */}
      <TopMarketsCrossProtocolTable
        title="Top 10 Markets Across All Protocols"
        markets={topMarkets}
      />

      {/* Zone 7 — Watch List */}
      {watchList && watchList.items.length > 0 && <WatchList data={watchList} />}

      {/* Zone 8 — Cite this page (the rest of the reports footer is removed
          until a real issue is ready to publish). */}
      <CiteThisPage
        pageTitle="Sector Overview"
        pageUrl="https://lending-intelligence-terminal.vercel.app/"
      />

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
