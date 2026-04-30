import { loadRates } from "@/lib/rates"
import { computeRateKpis } from "@/lib/rates-kpi"
import { RateMatrixTable } from "@/components/overview/rate-matrix-table"
import { RatesKpiCards } from "@/components/overview/rates-kpi-cards"
import { RateHistorySelector } from "@/components/overview/rate-history-selector"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Assets that get historical charts. Limited to keep the page fast. */
const CHART_ASSETS = ["USDC", "USDT", "WETH", "WSTETH", "WBTC"]

export default async function RatesPage() {
  const data = await loadRates()
  const kpis = computeRateKpis(data.matrix)
  const onChainCells = data.matrix.filter((c) => c.liveSource === "on-chain").length

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1 flex items-center gap-1.5">
            Rate Monitor
            <MethodologyTooltip
              text={
                `Live supply and borrow APYs across Aave V3, SparkLend, Morpho, and Fluid on Ethereum mainnet. ` +
                `Aave V3 + SparkLend cells come from on-chain reads via UiPoolDataProviderV3 (${onChainCells} live cells); ` +
                `Morpho and Fluid cells use DefiLlama Yields. The 30d average is DefiLlama's apyMean30d. ` +
                `Spread = borrow − supply. Reward APY (where applicable) appears below the base in accent color.`
              }
              source="On-chain UiPoolDataProviderV3 + DefiLlama Yields + FRED DFF"
            />
          </h1>
          <p className="text-xs text-text-muted leading-relaxed">
            Live supply and borrow APYs across the four protocols, plus three-year supply APY history with Fed Funds overlay.
          </p>
        </div>
      </div>

      {/* Verdict band — best supply / best borrow / tightest spread. */}
      <RatesKpiCards kpis={kpis} />

      {/* Full matrix — all 10 assets × 4 protocols. */}
      <RateMatrixTable title="Supply &amp; Borrow APY Matrix" cells={data.matrix} />

      {/* Asset-selector + single chart, replacing the previous five-stacked layout. */}
      <RateHistorySelector
        assets={CHART_ASSETS}
        historyByAsset={data.supplyHistoryByAsset}
        fedFunds={data.fedFundsHistory}
      />
    </div>
  )
}
