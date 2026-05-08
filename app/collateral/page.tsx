import { loadOverview } from "@/lib/overview"
import { TopAssetsTable } from "@/components/overview/top-assets-table"
import { AssetStackChart } from "@/components/overview/asset-stack-chart"
import { CollateralTypeChart } from "@/components/overview/collateral-type-chart"
import { CiteThisPage } from "@/components/overview/cite-this-page"
import { AsOfFooter } from "@/components/overview/as-of-footer"
import { classifyAsset } from "@/lib/assets"

// ISR — 30 min cache. Composition mix changes slowly; longer
// revalidation window is fine and makes navigation instant.
export const revalidate = 1800
export const maxDuration = 60

export default async function CollateralPage() {
  const data = await loadOverview()

  // Auto insight pre-compute. Restaked-ETH and WETH borrows are the two
  // structurally important shares the audit specifically called out.
  const totalCollateral = data.topCollateralAssets.reduce(
    (s, r) => s + r.usd,
    0,
  )
  const lrtCollateral = data.topCollateralAssets
    .filter((r) => classifyAsset(r.symbol) === "lrt")
    .reduce((s, r) => s + r.usd, 0)
  const lrtPct = totalCollateral > 0 ? (lrtCollateral / totalCollateral) * 100 : 0
  const totalBorrows = data.topBorrowedAssets.reduce((s, r) => s + r.usd, 0)
  const wethRow = data.topBorrowedAssets.find((r) => r.symbol.toUpperCase() === "WETH")
  const wethBorrowPct = wethRow && totalBorrows > 0 ? (wethRow.usd / totalBorrows) * 100 : null

  const composedInsight = (() => {
    const parts: string[] = []
    if (lrtCollateral > 0) {
      parts.push(
        `Restaked ETH (${data.topCollateralAssets
          .filter((r) => classifyAsset(r.symbol) === "lrt")
          .map((r) => r.symbol)
          .slice(0, 3)
          .join(" + ")}) is ${formatCompactUsd(lrtCollateral)} of collateral across the four protocols — ${lrtPct.toFixed(0)}% of total.`,
      )
    }
    if (wethBorrowPct != null) {
      parts.push(
        `WETH at ${wethBorrowPct.toFixed(1)}% of all borrows — the on-chain credit market is fundamentally an ETH borrowing market.`,
      )
    }
    return parts.length > 0 ? parts.join(" ") : null
  })()

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Collateral Landscape
        </h1>
        <p className="text-xs text-text-muted">
          What&apos;s being deposited and borrowed across Aave V3, Spark, Morpho, and Fluid,
          and what risk it creates.
        </p>
      </div>

      {composedInsight && (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {composedInsight}
        </p>
      )}

      {/* Collateral type breakdown — Section 7.3 of The Lending Pulse */}
      <CollateralTypeChart
        title="Total Collateral by Asset Type"
        data={data.collateralByTypeSeries}
        methodologyKey="collateral-by-asset-type"
      />

      {/* Per-asset composition over time — Section 7.2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AssetStackChart
          title="Collateral Composition by Asset"
          data={data.supplyByAssetSeries}
          topAssets={data.topAssets}
          methodologyKey="collateral-composition-by-asset"
        />
        <AssetStackChart
          title="Borrowed Composition by Asset"
          data={data.borrowedByAssetSeries}
          topAssets={data.topAssets}
          methodologyKey="borrowed-composition-by-asset"
        />
      </div>

      {/* The "Utilization by Asset" chart formerly lived here. It's a
          rate-related metric and now lives on /rates underneath the
          Rate Dispersion chart. */}

      {/* Top rankings — Sections 7.1 + 3.4. By-protocol breakdown
          bars upgrade these tables from one-row-per-asset to a
          legible cross-protocol allocation snapshot. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopAssetsTable
          title="Top Collateral Assets"
          rows={data.topCollateralAssets}
          valueLabel="Supplied"
        />
        <TopAssetsTable
          title="Top Borrowed Assets"
          rows={data.topBorrowedAssets}
          valueLabel="Borrowed"
        />
      </div>

      <CiteThisPage
        pageTitle="Collateral Landscape"
        pageUrl="https://lending-intelligence-terminal.vercel.app/collateral"
      />
      <AsOfFooter
        timestamp={Math.floor(Date.now() / 1000)}
        source="DefiLlama /protocol/<slug> · live load"
      />
    </div>
  )
}

function formatCompactUsd(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "$0"
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
