/**
 * Cross-protocol Compare data layer (Pass A).
 *
 * For a chosen asset symbol (USDC / WETH / WSTETH / etc), build a single
 * `CompareCell` per protocol so the Compare page can render all four
 * head-to-head. Sources used in parallel:
 *
 *   - DefiLlama Yields `/pools` — base + reward APY, utilization, TVL,
 *     borrow USD, LTV. Used for every protocol so the headline rate
 *     numbers stay consistent with /rates.
 *   - Aave V3 + Spark `UiPoolDataProviderV3` reads — overlays liq
 *     threshold, liq bonus, reserve factor, supply / borrow caps, debt
 *     ceiling, and oracle address (data DefiLlama doesn't expose).
 *   - Fluid `loadAllFluidVaultsLive` — overlays the same parameter set
 *     for the largest matching loan vault.
 *   - Morpho — kept at the DefiLlama level for v1. Per-vault parameters
 *     are reported as "varies by market" with a vault count, since
 *     Morpho's primitive is one (collateral, loan, LLTV, oracle) per
 *     market and the right rendering is a range, not a single row.
 *
 * Pure-server module — used by `app/compare/page.tsx`. No I/O outside
 * the four fetches above; all of them already have their own caches.
 */
import { PROTOCOLS, type ProtocolConfig } from "./protocols"
import {
  fetchAllYieldPools,
  fetchYieldChart,
  type YieldPool,
  type YieldChartPoint,
} from "./defillama"
import { loadAllAaveReservesLive, type AaveReserveLive } from "./aave-onchain"
import { loadAllSparkReservesLive } from "./spark-onchain"
import { loadAllFluidVaultsLive, type FluidVaultLive } from "./fluid-onchain"
import { fetchFedFundsRate, type FredPoint } from "./fred"
import { YIELDS_PROJECT_BY_PROTOCOL, MAJOR_ASSETS, type MajorAsset } from "./rates"
import { oracleFor, type OracleVendor } from "./oracles"

export type CompareView = "yields" | "parameters" | "efficiency"

export interface CompareCell {
  protocolSlug: string
  protocolName: string
  protocolColor: string
  protocolArchitecture: ProtocolConfig["architecture"]

  /** True when we found a matching market on this protocol for the selected asset. */
  available: boolean
  /** Architecture-specific note rendered below the protocol name in tables.
   *  e.g. "Across 12 vault-allocated markets" for Morpho, "E-Mode eligible"
   *  for Aave when the reserve has E-Mode metadata. */
  note: string | null

  // ─── Yield (Zone 2) ──────────────────────────────────────────────────
  supplyApy: number | null         // base APY %
  borrowApy: number | null
  supplyApyReward: number | null
  borrowApyReward: number | null
  supplyApyEffective: number | null  // base + reward
  borrowApyEffective: number | null  // base − reward
  /** apyMean30d from DefiLlama, when available. */
  supplyApy30d: number | null
  spread: number | null            // borrow − supply, percent points
  utilization: number | null       // 0-100

  // ─── Liquidity (used in Zone 2 + Zone 4) ────────────────────────────
  totalSupplyUsd: number | null
  totalBorrowUsd: number | null
  /** DefiLlama Yields' tvlUsd — unborrowed liquidity. */
  freeLiquidityUsd: number | null

  // ─── Parameters (Zone 3) ────────────────────────────────────────────
  ltv: number | null               // 0-1 fraction
  liquidationThreshold: number | null  // 0-1 (null when unknown — Morpho v1)
  liquidationBonus: number | null  // 0-1 (e.g. 0.05 = +5%)
  reserveFactor: number | null
  supplyCapUsd: number | null      // null = no cap or unknown
  borrowCapUsd: number | null
  debtCeilingUsd: number | null    // 0 = not isolated; null = unknown
  oracleAddress: string | null     // checksum address (Aave / Spark / Fluid)
  oracleVendor: OracleVendor       // pulled from curated map for fallback
  isFrozen: boolean
  isPaused: boolean

  // ─── DefiLlama pool id — used to fetch supply-APY history for Zone 2's chart. ─
  poolId: string | null
}

