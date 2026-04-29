/**
 * Rate Monitor — Section 4 of The Lending Pulse.
 *
 * Architecture (post-refactor, no longer depends on the `snapshot:rates` cron):
 *
 *  - **Live matrix** — DefiLlama Yields gives us a pool-by-protocol baseline.
 *    For Aave V3 + SparkLend reserves we overlay the live on-chain rates from
 *    `UiPoolDataProviderV3` (more accurate than DefiLlama's cached snapshot).
 *    Fluid + Morpho cells use DefiLlama as-is for now.
 *
 *  - **Supply APY history** — DefiLlama's free `/chart/{poolId}` endpoint
 *    gives ~3y of daily samples per pool. Used unchanged.
 *
 *  - **Borrow APY history** — no free public source for Aave V3 / SparkLend
 *    / Fluid (DefiLlama doesn't expose it; the protocol subgraphs are paid
 *    on the free Graph tier). Charted only for Morpho (their public API has
 *    full daily history). The Aave/Spark/Fluid borrow charts are omitted
 *    rather than fake.
 *
 *  - **Fed Funds Rate overlay** — FRED public CSV (DFF series).
 *
 * The legacy `rate_snapshots` Neon table + `snapshot:rates` cron are no
 * longer queried by this file. They're kept in the codebase for potential
 * future backfilling work but are otherwise inert.
 */
import { PROTOCOLS } from "./protocols"
import {
  fetchAllYieldPools,
  fetchYieldChart,
  type YieldPool,
  type YieldChartPoint,
} from "./defillama"
import { fetchFedFundsRate, type FredPoint } from "./fred"
import { loadAllAaveReservesLive } from "./aave-onchain"
import { loadAllSparkReservesLive } from "./spark-onchain"

/** Assets we track across protocols. Extend as we add more markets. */
export const MAJOR_ASSETS = [
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "GHO",
  "WETH",
  "WSTETH",
  "WEETH",
  "WBTC",
  "CBBTC",
] as const
export type MajorAsset = (typeof MAJOR_ASSETS)[number]

/** Map our protocol slug → DefiLlama's Yields `project` field. */
export const YIELDS_PROJECT_BY_PROTOCOL: Record<string, string[]> = {
  "aave-v3": ["aave-v3"],
  spark: ["spark", "sparklend"],
  "morpho-blue": ["morpho-blue"],
  // Fluid uses "fluid-lending" on the Yields API, but they've renamed in
  // the past — accept both just in case.
  fluid: ["fluid-lending", "fluid"],
}

function protocolSlugForProject(project: string): string | undefined {
  for (const [slug, projects] of Object.entries(YIELDS_PROJECT_BY_PROTOCOL)) {
    if (projects.includes(project)) return slug
  }
  return undefined
}

export interface RateMatrixCell {
  protocolSlug: string
  symbol: string
  supplyApy: number | null
  /** Trailing 30-day mean of supply APY (DefiLlama `apyMean30d`). */
  supplyApy30d: number | null
  borrowApy: number | null
  /** Trailing 30-day mean of borrow APY. Null until we have a free history
   *  source per protocol — currently only Morpho exposes this directly. */
  borrowApy30d: number | null
  /** Token-incentive APY layered on top of base supply rate. From DefiLlama
   *  `apyReward`; null when no rewards program is active. */
  supplyApyReward: number | null
  /** Token-incentive APY layered on top of base borrow rate (negative cost
   *  to borrowers). From DefiLlama `apyRewardBorrow`; null when no rewards. */
  borrowApyReward: number | null
  /** Effective supply APY = base + rewards; null if base is null. */
  supplyApyEffective: number | null
  /** Effective borrow APY = base − rewards (rewards offset cost). Null if base is null. */
  borrowApyEffective: number | null
  /** borrow − supply, null if either side is missing */
  spread: number | null
  utilization: number | null
  totalSupplyUsd: number | null
  totalBorrowUsd: number | null
  /** DefiLlama pool UUID (used to fetch supply APY history). */
  poolId: string
  /** Where the live values came from — for the page's provenance hint. */
  liveSource: "on-chain" | "defillama"
}

