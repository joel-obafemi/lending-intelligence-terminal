/**
 * Spark USDS Yield panel — data layer.
 *
 * Three lines that map Spark's role as Sky's on-chain distribution arm:
 *
 *   1. Sky Savings Rate (SSR) — what USDS holders earn by parking into
 *      Sky's sUSDS savings vault. Spark surfaces this on its own
 *      `app.spark.fi/savings` page (currently 3.65%); on DefiLlama Yields
 *      it shows up as the `sparklend` (or `sky-lend`) project's `sUSDS`
 *      symbol with `apyBase` set and no `apyBaseBorrow`. Same number on
 *      both surfaces — Spark's savings is a pass-through.
 *
 *   2. Spark USDS Borrow APY — what borrowers pay on Spark's USDS
 *      LENDING market (a different product from the savings vault). The
 *      market lives on the `sparklend` Aave-V3-fork pool with its own
 *      utilization curve. We pull supply APY history from the Yields
 *      `/chart/{poolId}` endpoint and derive borrow APY via the standard
 *      pool-based identity (lib/derived-rates.ts). The wedge between
 *      this line and SSR is the captured spread that funds Spark's
 *      protocol revenue.
 *
 *   3. 4-week T-bill (FRED TB4WK) — the risk-free benchmark. The wedge
 *      between SSR and T-bill is the on-chain risk premium depositors
 *      receive for taking smart-contract exposure over Treasuries.
 *
 * The original v1 of this panel paired SSR against "sUSDS APY on Spark"
 * — but those are the same number (Spark's savings is a pass-through to
 * Sky), so the chart had no spread to read. This v2 uses Spark's
 * lending-market borrow APY as the second line; that's a genuinely
 * different rate driven by Spark's own utilization, and the gap to SSR
 * is the actual captured-yield story.
 */
import {
  fetchAllYieldPools,
  fetchYieldChart,
  fetchProtocolHistory,
  type YieldPool,
} from "./defillama"
import { fetchFredSeries, type FredPoint } from "./fred"
import {
  utilizationHistoryForAsset,
  deriveBorrowApyHistory,
} from "./derived-rates"
import { loadAllSparkReservesLive } from "./spark-onchain"
import { loadSkySavingsRate } from "./sky-onchain"

export interface YieldPanelPoint {
  timestamp: number
  /** Sky Savings Rate %; null on days where DefiLlama hasn't published. */
  ssrPct: number | null
  /** Spark USDS lending-market borrow APY %; null when un-derivable. */
  sparkBorrowPct: number | null
  /** 4-week T-bill rate %; carried forward across weekend gaps. */
  tBillPct: number | null
}

export interface SparkYieldPanelResponse {
  history: YieldPanelPoint[]
  current: {
    ssrPct: number | null
    sparkBorrowPct: number | null
    tBillPct: number | null
    /** Spark borrow APY minus SSR, in pp. The captured-spread number. */
    capturedSpreadPct: number | null
    /** SSR minus T-bill, in pp. Depositor's premium over Treasuries. */
    onchainPremiumPct: number | null
  }
  fetchedAt: number
}

/** Project strings DefiLlama Yields uses for the Sky-side savings rate.
 *  Several aliases exist (the protocol has been re-classified twice as the
 *  Maker → Sky rebrand rolled out); `sparklend` + `sUSDS` ends up being the
 *  most stable hit on the free Yields endpoint. */
const SSR_PROJECT_CANDIDATES = [
  "sparklend",
  "spark",
  "sky",
  "sky-lend",
  "sky-savings",
  "sky-money",
  "makerdao",
] as const

/** Symbols that flag a pool as the Sky savings rate (= SSR / sUSDS supply
 *  APY). We restrict to the savings-vault tokens (sUSDS, sDAI) — plain
 *  `USDS` / `DAI` are lending markets with their own utilization-driven
 *  supply rates, NOT the SSR. Falling back to those would give us the
 *  wrong line (typically near-0%, since the Spark USDS lending market
 *  has low supply utilization). */
const SSR_SYMBOL_CANDIDATES = ["SUSDS", "SDAI"] as const

function pickLargestSavingsMatch(
  pools: YieldPool[],
  projects: readonly string[],
  symbols: readonly string[],
): YieldPool | null {
  const projSet = new Set(projects)
  const symSet = new Set(symbols.map((s) => s.toUpperCase()))
  const candidates = pools.filter(
    (p) =>
      p.chain === "Ethereum" &&
      projSet.has(p.project) &&
      symSet.has(p.symbol.toUpperCase()) &&
      p.apyBase != null &&
      p.apyBase > 0 &&
      // Savings vaults are supply-only. The lending-market USDS pool will
      // have a non-trivial borrow APY (typically 4-8%); the savings vault
      // either reports null or 0 there. Accept both so we don't drop sUSDS
      // when DefiLlama publishes a literal 0 instead of null.
      (p.apyBaseBorrow == null || p.apyBaseBorrow === 0),
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  )
}

/** Find the SSR pool. Walks SSR_SYMBOL_CANDIDATES in priority order — sUSDS
 *  first (the current Sky savings token), sDAI as the legacy fallback. */
function findSsrPool(pools: YieldPool[]): YieldPool | null {
  for (const sym of SSR_SYMBOL_CANDIDATES) {
    const hit = pickLargestSavingsMatch(pools, SSR_PROJECT_CANDIDATES, [sym])
    if (hit) return hit
  }
  return null
}

/** Find Spark's USDS lending market — the regular `sparklend` project's
 *  USDS reserve, *not* the savings vault. We restrict to pools that have
 *  `apyBaseBorrow` set, which is the signature of a lending market vs a
 *  savings vault (the latter has supply yield only). */
