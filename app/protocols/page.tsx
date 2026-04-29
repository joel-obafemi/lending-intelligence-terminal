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
import { FluidSmartStatsCard } from "@/components/protocols/fluid-smart-stats-card"
import { AssetStackChart } from "@/components/overview/asset-stack-chart"

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
  const [detail, curators, fluidStats] = await Promise.all([
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
  ])

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

      {/* Total Supply + Total Borrows by asset for this protocol */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AssetStackChart
          title={`${detail.name} · Total Supply by Asset`}
          data={detail.supplyByAssetSeries}
          topAssets={detail.topAssets}
        />
        <AssetStackChart
          title={`${detail.name} · Total Borrows by Asset`}
          data={detail.borrowedByAssetSeries}
          topAssets={detail.topAssets}
        />
      </div>

      {/* Top markets chart + full table */}
      <TopMarketsBarChart
        title={`${detail.name} · Top Markets by Total Supply`}
        color={detail.color}
        markets={detail.markets}
        topN={15}
      />

      <MarketsTable
        architecture={detail.architecture}
        color={detail.color}
        markets={detail.markets}
      />

      {/* Morpho-only: who's running the capital. Shown beneath the markets
          table since vaults are the unit Morpho displays elsewhere. */}
      {slug === "morpho-blue" && curators.length > 0 && (
        <CuratorLeaderboard rows={curators} />
      )}
    </div>
  )
}