export interface CompareResponse {
  symbol: string
  cells: CompareCell[]
  /** Aggregate "best" picks for the verdict callouts on Zone 2. */
  best: {
    supplyApySlug: string | null
    borrowApySlug: string | null
    spreadSlug: string | null
  }
  fetchedAt: number
}

/** A single point on the supply-APY history chart — one column per protocol
 *  slug present at that day, plus optional DFF overlay. */
export interface CompareSupplyHistoryPoint {
  timestamp: number
  [protocolSlug: string]: number | null | undefined
}

/** Spread-sub-chart point: dispersion in supply APY across protocols. */
export interface CompareSpreadPoint {
  timestamp: number
  /** Max APY observed across protocols on this day, in percent. */
  maxApy: number
  /** Min APY observed across protocols on this day, in percent. */
  minApy: number
  /** Spread = maxApy − minApy, in percent points. */
  spreadPct: number
}

export interface CompareHistoryResponse {
  symbol: string
  /** One row per day, each protocol's supply APY (DefiLlama base) for that day. */
  supplyHistory: CompareSupplyHistoryPoint[]
  /** Cross-protocol max−min spread series, derived from `supplyHistory`. */
  spreadHistory: CompareSpreadPoint[]
  /** Daily Federal Funds Effective Rate (FRED DFF) for the same window. */
  fedFundsHistory: FredPoint[]
  /** Days with at least 2 protocols having data — the spread series uses this. */
  daysCovered: number
  /** 90d average dispersion for the insight line below the spread chart. */
  spread90dAvgPct: number | null
  /** Most recent dispersion observation (for the insight line). */
  spreadCurrentPct: number | null
}

/** The asset universe surfaced in the Quick Compare bar's selector. */
export const COMPARE_ASSETS: MajorAsset[] = [...MAJOR_ASSETS] as MajorAsset[]

/** Empty cell — protocol is in PROTOCOLS but no matching market exists for
 *  the selected asset. Page renders a "Not listed" card instead of fields. */
function emptyCell(p: ProtocolConfig): CompareCell {
  return {
    protocolSlug: p.slug,
    protocolName: p.name,
    protocolColor: p.color,
    protocolArchitecture: p.architecture,
    available: false,
    note: null,
    supplyApy: null,
    borrowApy: null,
    supplyApyReward: null,
    borrowApyReward: null,
    supplyApyEffective: null,
    borrowApyEffective: null,
    supplyApy30d: null,
    spread: null,
    utilization: null,
    totalSupplyUsd: null,
    totalBorrowUsd: null,
    freeLiquidityUsd: null,
    ltv: null,
    liquidationThreshold: null,
    liquidationBonus: null,
    reserveFactor: null,
    supplyCapUsd: null,
    borrowCapUsd: null,
    debtCeilingUsd: null,
    oracleAddress: null,
    oracleVendor: oracleFor(""),
    isFrozen: false,
    isPaused: false,
    poolId: null,
  }
}

/** Pick the largest yields pool by tvlUsd among those matching a project +
 *  symbol. Returns null when nothing matches. */
function pickLargestPool(
  pools: YieldPool[],
  projectSlugs: readonly string[],
  symbol: string,
): YieldPool | null {
  const candidates = pools.filter(
    (p) =>
      p.chain === "Ethereum" &&
      projectSlugs.includes(p.project) &&
      p.symbol === symbol,
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  )
}

/** Layer DefiLlama Yields fields onto a fresh cell. Used by all four
 *  protocols as the base layer; on-chain overlays go in afterwards. */