function findSparkUsdsLendingPool(pools: YieldPool[]): YieldPool | null {
  const candidates = pools.filter(
    (p) =>
      p.chain === "Ethereum" &&
      (p.project === "sparklend" || p.project === "spark") &&
      p.symbol.toUpperCase() === "USDS" &&
      p.apyBase != null &&
      p.apyBaseBorrow != null,
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  )
}

export async function loadSparkYieldPanel(): Promise<SparkYieldPanelResponse> {
  // Pull every input in parallel. Each one is failure-tolerant — a missing
  // line just drops cleanly rather than failing the panel. The on-chain
  // SSR read is the canonical fallback when DefiLlama hasn't indexed the
  // sUSDS pool cleanly.
  const [pools, tBills, sparkProtocolHistory, sparkReserves, onchainSsr] =
    await Promise.all([
      fetchAllYieldPools().catch(() => [] as YieldPool[]),
      fetchFredSeries("TB4WK", 400).catch(() => [] as FredPoint[]),
      fetchProtocolHistory("sparklend").catch(() => null),
      loadAllSparkReservesLive().catch(() => []),
      loadSkySavingsRate().catch(() => null),
    ])

  const ssrPool = findSsrPool(pools)
  const lendingPool = findSparkUsdsLendingPool(pools)

  // Get supply APY history for both pools (free DefiLlama Yields chart).
  const [ssrChart, lendingSupplyChart] = await Promise.all([
    ssrPool ? fetchYieldChart(ssrPool.pool).catch(() => []) : Promise.resolve([]),
    lendingPool ? fetchYieldChart(lendingPool.pool).catch(() => []) : Promise.resolve([]),
  ])

  // Derive Spark USDS borrow APY history from supply APY + per-asset
  // utilization + the live reserve factor (from on-chain UiPoolDataProviderV3
  // — close enough as a constant; governance changes the RF rarely).
  let sparkBorrowApyHistory: Array<{ timestamp: number; value: number }> = []
  if (sparkProtocolHistory && lendingSupplyChart.length > 0) {
    const supplyApyHistory = lendingSupplyChart
      .filter((p) => p.apyBase != null && Number.isFinite(p.apyBase))
      .map((p) => ({ timestamp: p.timestamp, value: p.apyBase as number }))
    const utilization = utilizationHistoryForAsset(
      sparkProtocolHistory.suppliedByAsset,
      sparkProtocolHistory.borrowedByAsset,
      "USDS",
    )
    const reserveFactor =
      sparkReserves.find((r) => r.symbol.toUpperCase() === "USDS")?.reserveFactor ?? null
    sparkBorrowApyHistory = deriveBorrowApyHistory(supplyApyHistory, utilization, reserveFactor)
  }

  // Build a unified daily series indexed by timestamp.
  const byTs = new Map<number, YieldPanelPoint>()
  const seed = (ts: number): YieldPanelPoint => {
    const existing = byTs.get(ts)
    if (existing) return existing
    const fresh: YieldPanelPoint = {
      timestamp: ts,
      ssrPct: null,
      sparkBorrowPct: null,
      tBillPct: null,
    }
    byTs.set(ts, fresh)
    return fresh
  }
  let yieldsSsrPointCount = 0
  for (const pt of ssrChart) {
    if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue
    seed(pt.timestamp).ssrPct = pt.apyBase
    yieldsSsrPointCount++
  }
  for (const pt of sparkBorrowApyHistory) {
    if (!Number.isFinite(pt.value)) continue
    seed(pt.timestamp).sparkBorrowPct = pt.value
  }
  let lastTbill: number | null = null
  for (const pt of [...tBills].sort((a, b) => a.timestamp - b.timestamp)) {
    lastTbill = pt.rate
    seed(pt.timestamp).tBillPct = pt.rate
  }

  // SSR fallback: when DefiLlama gave us nothing useful for the SSR line
  // (or only a couple of points), back-fill the entire window with the
  // on-chain SSR rate. The SSR moves in discrete governance steps — a
  // flat extrapolation is honest at chart-level granularity, and it
  // saves a reader from staring at an empty chart slot.
  if (yieldsSsrPointCount < 5 && onchainSsr) {
    for (const row of byTs.values()) {
      if (row.ssrPct == null) row.ssrPct = onchainSsr.apyPct
    }
  }

  // Walk forward and carry-forward T-bill across weekend / holiday gaps so
  // the dashed line stays continuous through the chart.
  const history = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
  let carry: number | null = null
  for (const row of history) {
    if (row.tBillPct != null) {
      carry = row.tBillPct
    } else if (carry != null) {
      row.tBillPct = carry
    }
  }

  // Current snapshot — prefer the on-chain SSR for the live number since
  // it's the canonical source. Fall back to DefiLlama-history's last point
  // when the on-chain read failed.
  const lastSsr =
    onchainSsr?.apyPct ??
    [...history].reverse().find((p) => p.ssrPct != null)?.ssrPct ??
    null
  const lastSparkBorrow =
    [...history].reverse().find((p) => p.sparkBorrowPct != null)?.sparkBorrowPct ??
    lendingPool?.apyBaseBorrow ??
    null
  const lastTbillVal = lastTbill ?? history.at(-1)?.tBillPct ?? null

  return {
    history,
    current: {
      ssrPct: lastSsr,
      sparkBorrowPct: lastSparkBorrow,
      tBillPct: lastTbillVal,
      capturedSpreadPct:
        lastSparkBorrow != null && lastSsr != null ? lastSparkBorrow - lastSsr : null,
      onchainPremiumPct:
        lastSsr != null && lastTbillVal != null ? lastSsr - lastTbillVal : null,
    },
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
