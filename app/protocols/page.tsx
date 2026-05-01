import { Suspense } from "react"
import Link from "next/link"
import { loadProtocolDetail } from "@/lib/protocol-detail"
import { loadMorphoCuratorLeaderboard, type CuratorLeaderboardRow } from "@/lib/morpho-api"
import { loadFluidSmartVaultStats, type FluidSmartVaultStats } from "@/lib/fluid-stats"
import { PROTOCOLS, PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { ProtocolTabs } from "@/components/protocols/protocol-tabs"
import { ProtocolStatCards } from "@/components/protocols/protocol-stat-cards"
import { MarketsTable } from "@/components/protocols/markets-table"
import { TopMarketsBarChart } from "@/components/protocols/top-markets-bar-chart"
import { CuratorLeaderboard } from "@/components/protocols/curator-leaderboard"
import { MorphoCuratorConcentration } from "@/components/protocols/morpho-curator-concentration"
import { FluidSmartStatsCard } from "@/components/protocols/fluid-smart-stats-card"
import { AaveMultiChainFootprint } from "@/components/protocols/aave-multi-chain-footprint"
import { AaveIsolationModeWatch } from "@/components/protocols/aave-isolation-mode-watch"
import { AaveSafetyModule } from "@/components/protocols/aave-safety-module"
import { SparkYieldPanel } from "@/components/protocols/spark-yield-panel"
import { AssetStackChart } from "@/components/overview/asset-stack-chart"
import { AsOfFooter } from "@/components/overview/as-of-footer"
import {
  loadSafetyModuleStatus,
  type SafetyModuleStatus,
} from "@/lib/aave-safety-module"
import { loadAllAaveReservesLive } from "@/lib/aave-onchain"
import {
  loadSparkYieldPanel,
  type SparkYieldPanelResponse,
} from "@/lib/spark-yield-panel"

export const dynamic = "force-dynamic"
// Heavy first render: DefiLlama Yields snapshot + per-protocol history.
export const maxDuration = 60

interface SearchParams {
  p?: string
}

export default async function ProtocolsPage({ searchParams }: { searchParams: SearchParams }) {
  const slug = searchParams.p ?? PROTOCOLS[0].slug
  const cfg = PROTOCOL_BY_SLUG[slug]

  if (!cfg) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted">
          Protocol Deep Dive
        </h1>
        <div
          className="tui-card bg-card-bg border border-card-border rounded p-6 text-sm"
          style={{ color: "var(--danger)" }}
        >
          Unknown protocol slug: {slug}
        </div>
        <Suspense>
          <ProtocolTabs />
        </Suspense>
      </div>
    )
  }

  // Per-protocol extras run in parallel with the standard detail load. Each
  // one is failure-tolerant: a fetch error returns the empty/null shape and
  // the page just doesn't render that section.
  const [
    detail,
    curators,
    fluidStats,
    safetyModule,
    aaveReservesForPrice,
    sparkYieldPanel,
  ] = await Promise.all([
    loadProtocolDetail(slug),
    slug === "morpho-blue"
      ? loadMorphoCuratorLeaderboard().catch((err) => {
          console.error("[protocols] curator leaderboard failed:", err?.message ?? err)
          return [] as CuratorLeaderboardRow[]
        })
      : Promise.resolve([] as CuratorLeaderboardRow[]),
    slug === "fluid"
      ? loadFluidSmartVaultStats().catch((err) => {
          console.error("[protocols] fluid smart stats failed:", err?.message ?? err)
          return null as FluidSmartVaultStats | null
        })
      : Promise.resolve(null as FluidSmartVaultStats | null),
    slug === "aave-v3"
      ? loadSafetyModuleStatus().catch((err) => {
          console.error("[protocols] safety module load failed:", err?.message ?? err)
          return null as SafetyModuleStatus | null
        })
      : Promise.resolve(null as SafetyModuleStatus | null),
    // Pull AAVE's price from the live Aave reserves so the Safety Module
    // can be denominated in USD. Aave V3 mainnet lists AAVE as collateral,
    // so the price is already in the reserve struct we just fetched for
    // the markets table — no extra DefiLlama hit required.
    slug === "aave-v3"
      ? loadAllAaveReservesLive().catch(() => [])
      : Promise.resolve([]),
    slug === "spark"
      ? loadSparkYieldPanel().catch((err) => {
          console.error("[protocols] spark yield panel failed:", err?.message ?? err)
          return null as SparkYieldPanelResponse | null
        })
      : Promise.resolve(null as SparkYieldPanelResponse | null),
  ])

  // Fold AAVE/USD into the safety-module status when we have it.
  const aavePriceUsd =
    aaveReservesForPrice.find((r) => r.symbol.toUpperCase() === "AAVE")?.priceUsd ?? null
  const safetyModuleWithPrice =
    safetyModule && aavePriceUsd != null
      ? {
          ...safetyModule,
          aavePriceUsd,
          smTotalUsd: safetyModule.aaveBacking * aavePriceUsd,
          maxSlashableUsd:
            safetyModule.aaveBacking * aavePriceUsd * (30 / 100),
        }
      : safetyModule

  if (!detail) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        <Suspense>
          <ProtocolTabs />
        </Suspense>
        <div
          className="tui-card bg-card-bg border border-card-border rounded p-6 text-sm text-text-muted"
        >
          Couldn&apos;t load data for {cfg.name}. DefiLlama Yields may be slow, reload in a moment.
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Protocol Deep Dive
        </h1>
        <p className="text-xs text-text-muted">
          Per-protocol market breakdown, rates, and historical liquidity across the four tracked
          Ethereum lending protocols. Source: DefiLlama Yields.
        </p>
      </div>

      <Suspense>
        <ProtocolTabs />
      </Suspense>

      {/* Protocol header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="flex-shrink-0 w-3 h-3 mt-1.5 rounded-full"
            style={{ backgroundColor: detail.color }}
          />
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {detail.name}
              <span
                className="ml-2 text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
                style={{
                  background: `${detail.color}22`,
                  color: detail.color,
                  border: `1px solid ${detail.color}44`,
                }}
              >
                {detail.architecture}
              </span>
            </h2>
            <p className="text-xs text-text-muted max-w-2xl leading-relaxed mt-1">
              {detail.description}
            </p>
          </div>
        </div>
        <Link
          href={detail.website}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] uppercase tracking-[0.1em] flex-shrink-0"
          style={{ color: "var(--accent-orange)" }}
        >
          {detail.website.replace(/^https?:\/\//, "")} ↗
        </Link>
      </div>

      <ProtocolStatCards detail={detail} />

      {/* Fluid-only: Smart Collateral / Smart Debt adoption — Fluid's
          headline differentiator vs. Aave V3 forks. Sits high on the page
          since this is the metric most Fluid pieces hinge on. */}
      {slug === "fluid" && fluidStats && (
        <FluidSmartStatsCard stats={fluidStats} />
      )}

      {/* Spark-only: Stablecoin Yield Cascade — captures the Sky → Spark
          → T-bill story that's specific to Spark's role as Sky's
          on-chain distribution arm. */}
      {slug === "spark" && sparkYieldPanel && (
        <SparkYieldPanel data={sparkYieldPanel} />
      )}

      {/* Aave V3 lens — Isolation Mode Watch sits up here as the
          early-stress signal lens; Multi-Chain Footprint goes side-by-side
          with the Top Markets chart further down. */}
      {slug === "aave-v3" && detail.isolationReserves.length > 0 && (
        <AaveIsolationModeWatch
          rows={detail.isolationReserves}
          color={detail.color}
        />
      )}

      {/* Aave V3 lens — Safety Module status. The on-chain stkAAVE pool
          backstops bad debt; this surface answers "how much capital is
          actually backing the protocol right now". */}
      {slug === "aave-v3" && safetyModuleWithPrice && (
        <AaveSafetyModule
          status={safetyModuleWithPrice}
          protocolColor={detail.color}
        />
      )}

      {/* Total Supply + Total Borrows by asset for this protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AssetStackChart
          title={`${detail.name} · Total Supply by Asset`}
          data={detail.supplyByAssetSeries}
          topAssets={detail.topAssets}
          methodologyKey="protocol-supply-by-asset"
        />
        <AssetStackChart
          title={`${detail.name} · Total Borrows by Asset`}
          data={detail.borrowedByAssetSeries}
          topAssets={detail.topAssets}
          methodologyKey="protocol-borrows-by-asset"
        />
      </div>

      {/* Top markets chart + (Aave-only) Multi-Chain Footprint side-by-side.
          For non-Aave protocols the Top Markets chart spans the full row.
          The shared layout lets both charts breathe; the filter pills on
          each one let the reader frame the same data three ways. */}
      {slug === "aave-v3" && Object.keys(detail.multiChainTvl).length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopMarketsBarChart
            protocolName={detail.name}
            color={detail.color}
            markets={detail.markets}
            topN={15}
            defaultView="supply"
            views={["supply", "available", "borrows"]}
          />
          <AaveMultiChainFootprint
            multiChainAvailable={detail.multiChainTvl}
            multiChainBorrowed={detail.multiChainBorrowed}
            color={detail.color}
            protocolName={detail.name}
          />
        </div>
      ) : (
        <TopMarketsBarChart
          protocolName={detail.name}
          color={detail.color}
          markets={detail.markets}
          topN={15}
          defaultView="supply"
          views={
            // Morpho's vault rows on DefiLlama Yields don't carry borrowed
            // USD, so the Borrows view would be empty. Limit Morpho to the
            // supply / available filters.
            slug === "morpho-blue" ? ["supply", "available"] : ["supply", "available", "borrows"]
          }
        />
      )}

      <MarketsTable
        architecture={detail.architecture}
        color={detail.color}
        markets={detail.markets}
      />

      {/* Morpho-only: curator concentration first (the visual punchline —
          HHI + a single stacked bar showing the top 5 curators), then the
          full leaderboard table beneath it. */}
      {slug === "morpho-blue" && curators.length > 0 && (
        <>
          <MorphoCuratorConcentration rows={curators} />
          <CuratorLeaderboard rows={curators} />
        </>
      )}

      {/* As-of footer — surfaces the live-load timestamp so a reader can
          see how stale this page is vs the Sector Overview snapshot
          (which refreshes once daily at 01:00 UTC). The two pages don't
          share a snapshot; this footer is the lightweight reconciliation
          signal. */}
      <AsOfFooter
        timestamp={Math.floor(Date.now() / 1000)}
        source="DefiLlama + on-chain · live load"
      />
    </div>
  )
}