function applyYieldsLayer(cell: CompareCell, pool: YieldPool): void {
  cell.available = true
  cell.poolId = pool.pool
  cell.supplyApy = pool.apyBase
  cell.borrowApy = pool.apyBaseBorrow
  cell.supplyApyReward = pool.apyReward
  cell.borrowApyReward = pool.apyRewardBorrow
  cell.supplyApy30d = pool.apyMean30d
  cell.supplyApyEffective =
    pool.apyBase != null ? pool.apyBase + (pool.apyReward ?? 0) : null
  cell.borrowApyEffective =
    pool.apyBaseBorrow != null ? pool.apyBaseBorrow - (pool.apyRewardBorrow ?? 0) : null
  cell.spread =
    pool.apyBase != null && pool.apyBaseBorrow != null
      ? pool.apyBaseBorrow - pool.apyBase
      : null
  // `pool.utilization` from fetchAllYieldPools is already 0-100 (computed
  // as borrowed / supplied × 100 in lib/defillama.ts). The earlier × 100
  // here was a double-multiplication producing 9,221% instead of 92.2%.
  cell.utilization = pool.utilization
  cell.totalSupplyUsd = pool.totalSupplyUsd ?? ((pool.tvlUsd ?? 0) + (pool.totalBorrowUsd ?? 0))
  cell.totalBorrowUsd = pool.totalBorrowUsd
  cell.freeLiquidityUsd = pool.tvlUsd
  if (pool.ltv != null) cell.ltv = pool.ltv
  cell.oracleVendor = oracleFor(pool.symbol, cell.protocolSlug)
}

/** Layer Aave-style on-chain reads — fills the parameter columns the Yields
 *  API doesn't carry. Reserve `ltv` overrides the Yields `ltv` since on-chain
 *  is authoritative. */
function applyAaveStyleLayer(cell: CompareCell, reserve: AaveReserveLive): void {
  cell.ltv = reserve.ltv
  cell.liquidationThreshold = reserve.liquidationThreshold
  cell.liquidationBonus = reserve.liquidationBonus
  cell.reserveFactor = reserve.reserveFactor
  cell.supplyCapUsd = reserve.supplyCapUsd
  cell.borrowCapUsd = reserve.borrowCapUsd
  cell.debtCeilingUsd = reserve.debtCeilingUsd
  cell.oracleAddress = reserve.priceOracle
  cell.isFrozen = reserve.isFrozen
  cell.isPaused = reserve.isPaused
}

/** Pick the largest Fluid vault whose LOAN asset matches the selected
 *  symbol, by total borrow. We resolve the symbol → address through the
 *  matching Aave reserve (Aave covers all of MAJOR_ASSETS on Ethereum),
 *  which avoids hard-coding a separate token registry. */
function pickFluidLoanVault(
  vaults: FluidVaultLive[],
  loanAddress: string | null,
): FluidVaultLive | null {
  if (!loanAddress) return null
  const target = loanAddress.toLowerCase()
  const matches = vaults.filter((v) => v.loanAsset.toLowerCase() === target)
  if (matches.length === 0) return null
  return matches.reduce((best, v) =>
    v.totalBorrowRaw > best.totalBorrowRaw ? v : best,
  )
}

function applyFluidLayer(
  cell: CompareCell,
  vault: FluidVaultLive,
  smartFlag: { col: boolean; debt: boolean },
): void {
  cell.ltv = vault.collateralFactor
  cell.liquidationThreshold = vault.liquidationThreshold
  cell.liquidationBonus = vault.liquidationPenalty
  cell.reserveFactor = vault.borrowFee
  // Caps come back in raw token units. We don't have the loan-asset price
  // here at the right precision, so leave the USD cap null and let the UI
  // render "—" for now. The token cap is preserved on-chain for users who
  // want exact numbers via the per-protocol page.
  cell.supplyCapUsd = null
  cell.borrowCapUsd = null
  cell.debtCeilingUsd = null
  // Fluid doesn't expose the price oracle at the vault layer; rely on the
  // curated map for vendor classification.
  cell.oracleAddress = null
  if (smartFlag.col || smartFlag.debt) {
    const tags: string[] = []
    if (smartFlag.col) tags.push("Smart Collateral")
    if (smartFlag.debt) tags.push("Smart Debt")
    cell.note = tags.join(" + ") + " eligible"
  }
}

/** Count how many morpho-blue vaults+markets surface this symbol on
 *  Yields, so we can render "Across N markets" rather than a single row.
 *  We exclude raw collateral-market rows (apyBase == null). */
function countMorphoMarketsForLoan(pools: YieldPool[], symbol: string): number {
  return pools.filter(
    (p) =>
      p.chain === "Ethereum" &&
      p.project === "morpho-blue" &&
      p.symbol === symbol &&
      p.apyBase != null,
  ).length
}