export interface RateHistoryPoint {
  timestamp: number
  [protocolSlug: string]: number
}

export interface RatesResponse {
  /** Current snapshot per (protocol, asset). Multiple cells possible if a
   *  protocol has more than one pool for the same symbol — in that case we
   *  surface the pool with the largest TVL. */
  matrix: RateMatrixCell[]
  /** Supply APY history per asset, keyed by protocol. */
  supplyHistoryByAsset: Record<string, RateHistoryPoint[]>
  /** Fed Funds Rate series aligned against the chart range (1-year window). */
  fedFundsHistory: FredPoint[]
  fetchedAt: number
}

/**
 * Pick the most-representative pool per (protocol, symbol) pair.
 * For pool-based protocols (Aave, Spark) there's one reserve per asset, so
 * this is trivial. Morpho is excluded because its many isolated markets per
 * loan asset don't fit a single-rate-per-asset view (use the per-market
 * detail page instead).
 */
function pickRepresentativePools(pools: YieldPool[]): RateMatrixCell[] {
  const best = new Map<string, YieldPool>() // key = `${slug}:${symbol}`
  for (const p of pools) {
    if (p.chain !== "Ethereum") continue
    const slug = protocolSlugForProject(p.project)
    if (!slug) continue
    // Morpho's per-vault symbols don't match MAJOR_ASSETS so it falls out
    // here naturally. Document explicitly for clarity.
    if (slug === "morpho-blue") continue
    if (!MAJOR_ASSETS.includes(p.symbol as MajorAsset)) continue
    const key = `${slug}:${p.symbol}`
    const existing = best.get(key)
    if (!existing || (p.totalSupplyUsd ?? p.tvlUsd ?? 0) > (existing.totalSupplyUsd ?? existing.tvlUsd ?? 0)) {
      best.set(key, p)
    }
  }
  return [...best.entries()].map(([key, p]) => {
    const [protocolSlug, symbol] = key.split(":")
    const supply = p.apyBase ?? null
    const borrow = p.apyBaseBorrow ?? null
    const supplyReward = p.apyReward ?? null
    const borrowReward = p.apyRewardBorrow ?? null
    const supplyEff =
      supply != null ? supply + (supplyReward ?? 0) : null
    // Borrow rewards are paid TO borrowers, so they reduce the effective cost.
    const borrowEff =
      borrow != null ? borrow - (borrowReward ?? 0) : null
    return {
      protocolSlug,
      symbol,
      supplyApy: supply,
      supplyApy30d: p.apyMean30d ?? null,
      borrowApy: borrow,
      borrowApy30d: null,
      supplyApyReward: supplyReward,
      borrowApyReward: borrowReward,
      supplyApyEffective: supplyEff,
      borrowApyEffective: borrowEff,
      spread: supply != null && borrow != null ? borrow - supply : null,
      utilization: p.utilization,
      totalSupplyUsd: p.totalSupplyUsd,
      totalBorrowUsd: p.totalBorrowUsd,
      poolId: p.pool,
      liveSource: "defillama",
    }
  })
}

/**
 * Overlay the live on-chain rates onto each Aave V3 / SparkLend matrix cell.
 * On-chain values are authoritative — DefiLlama caches per-pool data on a
 * delay, so the supply/borrow APY can lag by minutes during volatile periods.
 *
 * Failures here are non-fatal: we just leave the DefiLlama-supplied values in
 * place and the cell's `liveSource` stays `"defillama"`.
 */
