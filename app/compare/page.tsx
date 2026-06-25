/**
 * Compare page — Pass A.
 *
 * Cross-protocol lookup tool. Tied entirely to the URL: `?asset=USDC&view=yields`
 * is the canonical state, and the QuickCompareBar's "Copy link" button is
 * what makes the page cite-able.
 *
 * Renders all four zones server-side based on `searchParams`. Switching
 * asset or view triggers a server re-render via `router.replace()` —
 * `force-dynamic` keeps the data fresh on every navigation.
 */

import { loadCompareForAsset, loadCompareHistory, COMPARE_ASSETS, type CompareView } from "@/lib/compare"
import { withTimeout, DEFAULT_LOAD_BUDGET_MS } from "@/lib/with-timeout"
import { QuickCompareBar } from "@/components/compare/quick-compare-bar"
import { YieldComparator } from "@/components/compare/yield-comparator"
import { BestVenueHistory } from "@/components/compare/best-venue-history"
import { ParameterComparator } from "@/components/compare/parameter-comparator"
import { CapitalEfficiencyComparator } from "@/components/compare/capital-efficiency-comparator"
import { CiteThisPage } from "@/components/overview/cite-this-page"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface SearchParams {
  asset?: string
  view?: string
}

const VALID_VIEWS = new Set<CompareView>(["yields", "parameters", "efficiency"])

function normalizeAsset(raw: string | undefined): string {
  const upper = (raw ?? "USDC").toUpperCase()
  // Keep only assets that exist in the universe; fall back to USDC otherwise.
  return (COMPARE_ASSETS as readonly string[]).includes(upper) ? upper : "USDC"
}

function normalizeView(raw: string | undefined): CompareView {
  const v = (raw ?? "yields") as CompareView
  return VALID_VIEWS.has(v) ? v : "yields"
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const asset = normalizeAsset(searchParams.asset)
  const view = normalizeView(searchParams.view)

  // Wrapped in a timeout race so a slow DefiLlama (current /pools is
  // 29s vs typical <5s) can't blow past the page's maxDuration.
  const response = await withTimeout(
    `compare.loadCompareForAsset[${asset}]`,
    loadCompareForAsset(asset),
    DEFAULT_LOAD_BUDGET_MS,
  )

  if (!response) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted">
          Cross-Protocol Comparison
        </h1>
        <div className="tui-card bg-card-bg border border-card-border rounded p-6 text-sm text-text-muted">
          Couldn&apos;t load comparison data for {asset}. DefiLlama or the on-chain RPC may be slow, reload in a moment.
        </div>
      </div>
    )
  }

  // History only needed for the Yields view; load it conditionally so the
  // Parameters / Efficiency views skip the FRED + chart fetches.
  // 365d window powers both the per-protocol APY history chart and the
  // cross-protocol dispersion chart at 12-month resolution. History
  // failure falls back to no chart rather than 500ing the page.
  const history =
    view === "yields"
      ? await withTimeout(
          `compare.loadCompareHistory[${asset}]`,
          loadCompareHistory(asset, response.cells, 365),
          DEFAULT_LOAD_BUDGET_MS,
        )
      : null

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Cross-Protocol Compare
        </h1>
        <p className="text-xs text-text-muted">
          Side-by-side lookup across the tracked Ethereum lending protocols
          for the same asset. Pick an asset, pick a view, share the URL.
        </p>
      </div>

      <QuickCompareBar asset={asset} view={view} />

      {view === "yields" && history && (
        <>
          <YieldComparator response={response} history={history} />
          <BestVenueHistory
            symbol={asset}
            supplyHistory={history.supplyHistory}
          />
        </>
      )}
      {view === "parameters" && (
        <ParameterComparator symbol={asset} cells={response.cells} />
      )}
      {view === "efficiency" && (
        <CapitalEfficiencyComparator symbol={asset} cells={response.cells} />
      )}

      <CiteThisPage
        pageTitle={`Cross-Protocol Compare · ${asset}`}
        pageUrl="https://lending-intelligence-terminal.vercel.app/compare"
      />
    </div>
  )
}
