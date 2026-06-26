/**
 * Capture the TVL-weighted blended stablecoin supply APY series — the
 * DeFi leg of Real Yield Spread. Used as a static seed when the runtime
 * computation (24 parallel DefiLlama /chart fetches) fails or times out
 * on a cold Vercel instance.
 *
 *   npx tsx scripts/capture-blended-stable-seed.ts
 *
 * Re-run weekly. The series moves slowly — pools' tvl-weighted blended
 * APY shifts by single basis points day-over-day — so a week-old seed
 * still serves a credible Real Yield Spread chart.
 *
 * Why seed at all: buildBlendedStableApyHistory makes ~24 parallel
 * /chart calls (4 stables × 6 protocols). On a cold Vercel instance
 * under DefiLlama rate-limit those calls hang and the runtime is
 * bounded out at 15s, returning empty. Empty DeFi leg → null spreads
 * → blank verdict-strip card. The seed prevents that.
 */
import {
  pickRepresentativePools,
  pickMorphoBlendedCells,
  buildBlendedStableApyHistory,
  type RateMatrixCell,
} from "../lib/rates"
import { fetchAllYieldPools, fetchYieldChart, type YieldChartPoint } from "../lib/defillama"
import { mkdirSync, writeFileSync, statSync } from "fs"
import { dirname, join } from "path"

const OUTPUT_PATH = "content/snapshots/blended-stable-apy-seed.json"

async function main() {
  console.log("[blended-seed] loading pools…")
  const t0 = Date.now()
  const pools = await fetchAllYieldPools()
  console.log(`[blended-seed]   ${pools.length} pools`)

  console.log("[blended-seed] building matrix…")
  const protocolPicks = pickRepresentativePools(pools)
  const morphoBlends = pickMorphoBlendedCells(pools)
  const matrix: RateMatrixCell[] = [...protocolPicks, ...morphoBlends]
  console.log(`[blended-seed]   ${matrix.length} cells`)

  console.log("[blended-seed] fetching Morpho stable charts…")
  // Mirror the runtime's morphoChartIndex: per-symbol Morpho chart used
  // both for the matrix's per-asset history and as a fold-in for the
  // blended-stable aggregation.
  const morphoChartIndex = new Map<string, YieldChartPoint[]>()
  const morphoStableCells = matrix.filter(
    (c) =>
      c.protocolSlug === "morpho-blue" &&
      ["USDC", "USDT", "DAI", "USDS"].includes(c.symbol),
  )
  for (const c of morphoStableCells) {
    try {
      const hist = await fetchYieldChart(c.poolId)
      morphoChartIndex.set(c.symbol, hist)
      console.log(`[blended-seed]   morpho-blue/${c.symbol}: ${hist.length} points`)
    } catch (err: any) {
      console.error(`[blended-seed]   morpho-blue/${c.symbol} failed:`, err?.message ?? err)
    }
  }

  console.log("[blended-seed] computing TVL-weighted blended series…")
  const series = await buildBlendedStableApyHistory(matrix, morphoChartIndex)
  console.log(`[blended-seed]   ${series.length} daily points`)
  console.log(`[blended-seed] total fetch ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        count: series.length,
        series,
      },
      null,
      2,
    ),
  )
  const sizeKB = (statSync(outPath).size / 1024).toFixed(1)
  console.log(`[blended-seed] wrote ${OUTPUT_PATH} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error("[blended-seed] failed:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