/**
 * Build one `CompareCell` per protocol for the given symbol. Each protocol
 * starts as an empty cell; we overlay Yields data when a matching pool
 * exists, then overlay protocol-specific on-chain params for Aave V3 +
 * Spark + Fluid.
 */
export async function loadCompareForAsset(symbol: string): Promise<CompareResponse> {
  const upperSymbol = symbol.toUpperCase()

  const [pools, aaveReserves, sparkReserves, fluidVaults] = await Promise.all([
    fetchAllYieldPools().catch((err) => {
      console.error("[compare] yields load failed:", err?.message ?? err)
      return [] as YieldPool[]
    }),
    loadAllAaveReservesLive().catch((err) => {
      console.error("[compare] aave reserves load failed:", err?.message ?? err)
      return [] as AaveReserveLive[]
    }),
    loadAllSparkReservesLive().catch((err) => {
      console.error("[compare] spark reserves load failed:", err?.message ?? err)
      return [] as AaveReserveLive[]
    }),
    loadAllFluidVaultsLive().catch((err) => {
      console.error("[compare] fluid vaults load failed:", err?.message ?? err)
      return [] as FluidVaultLive[]
    }),
  ])

  const cells: CompareCell[] = PROTOCOLS.map((p) => {
    const cell = emptyCell(p)
    const yieldsProjects = YIELDS_PROJECT_BY_PROTOCOL[p.slug] ?? [p.defillamaSlug]
    const pool =
      p.slug === "morpho-blue"
        // Morpho: only consider apyBase != null vaults so we skip raw
        // collateral-market rows.
        ? pickLargestPool(
            pools.filter((px) => px.apyBase != null),
            yieldsProjects,
            upperSymbol,
          )
        : pickLargestPool(pools, yieldsProjects, upperSymbol)

    if (pool) applyYieldsLayer(cell, pool)

    if (p.slug === "aave-v3") {
      const reserve = aaveReserves.find(
        (r) => r.symbol.toUpperCase() === upperSymbol,
      )
      if (reserve) {
        applyAaveStyleLayer(cell, reserve)
        cell.available = true
      }
    } else if (p.slug === "spark") {
      const reserve = sparkReserves.find(
        (r) => r.symbol.toUpperCase() === upperSymbol,
      )
      if (reserve) {
        applyAaveStyleLayer(cell, reserve)
        cell.available = true
      }
    } else if (p.slug === "fluid") {
      // Resolve the loan-asset address through Aave's reserve list since
      // Aave carries every asset in MAJOR_ASSETS. If Aave didn't load (RPC
      // hiccup), the Fluid layer just gets the Yields-only data.
      const aaveMatch = aaveReserves.find(
        (r) => r.symbol.toUpperCase() === upperSymbol,
      )
      const loanAddress = aaveMatch?.underlyingAsset ?? null
      const vault = pickFluidLoanVault(fluidVaults, loanAddress)
      if (vault) {
        applyFluidLayer(cell, vault, {
          col: vault.isSmartCol,
          debt: vault.isSmartDebt,
        })
      }
    } else if (p.slug === "morpho-blue") {
      const n = countMorphoMarketsForLoan(pools, upperSymbol)
      if (n > 0) {
        cell.note = `Across ${n} vault-allocated market${n === 1 ? "" : "s"}`
        cell.available = true
        // We can't surface a single liq threshold / bonus / oracle for
        // Morpho because they vary by market. The Parameter Comparator's
        // UI handles this with explicit "varies by market" cells.
      }
    }

    return cell
  })

  // Best picks across the four protocols. We use base APYs (not effective)
  // so the highlights aren't influenced by reward programs that come and go.
  const supplyCandidates = cells.filter((c) => c.supplyApy != null)
  const borrowCandidates = cells.filter(
    (c) => c.borrowApy != null && c.borrowApy > 0.1 && (c.totalBorrowUsd ?? 0) >= 1_000_000,
  )
  const spreadCandidates = cells.filter(
    (c) => c.spread != null && c.spread > 0,
  )
  const bestSupply =
    supplyCandidates.length > 0
      ? supplyCandidates.reduce((b, c) => (c.supplyApy! > b.supplyApy! ? c : b))
      : null
  const bestBorrow =
    borrowCandidates.length > 0
      ? borrowCandidates.reduce((b, c) => (c.borrowApy! < b.borrowApy! ? c : b))
      : null
  const tightestSpread =
    spreadCandidates.length > 0
      ? spreadCandidates.reduce((b, c) => (c.spread! < b.spread! ? c : b))
      : null

  return {
    symbol: upperSymbol,
    cells,
    best: {
      supplyApySlug: bestSupply?.protocolSlug ?? null,
      borrowApySlug: bestBorrow?.protocolSlug ?? null,
      spreadSlug: tightestSpread?.protocolSlug ?? null,
    },
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}

/**
 * Fetch supply-APY history for each protocol's representative pool, plus the
 * Fed Funds rate for the same window. Drives Zone 2's history chart and the
 * cross-protocol spread sub-chart.
 *
 * Borrow-APY history is intentionally NOT fetched here — DefiLlama's free
 * `/chart/{poolId}` only returns supply APY (`apyBase`). Borrow APY history
 * for v1 is left to a follow-up pass once `rate_snapshots` accumulates
 * enough days to backfill it.
 */
export async function loadCompareHistory(
  symbol: string,
  cells: CompareCell[],
  windowDays = 90,
): Promise<CompareHistoryResponse> {
  const upperSymbol = symbol.toUpperCase()
  const slugsByPoolId: Array<{ slug: string; poolId: string }> = []
  for (const c of cells) {
    if (c.poolId) slugsByPoolId.push({ slug: c.protocolSlug, poolId: c.poolId })
  }
  const cutoffTs = Math.floor(Date.now() / 1000) - windowDays * 86400

  const [chartResults, fedFundsHistory] = await Promise.all([
    Promise.all(
      slugsByPoolId.map(async ({ slug, poolId }) => {
        try {
          const points = await fetchYieldChart(poolId)
          return { slug, points }
        } catch (err: any) {
          console.error(`[compare] chart ${slug} (${poolId}) failed:`, err?.message ?? err)
          return { slug, points: [] as YieldChartPoint[] }
        }
      }),
    ),
    fetchFedFundsRate(windowDays + 30).catch((err) => {
      console.error("[compare] FRED fetch failed:", err?.message ?? err)
      return [] as FredPoint[]
    }),
  ])

  // Merge per-protocol charts into a daily timeseries — one row per day
  // present on any protocol within the window. APYs are in percent.
  const byTs = new Map<number, CompareSupplyHistoryPoint>()
  for (const { slug, points } of chartResults) {
    for (const pt of points) {
      if (pt.timestamp < cutoffTs) continue
      if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue
      const row = byTs.get(pt.timestamp) ?? { timestamp: pt.timestamp }
      row[slug] = pt.apyBase
      byTs.set(pt.timestamp, row)
    }
  }
  const supplyHistory = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)

  // Dispersion sub-chart: max − min across protocols for days where at
  // least 2 protocols have data. Days with <2 are skipped (spread isn't
  // meaningful there).
  const spreadHistory: CompareSpreadPoint[] = []
  for (const row of supplyHistory) {
    const apys: number[] = []
    for (const { slug } of slugsByPoolId) {
      const v = row[slug]
      if (typeof v === "number" && Number.isFinite(v)) apys.push(v)
    }
    if (apys.length < 2) continue
    const max = Math.max(...apys)
    const min = Math.min(...apys)
    spreadHistory.push({
      timestamp: row.timestamp,
      maxApy: max,
      minApy: min,
      spreadPct: max - min,
    })
  }

  const recentSpreads = spreadHistory.slice(-windowDays)
  const spread90dAvgPct =
    recentSpreads.length > 0
      ? recentSpreads.reduce((s, r) => s + r.spreadPct, 0) / recentSpreads.length
      : null
  const spreadCurrentPct =
    spreadHistory.length > 0 ? spreadHistory[spreadHistory.length - 1].spreadPct : null

  return {
    symbol: upperSymbol,
    supplyHistory,
    spreadHistory,
    fedFundsHistory,
    daysCovered: spreadHistory.length,
    spread90dAvgPct,
    spreadCurrentPct,
  }
}
