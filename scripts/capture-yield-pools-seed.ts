/**
 * Capture the DefiLlama Yields /pools response, filtered to pools the
 * dashboard actually uses, and write to content/snapshots/yield-pools-
 * seed.json. The /rates page uses this as a static fallback when the
 * upstream /pools call is too slow to fit in the 60s page budget.
 *
 *   npx tsx scripts/capture-yield-pools-seed.ts
 *
 * Re-run when:
 *   - DefiLlama Yields adds a major new pool the dashboard cites
 *   - A protocol slug we care about changes
 *   - Roughly weekly to keep typical-day data fresh
 *
 * The seed file ships with the deploy and survives cold-start
 * fragmentation (Vercel serverless rotates instances, in-memory caches
 * don't persist across them). On hobby tier where maxDuration caps at
 * 60s, this is the only way /rates can render data through a slow
 * DefiLlama day.
 */
import * as dotenv from "dotenv"
dotenv.config()
import { mkdirSync, writeFileSync, statSync } from "fs"
import { dirname, join } from "path"

const URL = "https://yields.llama.fi/pools"
const LEND_BORROW_URL = "https://yields.llama.fi/lendBorrow"
const OUTPUT_PATH = "content/snapshots/yield-pools-seed.json"

// Projects the dashboard reads. Aligned with PROTOCOLS in lib/protocols.ts
// plus the Fluid sub-slugs (lib/fluid-stats.ts aggregates these four).
const RELEVANT_PROJECTS = new Set([
  "aave-v3",
  "spark",
  "morpho-blue",
  "fluid-lending",
  "fluid-dex",
  "fluid-lite",
  "fluid",
  "compound-v3",
  "euler-v2",
])

// Same shaping logic as lib/defillama.ts so the seed can be served
// directly without a re-shape step on read.
function shapeAndFilter(rawPools: any[], lendBorrow: any[]) {
  const lbByPool = new Map(lendBorrow.map((r: any) => [r.pool, r]))
  return rawPools
    .filter((p) => p.chain === "Ethereum" && RELEVANT_PROJECTS.has(p.project))
    .map((p) => {
      const lb = lbByPool.get(p.pool)
      const supplyUsd = p.totalSupplyUsd ?? lb?.totalSupplyUsd ?? null
      const borrowUsd = p.totalBorrowUsd ?? lb?.totalBorrowUsd ?? null
      const rawTvlUsd = p.tvlUsd
      const tvlUsd =
        supplyUsd != null &&
        borrowUsd != null &&
        borrowUsd > 0 &&
        Math.abs(supplyUsd - rawTvlUsd) <= Math.max(1, rawTvlUsd * 0.001)
          ? Math.max(0, supplyUsd - borrowUsd)
          : rawTvlUsd
      return {
        pool: p.pool,
        chain: p.chain,
        project: p.project,
        symbol: (p.symbol || "").toUpperCase(),
        tvlUsd,
        apy: p.apy,
        apyBase: p.apyBase,
        apyReward: p.apyReward,
        apyBaseBorrow: p.apyBaseBorrow ?? lb?.apyBaseBorrow ?? null,
        apyRewardBorrow: p.apyRewardBorrow ?? lb?.apyRewardBorrow ?? null,
        apyMean30d: p.apyMean30d ?? null,
        apyBaseInception: p.apyBaseInception ?? null,
        poolMeta: p.poolMeta ?? null,
        underlyingTokens: p.underlyingTokens ?? null,
        rewardTokens: p.rewardTokens ?? null,
        utilization:
          supplyUsd != null && borrowUsd != null && supplyUsd > 0
            ? (borrowUsd / supplyUsd) * 100
            : null,
        totalSupplyUsd: supplyUsd,
        totalBorrowUsd: borrowUsd,
        ltv: lb?.ltv ?? null,
        borrowable: lb?.borrowable ?? false,
      }
    })
}

async function main() {
  console.log("[seed] fetching /pools…")
  const t0 = Date.now()
  const [poolsRes, lbRes] = await Promise.all([
    fetch(URL),
    fetch(LEND_BORROW_URL),
  ])
  if (!poolsRes.ok) throw new Error(`/pools returned ${poolsRes.status}`)

  const poolsBody = await poolsRes.json()
  const lbBody = lbRes.ok ? await lbRes.json() : []
  const rawPools = poolsBody?.data ?? []
  const lendBorrow = Array.isArray(lbBody) ? lbBody : []
  console.log(
    `[seed] /pools=${rawPools.length} rows, /lendBorrow=${lendBorrow.length} rows (${((Date.now() - t0) / 1000).toFixed(1)}s)`
  )

  const filtered = shapeAndFilter(rawPools, lendBorrow)
  console.log(`[seed] filtered to ${filtered.length} relevant pools`)

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        source: URL,
        relevant_projects: Array.from(RELEVANT_PROJECTS),
        count: filtered.length,
        pools: filtered,
      },
      null,
      2
    )
  )
  const sizeKB = (statSync(outPath).size / 1024).toFixed(1)
  console.log(`[seed] wrote ${OUTPUT_PATH} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error("[seed] failed:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
