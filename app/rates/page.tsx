import { loadRates } from "@/lib/rates"
import { RateMatrixTable } from "@/components/overview/rate-matrix-table"
import { RateHistoryChart } from "@/components/overview/rate-history-chart"

export const dynamic = "force-dynamic"
// Heavy first render: DefiLlama Yields + per-asset chart history + on-chain
// reserve overlays for Aave V3 + SparkLend + FRED Fed Funds fetch.
export const maxDuration = 60

/** Assets that get historical charts. Rest show current-only in the matrix. */
const CHART_ASSETS = ["USDC", "USDT", "WETH", "WSTETH", "WBTC"]

export default async function RatesPage() {
  const data = await loadRates()
  // Count of cells now sourced from on-chain (vs. DefiLlama fallback) — used
  // in the page subtitle so readers know how fresh the matrix really is.
  const onChainCells = data.matrix.filter((c) => c.liveSource === "on-chain").length

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Rate Monitor
        </h1>
        <p className="text-xs text-text-muted leading-relaxed">
          Live supply and borrow APYs across Aave V3, SparkLend, Morpho and
          Fluid on Ethereum. Aave V3 + SparkLend rates come from
          on-chain reads via <code className="px-1" style={{ background: "var(--card-hover)" }}>UiPoolDataProviderV3</code>{" "}
          ({onChainCells} live cells); other cells fall back to DefiLlama&apos;s
          Yields snapshot. Supply APY history is DefiLlama&apos;s 3-year{" "}
          <code className="px-1" style={{ background: "var(--card-hover)" }}>/chart</code> series.
          Fed Funds Rate overlay from FRED (DFF series).
        </p>
      </div>

      <RateMatrixTable title="Supply &amp; Borrow APY Matrix" cells={data.matrix} />

      {/* Supply APY — DefiLlama's 3-year history per pool */}
      <h2 className="text-[11px] uppercase tracking-[0.15em] text-text-muted pt-2">
        Supply APY · DefiLlama /chart
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CHART_ASSETS.map((sym) => {
          const series = data.supplyHistoryByAsset[sym] ?? []
          if (series.length === 0) return null
          return (
            <RateHistoryChart
              key={`supply-${sym}`}
              title={`${sym} · Supply APY vs Fed Funds`}
              data={series}
              fedFunds={data.fedFundsHistory}
            />
          )
        })}
      </div>

      {/* Methodology footer — explains the borrow-history gap honestly. */}
      <div
        className="text-[11px] text-text-muted border border-card-border rounded px-3 py-2 leading-relaxed"
        style={{ background: "var(--card-bg)" }}
      >
        <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
          Methodology note:
        </span>{" "}
        Borrow APY history charts are not shown on this page. DefiLlama&apos;s
        free Yields API doesn&apos;t expose historical borrow rates, and the
        Aave / Spark / Fluid subgraphs require a paid The Graph plan to query
        at production frequency. Per-market borrow APY history IS available
        on individual market detail pages — for Morpho, sourced from{" "}
        <code className="px-1" style={{ background: "var(--card-hover)" }}>blue-api.morpho.org</code>{" "}
        with full daily resolution; for Aave V3 and SparkLend, recent samples
        come from our own daily snapshot (10 major assets only).
      </div>
    </div>
  )
}
