/**
 * Derive per-day borrow APY history from data we already pull.
 *
 * For pool-based protocols (Aave V3, SparkLend, Fluid) the standard relation
 * between supply and borrow APY is:
 *
 *     supplyAPY ≈ borrowAPY × utilization × (1 − reserveFactor)
 *
 * Solved for borrowAPY:
 *
 *     borrowAPY ≈ supplyAPY / utilization / (1 − reserveFactor)
 *
 * Inputs we already have for free:
 *   - supplyAPY history per pool   ← DefiLlama Yields `/chart/{poolId}`
 *     (used by `/markets/[poolId]` for the supply APY chart)
 *   - utilization history per asset ← DefiLlama `/protocol/<slug>` chainTvls
 *     (used by `/overview` for the per-asset stacks)
 *   - reserveFactor (current)       ← on-chain `UiPoolDataProviderV3`
 *     (used by `/markets/[poolId]` for the live snapshot)
 *
 * Combined → 3 years of borrow-APY history for every Aave/Spark/Fluid market
 * with no new vendor dependency. Approximate but suitable for trend charts.
 *
 * Limitations to be honest about:
 *   - Reserve factor varies through time via governance — we use the current
 *     value across the whole series. If RF was retuned dramatically the
 *     historical part of the chart will be slightly off (constant offset).
 *   - The identity assumes vanilla pool-based lending — Morpho's market model
 *     is different, but we get borrow APY history natively from their API
 *     anyway, so this helper isn't used for Morpho.
 *   - Reward APYs distort either side and are excluded — supply APY is the
 *     base APY (DefiLlama's `apyBase`), not gross.
 *   - Where utilization is near zero (< 1%) the derivation amplifies noise;
 *     we return null rather than emit absurdly large APYs.
 */

import type { AssetDayPoint } from "./defillama"

export interface DerivedBorrowPoint {
  timestamp: number
  /** Derived borrow APY in PERCENT (matches our codebase's APY convention). */
  value: number
}

export interface DerivedUtilPoint {
  timestamp: number
  /** Utilization in PERCENT (0-100). */
  value: number
}

/** Below this utilization, the supply→borrow algebra amplifies noise into
 *  meaningless triple-digit APYs. Skip those days entirely. */
const MIN_USEFUL_UTIL = 0.01  // 1%

/** Fold per-asset USD daily series into utilization (per asset, per day).
 *  Returns the per-day utilization for ONE asset, in percent. */
export function utilizationHistoryForAsset(
  suppliedByAsset: AssetDayPoint[],
  borrowedByAsset: AssetDayPoint[],
  assetSymbol: string,
): DerivedUtilPoint[] {
  // DefiLlama symbol-cases its tokensInUsd keys inconsistently across protocols.
  // Match case-insensitively to be safe.
  const target = assetSymbol.toUpperCase()
  const supByTs = new Map<number, number>()
  for (const pt of suppliedByAsset) {
    const v = pickToken(pt.tokens, target)
    if (v != null) supByTs.set(pt.timestamp, v)
  }
  const borByTs = new Map<number, number>()
  for (const pt of borrowedByAsset) {
    const v = pickToken(pt.tokens, target)
    if (v != null) borByTs.set(pt.timestamp, v)
  }
  const out: DerivedUtilPoint[] = []
  for (const [ts, supplied] of supByTs.entries()) {
    const borrowed = borByTs.get(ts) ?? 0
    const total = supplied + borrowed
    if (total <= 0) continue
    const util = (borrowed / total) * 100
    if (Number.isFinite(util)) out.push({ timestamp: ts, value: util })
  }
  return out.sort((a, b) => a.timestamp - b.timestamp)
}

function pickToken(tokens: Record<string, number>, upperSymbol: string): number | undefined {
  if (!tokens) return undefined
  for (const [k, v] of Object.entries(tokens)) {
    if (k.toUpperCase() === upperSymbol) return v
  }
  return undefined
}

/** Derive borrow APY history from supply-APY history and utilization history.
 *
 *  - `supplyApyHistory` is in PERCENT (DefiLlama returns it as percent).
 *  - `utilizationHistory` is in PERCENT (0-100).
 *  - `reserveFactor` is a 0-1 fraction (e.g. 0.10 for 10% RF). Falls back to
 *    0.10 when null/unknown — matches the previous SparkLend dashboard's
 *    hard-coded `× 1.1` heuristic so behavior is comparable.
 *
 * Output: borrow APY in PERCENT, joined by closest timestamp (within ±1 day).
 * Days with utilization below `MIN_USEFUL_UTIL` are skipped to avoid
 * amplifying near-zero noise into wild APY spikes.
 */
