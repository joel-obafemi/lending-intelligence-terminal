import { loadRates } from "@/lib/rates"
import { loadOverview } from "@/lib/overview"
import { withTimeout, DEFAULT_LOAD_BUDGET_MS } from "@/lib/with-timeout"
import { computeRateKpis } from "@/lib/rates-kpi"
import { RateMatrixTable } from "@/components/overview/rate-matrix-table"
import { RatesKpiCards } from "@/components/overview/rates-kpi-cards"
import { RateHistorySelector } from "@/components/overview/rate-history-selector"
import { RateDispersionChart } from "@/components/overview/rate-dispersion-chart"
import { RealYieldSpreadChart } from "@/components/overview/real-yield-spread-chart"
import { UtilizationByAssetChart } from "@/components/overview/utilization-by-asset-chart"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { AsOfFooter } from "@/components/overview/as-of-footer"
import { CiteThisPage } from "@/components/overview/cite-this-page"

// ISR — 30 min cache. /rates is the heaviest page (DefiLlama Yields
// charts × multiple pools, FRED, blended-stable APY series). Caching
// is the biggest win here. Rates change slowly enough that 30 min
// staleness is acceptable.
// Heaviest page: DefiLlama Yields + per-pool charts + on-chain Aave/Spark
// overlay + FRED, all via cache: 'no-store'. Dynamic regardless of
// revalidate (always a cache MISS). force-dynamic stops the build-time
// prerender that times out when the public RPC rate-limits.
export const dynamic = "force-dynamic"
// Vercel Hobby tier caps maxDuration at 60s. /pools resilience comes
// from the seed-fallback layered into lib/defillama.ts so the page
// can render data even when the upstream /pools chain doesn't fit
// in the 60s budget.
export const maxDuration = 60

/** Assets that get historical charts. Limited to keep the page fast.
 *  Same set used for the dispersion chart's selector. */
const CHART_ASSETS = ["USDC", "USDT", "DAI", "USDS", "WETH", "WSTETH", "WBTC"]

// Custom budget for loadRates — owns the slowest call chain in the
// dashboard. Capped at 50s to stay safely under the 60s page
// maxDuration. The seed-fallback in lib/defillama.ts means /pools
// returning slowly doesn't kill the load — it bails out at 25s
// (its own internal budget) and the page receives seeded data
// instead, so the page always renders within budget.
const LOAD_RATES_BUDGET_MS = 50_000

export default async function RatesPage() {
  // Both fetches wrapped in a timeout race so a hanging upstream
  // (DefiLlama Yields, FRED, on-chain RPC) can't blow past the
  // page's maxDuration. The fallback notice below renders instead.
  const [data, overview] = await Promise.all([
    withTimeout("rates.loadRates", loadRates(), LOAD_RATES_BUDGET_MS),
    withTimeout("rates.loadOverview", loadOverview(), DEFAULT_LOAD_BUDGET_MS),
  ])

  if (!data || !overview) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted">
          Rate Monitor
        </h1>
        <div className="tui-card bg-card-bg border border-card-border rounded p-6 text-sm text-text-muted">
          Couldn&apos;t load rate data. DefiLlama Yields or the on-chain RPC may be slow, reload in a moment.
        </div>
      </div>
    )
  }

  const kpis = computeRateKpis(data.matrix)
  const onChainCells = data.matrix.filter((c) => c.liveSource === "on-chain").length

  // Sparkline series for the verdict-strip cards. Real Yield Spread —
  // last 30 days from the 18-month history. Stablecoin dispersion —
  // last 30 days of the USDC dispersion series (the canonical stable).
  const ryHistory = data.realYieldSpreadHistory
  const last30RY =
    ryHistory.length > 0
      ? ryHistory.slice(-30).map((p) => ({
          timestamp: p.timestamp,
          value: p.spreadPct ?? 0,
        }))
      : []
  const dispersionUsdc = data.dispersionByAsset["USDC"] ?? []
  const last30Disp = dispersionUsdc.slice(-30)

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1 flex items-center gap-1.5">
            Rate Monitor
            <MethodologyTooltip
              text={
                `Live supply and borrow APYs across the tracked Ethereum lending protocols. ` +
                `Aave V3 + SparkLend cells come from on-chain reads via UiPoolDataProviderV3 (${onChainCells} live cells); ` +
                `Morpho cells are TVL-weighted blends across MetaMorpho vaults; Fluid, Compound V3, and Euler V2 cells use DefiLlama Yields. ` +
                `Real Yield Spread = blended stablecoin lending APY − 4-week T-bill (FRED TB4WK). ` +
                `Spread = borrow − supply. Reward APY (where applicable) appears below the base in accent color; toggle Reward-adjusted on the matrix to re-rank by net effective rate.`
              }
              source="On-chain UiPoolDataProviderV3 + DefiLlama Yields + DefiLlama Coins + FRED DFF/TB4WK"
            />
          </h1>
          <p className="text-xs text-text-muted leading-relaxed">
            Sector-wide rate state across every supported asset, plus the
            macro overlay (4-week T-bill, Fed Funds Rate). The single page
            for &ldquo;where are rates right now, and how do DeFi rates
            compare to TradFi?&rdquo;
          </p>
        </div>
      </div>

      {/* Verdict strip — 4 cards (best supply / best borrow / real yield
          spread / stablecoin dispersion). */}
      <RatesKpiCards
        kpis={kpis}
        realYieldSpreadPct={data.realYieldSpreadCurrent.spreadPct}
        realYieldSpreadSparkline={last30RY}
        stableDispersionSparkline={last30Disp}
      />


      {/* Hero: Real Yield Spread, 18 months. The page's flagship.
          Default range = M (30 days) for consistency with every other
          chart on the dashboard; readers can step out to Q if they
          want the longer-window smoothing. */}
      <RealYieldSpreadChart
        title="Real Yield Spread · 18 months"
        data={data.realYieldSpreadHistory}
        defaultRange={30}
        methodologyKey="rates-real-yield-spread-hero"
      />

      {/* Rate Matrix — grouped by asset family, with reward-adjusted toggle. */}
      <RateMatrixTable
        title="Supply &amp; Borrow APY Matrix"
        cells={data.matrix}
      />

      {/* Cross-protocol rate dispersion — the signature long-term metric
          for the page. */}
      <RateDispersionChart
        assets={CHART_ASSETS}
        dispersionByAsset={data.dispersionByAsset}
      />

      {/* Utilization by Asset — relocated from /collateral. It's a
          rate-related metric and reads more naturally next to the
          dispersion chart than alongside the collateral composition
          tables. */}
      <UtilizationByAssetChart
        title="Utilization by Asset"
        data={overview.utilizationByAssetSeries}
        topAssets={overview.topAssets}
        methodologyKey="utilization-by-asset"
      />

      {/* Per-asset supply APY history with Fed Funds overlay. */}
      <RateHistorySelector
        assets={CHART_ASSETS}
        historyByAsset={data.supplyHistoryByAsset}
        fedFunds={data.fedFundsHistory}
      />

      <CiteThisPage
        pageTitle="Rate Monitor · DeFi vs T-bill"
        pageUrl="https://lending-intelligence-terminal.vercel.app/rates"
      />
      <AsOfFooter
        timestamp={data.fetchedAt}
        source="DefiLlama Yields + on-chain UiPoolDataProviderV3 + FRED · live load"
      />
    </div>
  )
}
