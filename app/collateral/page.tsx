import { loadOverview } from "@/lib/overview"
import { TopAssetsTable } from "@/components/overview/top-assets-table"
import { AssetStackChart } from "@/components/overview/asset-stack-chart"
import { CollateralTypeChart } from "@/components/overview/collateral-type-chart"
import { UtilizationByAssetChart } from "@/components/overview/utilization-by-asset-chart"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function CollateralPage() {
  const data = await loadOverview()

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Collateral Landscape
        </h1>
        <p className="text-xs text-text-muted">
          What&apos;s being deposited and borrowed across Aave V3, Spark, Morpho, and Fluid,
          and what risk it creates. Per-asset oracle config and peg stability arrive in Phase 2.
        </p>
      </div>

      {/* Collateral type breakdown — Section 7.3 of The Lending Pulse */}
      <CollateralTypeChart
        title="Total Collateral by Asset Type"
        data={data.collateralByTypeSeries}
      />

      {/* Per-asset composition over time — Section 7.2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AssetStackChart
          title="Collateral Composition by Asset"
          data={data.supplyByAssetSeries}
          topAssets={data.topAssets}
        />
        <AssetStackChart
          title="Borrowed Composition by Asset"
          data={data.borrowedByAssetSeries}
          topAssets={data.topAssets}
        />
      </div>

      {/* Per-asset utilization — Section 3.3 */}
      <UtilizationByAssetChart
        title="Utilization by Asset"
        data={data.utilizationByAssetSeries}
        topAssets={data.topAssets}
      />

      {/* Top rankings — Sections 7.1 + 3.4 */}
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
    </div>
  )
}
