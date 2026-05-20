import { loadOverview } from "@/lib/overview"
import { TopAssetsTable } from "@/components/overview/top-assets-table"
import { AssetStackChart } from "@/components/overview/asset-stack-chart"
import { CollateralTypeChart } from "@/components/overview/collateral-type-chart"
import { CiteThisPage } from "@/components/overview/cite-this-page"
import { AsOfFooter } from "@/components/overview/as-of-footer"

// ISR — 30 min cache. Composition mix changes slowly; longer
// revalidation window is fine and makes navigation instant.
export const revalidate = 1800
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
          What&apos;s being deposited and borrowed across the tracked Ethereum
          lending protocols, and what risk it creates.
        </p>
      </div>

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