async function overlayOnChainRates(matrix: RateMatrixCell[]): Promise<void> {
  // Two parallel fetches; either can fail without taking down the page.
  const [aave, spark] = await Promise.all([
    loadAllAaveReservesLive().catch((e) => {
      console.error("[rates] aave on-chain load failed:", e?.message ?? e)
      return null
    }),
    loadAllSparkReservesLive().catch((e) => {
      console.error("[rates] spark on-chain load failed:", e?.message ?? e)
      return null
    }),
  ])

  const overlay = (cell: RateMatrixCell, reserves: typeof aave) => {
    if (!reserves) return
    const r = reserves.find((x) => x.symbol.toUpperCase() === cell.symbol.toUpperCase())
    if (!r) return
    cell.supplyApy = r.supplyApy
    cell.borrowApy = r.borrowApy
    cell.utilization = r.utilization * 100
    cell.totalSupplyUsd = r.totalSupplyUsd
    cell.totalBorrowUsd = r.totalBorrowUsd
    cell.spread = r.borrowApy - r.supplyApy
    // Re-derive effective APY against the freshened on-chain base. Rewards
    // come from DefiLlama (they're a separate incentives layer that's not in
    // UiPoolDataProviderV3), so keep the existing reward fields and just
    // re-add them to the live base.
    cell.supplyApyEffective = r.supplyApy + (cell.supplyApyReward ?? 0)
    cell.borrowApyEffective = r.borrowApy - (cell.borrowApyReward ?? 0)
    cell.liveSource = "on-chain"
  }

  for (const cell of matrix) {
    if (cell.protocolSlug === "aave-v3") overlay(cell, aave)
    else if (cell.protocolSlug === "spark") overlay(cell, spark)
  }
}

/** Merge per-protocol chart histories for one asset into a single protocol-keyed series. */
function buildHistoryForAsset(
  perProtocolHistory: Map<string, YieldChartPoint[]>,
): RateHistoryPoint[] {
  const byTs = new Map<number, RateHistoryPoint>()
  for (const [slug, points] of perProtocolHistory.entries()) {
    for (const pt of points) {
      if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue
      const existing = byTs.get(pt.timestamp) ?? { timestamp: pt.timestamp }
      existing[slug] = pt.apyBase
      byTs.set(pt.timestamp, existing)
    }
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/** Assets to chart historical supply APY for. Limited to keep DefiLlama call
 *  volume manageable (4 protocols × N assets per call). */
const CHART_ASSETS = ["USDC", "USDT", "WETH", "WSTETH", "WBTC"] as const

export async function loadRates(): Promise<RatesResponse> {
  const pools = await fetchAllYieldPools()
  const matrix = pickRepresentativePools(pools).sort((a, b) => {
    const ai = MAJOR_ASSETS.indexOf(a.symbol as MajorAsset)
    const bi = MAJOR_ASSETS.indexOf(b.symbol as MajorAsset)
    if (ai !== bi) return ai - bi
    const aj = PROTOCOLS.findIndex((p) => p.slug === a.protocolSlug)
    const bj = PROTOCOLS.findIndex((p) => p.slug === b.protocolSlug)
    return aj - bj
  })

  // Three parallel jobs: on-chain overlay, supply-history charts, FRED.
  const supplyHistoryByAsset: Record<string, RateHistoryPoint[]> = {}
  const supplyHistoryJob = Promise.all(
    CHART_ASSETS.map(async (symbol) => {
      const cells = matrix.filter((c) => c.symbol === symbol)
      const perProtocol = new Map<string, YieldChartPoint[]>()
      await Promise.all(
        cells.map(async (c) => {
          try {
            const hist = await fetchYieldChart(c.poolId)
            perProtocol.set(c.protocolSlug, hist)
          } catch (err: any) {
            console.error(`[rates] chart ${c.protocolSlug}/${symbol} failed:`, err.message)
          }
        }),
      )
      supplyHistoryByAsset[symbol] = buildHistoryForAsset(perProtocol)
    }),
  )

  const [, fedFundsHistory] = await Promise.all([
    Promise.all([overlayOnChainRates(matrix), supplyHistoryJob]),
    fetchFedFundsRate(400).catch((err) => {
      console.error("[rates] FRED fetch failed:", err.message)
      return [] as FredPoint[]
    }),
  ])

  return {
    matrix,
    supplyHistoryByAsset,
    fedFundsHistory,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