export function deriveBorrowApyHistory(
  supplyApyHistory: Array<{ timestamp: number; value: number }>,
  utilizationHistory: DerivedUtilPoint[],
  reserveFactor: number | null,
): DerivedBorrowPoint[] {
  if (supplyApyHistory.length === 0 || utilizationHistory.length === 0) return []
  const rf = reserveFactor != null && reserveFactor >= 0 && reserveFactor < 1 ? reserveFactor : 0.10
  const factor = 1 / (1 - rf)
  const utilByTs = new Map<number, number>()
  for (const u of utilizationHistory) utilByTs.set(u.timestamp, u.value)

  // Day-tolerance lookup so DefiLlama's per-source timestamp drift (one is
  // midnight UTC, the other is end-of-day) doesn't drop points.
  const utilTimestamps = utilizationHistory.map((u) => u.timestamp).sort((a, b) => a - b)
  const TOL = 86400  // 1 day

  const out: DerivedBorrowPoint[] = []
  for (const sup of supplyApyHistory) {
    if (!Number.isFinite(sup.value)) continue
    let util = utilByTs.get(sup.timestamp)
    if (util == null) {
      // Closest-timestamp match within tolerance.
      const closestTs = nearest(utilTimestamps, sup.timestamp)
      if (closestTs != null && Math.abs(closestTs - sup.timestamp) <= TOL) {
        util = utilByTs.get(closestTs)
      }
    }
    if (util == null) continue
    const utilFrac = util / 100
    if (utilFrac < MIN_USEFUL_UTIL) continue
    const borrowApy = (sup.value / utilFrac) * factor
    if (!Number.isFinite(borrowApy)) continue
    out.push({ timestamp: sup.timestamp, value: borrowApy })
  }
  return out
}

/**
 * For a given asset, derive `(totalSupplyUsd, borrowUsd)` per day from
 * DefiLlama's per-asset supplied (unborrowed) + borrowed series. We need
 * `total = supplied + borrowed` for "cap utilization" charts; the supplied
 * series alone is just unborrowed liquidity, which understates how full
 * the supply cap is.
 *
 * Output uses the supplied-series timestamps (drops days where the asset
 * isn't in the supplied snapshot — those are days the protocol didn't
 * support the asset yet).
 */
export function totalSupplyAndBorrowHistoryForAsset(
  suppliedByAsset: AssetDayPoint[],
  borrowedByAsset: AssetDayPoint[],
  assetSymbol: string,
): {
  totalSupplyUsdHistory: Array<{ timestamp: number; value: number }>
  borrowUsdHistory: Array<{ timestamp: number; value: number }>
} {
  const target = assetSymbol.toUpperCase()
  const supByTs = new Map<number, number>()
  for (const pt of suppliedByAsset) {
    const v = pickToken(pt.tokens, target)
    if (v != null) supByTs.set(pt.timestamp, v)
  }
  const borByTs = new Map<number, number>()
  for (const pt of borrowedByAsset) {
    const v = pickToken(pt.tokens, target)
    if (v != null) borByTs.set(pt.timestamp, v)
  }
  const totalSupplyUsdHistory: Array<{ timestamp: number; value: number }> = []
  const borrowUsdHistory: Array<{ timestamp: number; value: number }> = []
  for (const [ts, supplied] of supByTs.entries()) {
    const borrowed = borByTs.get(ts) ?? 0
    totalSupplyUsdHistory.push({ timestamp: ts, value: supplied + borrowed })
    borrowUsdHistory.push({ timestamp: ts, value: borrowed })
  }
  totalSupplyUsdHistory.sort((a, b) => a.timestamp - b.timestamp)
  borrowUsdHistory.sort((a, b) => a.timestamp - b.timestamp)
  return { totalSupplyUsdHistory, borrowUsdHistory }
}

/**
 * Convert a USD time-series into a "cap utilization" percentage series:
 * `(usd[t] / capUsd) × 100`. Both USD values are in the SAME unit so price
 * cancels — we're effectively computing the historical utilization-of-cap
 * assuming the cap has been at its current level all along.
 *
 * Caveats:
 *   - The cap CAN change via governance; we only have the current value.
 *     If it was raised recently, the historical utilization shown here will
 *     read as smaller than it actually was at the time.
 *   - For volatile-priced assets, "USD-of-cap" wobbles with price even when
 *     the on-chain token cap is unchanged. For headline trend reading this
 *     is fine; for precise risk analysis prefer the live snapshot value.
 *
 * Returns [] when capUsd is null/zero (no cap configured or unknown).
 */
export function capUtilizationHistory(
  usdHistory: Array<{ timestamp: number; value: number }>,
  capUsd: number | null,
): Array<{ timestamp: number; value: number }> {
  if (capUsd == null || capUsd <= 0) return []
  return usdHistory
    .filter((p) => Number.isFinite(p.value) && p.value > 0)
    .map((p) => ({ timestamp: p.timestamp, value: (p.value / capUsd) * 100 }))
}

/** Binary-search `arr` for the value closest to `target`. */
function nearest(arr: number[], target: number): number | null {
  if (arr.length === 0) return null
  let lo = 0
  let hi = arr.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < target) lo = mid + 1
    else hi = mid
  }
  // `lo` is the smallest index with arr[lo] >= target. Compare with the
  // previous entry to find the closer of the two.
  const a = arr[lo]
  const b = lo > 0 ? arr[lo - 1] : a
  return Math.abs(a - target) <= Math.abs(b - target) ? a : b
}
