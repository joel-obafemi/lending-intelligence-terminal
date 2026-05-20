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
import { fetchFedFundsRate, fetchFredSeries, type FredPoint } from "./fred"
import { loadAllAaveReservesLive } from "./aave-onchain"
import { loadAllSparkReservesLive } from "./spark-onchain"
import type { RealYieldPoint } from "./real-yield"

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
  "compound-v3": ["compound-v3"],
  "euler-v2": ["euler-v2"],
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
  /** Real yield spread history (≈18 months): blended stablecoin supply APY
   *  − 4-week T-bill (FRED TB4WK), TVL-weighted across the four protocols.
   *  Powers the Rate Monitor's Hero chart and the verdict-strip card. */
  realYieldSpreadHistory: RealYieldPoint[]
  /** Latest blended stablecoin APY / T-bill / spread snapshot. */
  realYieldSpreadCurrent: {
    stableApyPct: number | null
    tBillPct: number | null
    spreadPct: number | null
  }
  /** Cross-protocol max-minus-min supply APY history per asset (the
   *  "dispersion" series). Same time window as supplyHistoryByAsset. */
  dispersionByAsset: Record<string, Array<{ timestamp: number; value: number }>>
  fetchedAt: number
}

/**
 * Pick the most-representative pool per (protocol, symbol) pair.
 *
 * For pool-based protocols (Aave, Spark) there's one reserve per asset, so
 * the choice is trivial. Fluid: pick the largest pool (Fluid has multiple
 * vaults per asset; using the dominant one matches the convention used
 * elsewhere). Morpho is special — it has many isolated markets per loan
 * asset, so we surface a TVL-weighted blend across all matching MetaMorpho
 * vaults in `pickMorphoBlendedCells` below.
 */
function pickRepresentativePools(pools: YieldPool[]): RateMatrixCell[] {
  const best = new Map<string, YieldPool>() // key = `${slug}:${symbol}`
  for (const p of pools) {
    if (p.chain !== "Ethereum") continue
    const slug = protocolSlugForProject(p.project)
    if (!slug) continue
    // Morpho is handled separately via the blended path. Skip here.
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

/** Outlier filter for Morpho per-vault APYs. The DefiLlama Yields feed
 *  occasionally returns single-depositor or freshly-deployed vaults with
 *  apyBase in the thousands of percent — same noise that the curator
 *  leaderboard truncates with `*` when displayed. We drop them entirely
 *  from blends + history derivations. */
const MORPHO_APY_CEILING_PCT = 50

/** Address registry for the assets we care about — used to match Morpho's
 *  many MetaMorpho vaults to a canonical asset symbol. (Morpho vault symbols
 *  are vault names like `steakUSDC`; matching by `underlyingTokens[0]`
 *  against the loan-asset address is the reliable join.) */
const ASSET_ADDRESSES: Record<string, string> = {
  USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
  USDS: "0xdc035d45d973e3ec169d2276ddab16f1e407384f",
  GHO: "0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f",
  WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  WSTETH: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  WEETH: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee",
  WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  CBBTC: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
}

/** Build a TVL-weighted blended Morpho cell per supported asset.
 *
 *  For each asset, find every MetaMorpho vault (DefiLlama project
 *  `morpho-blue`, `apyBase` set) whose underlying loan token is the
 *  asset, then weight `apyBase` by `totalSupplyUsd`. Borrow APY is
 *  intentionally null on these blended rows — Morpho's borrow side is
 *  per-market, not per-vault, so a single borrow APY would be
 *  misleading. The matrix renders a small "Across N vaults" sub-line
 *  via the cell renderer.
 *
 *  We cap apyBase at MORPHO_APY_CEILING_PCT (50%) when computing the
 *  blend to drop the well-known long-tail of broken / single-depositor
 *  vaults that DefiLlama occasionally returns at 50,000%+ APY (same
 *  filter the curator leaderboard uses).
 */
function pickMorphoBlendedCells(pools: YieldPool[]): RateMatrixCell[] {
  const cells: RateMatrixCell[] = []
  for (const symbol of MAJOR_ASSETS) {
    const addr = ASSET_ADDRESSES[symbol]?.toLowerCase()
    if (!addr) continue
    const matches = pools.filter((p) => {
      if (p.chain !== "Ethereum") return false
      if (p.project !== "morpho-blue") return false
      if (p.apyBase == null || !Number.isFinite(p.apyBase)) return false
      // Drop outlier vaults; see comment above the function.
      if (p.apyBase > MORPHO_APY_CEILING_PCT) return false
      const primary = p.underlyingTokens?.[0]?.toLowerCase()
      return primary === addr
    })
    if (matches.length === 0) continue
    let denom = 0
    let weightedApy = 0
    let totalSupply = 0
    let pickedPoolId: string | null = null
    let pickedPoolSupply = 0
    for (const p of matches) {
      const w = p.totalSupplyUsd ?? p.tvlUsd ?? 0
      if (w <= 0) continue
      weightedApy += (p.apyBase ?? 0) * w
      denom += w
      totalSupply += w
      if (w > pickedPoolSupply) {
        pickedPoolSupply = w
        pickedPoolId = p.pool
      }
    }
    if (denom <= 0 || pickedPoolId == null) continue
    const blendedApy = weightedApy / denom
    cells.push({
      protocolSlug: "morpho-blue",
      symbol,
      supplyApy: blendedApy,
      supplyApy30d: null,
      // Morpho's borrow side lives on the underlying isolated markets;
      // a vault-level borrow APY isn't a meaningful single number.
      borrowApy: null,
      borrowApy30d: null,
      supplyApyReward: null,
      borrowApyReward: null,
      supplyApyEffective: blendedApy,
      borrowApyEffective: null,
      spread: null,
      utilization: null,
      totalSupplyUsd: totalSupply,
      totalBorrowUsd: null,
      poolId: pickedPoolId,
      liveSource: "defillama",
    })
  }
  return cells
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

/** Merge per-protocol chart histories for one asset into a single protocol-keyed series.
 *  Drops apyBase samples above MORPHO_APY_CEILING_PCT — DefiLlama
 *  occasionally serves Morpho-vault flash spikes in the thousands of
 *  percent which would distort both the line chart and the dispersion
 *  series derived from this. */
function buildHistoryForAsset(
  perProtocolHistory: Map<string, YieldChartPoint[]>,
): RateHistoryPoint[] {
  const byTs = new Map<number, RateHistoryPoint>()
  for (const [slug, points] of perProtocolHistory.entries()) {
    for (const pt of points) {
      if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue
      if (pt.apyBase > MORPHO_APY_CEILING_PCT) continue
      const existing = byTs.get(pt.timestamp) ?? { timestamp: pt.timestamp }
      existing[slug] = pt.apyBase
      byTs.set(pt.timestamp, existing)
    }
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
}

/** For each timestamp, max-minus-min APY across the protocols that have
 *  data for that day. The dispersion signal — when this widens, arbitrage
 *  is appearing; when it narrows, the market is converging. */
function buildDispersionSeries(
  history: RateHistoryPoint[],
): Array<{ timestamp: number; value: number }> {
  const out: Array<{ timestamp: number; value: number }> = []
  for (const pt of history) {
    const values: number[] = []
    for (const [k, v] of Object.entries(pt)) {
      if (k === "timestamp") continue
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      values.push(v)
    }
    if (values.length < 2) continue
    const max = Math.max(...values)
    const min = Math.min(...values)
    const v = max - min
    if (Number.isFinite(v) && v >= 0) {
      out.push({ timestamp: pt.timestamp, value: v })
    }
  }
  return out
}

/** Assets to chart historical supply APY for. We keep the chart list
 *  tight to manage DefiLlama call volume — one chart per (asset, protocol)
 *  is up to 4 fetches each. The four stables drive the Real Yield Spread
 *  history; ETH/wstETH/WBTC drive the per-asset history+dispersion lens. */
const CHART_ASSETS = ["USDC", "USDT", "DAI", "USDS", "WETH", "WSTETH", "WBTC"] as const
/** Stables used in the blended Real Yield Spread history. */
const RYS_STABLES = ["USDC", "USDT", "DAI", "USDS"] as const
/** Window for the Hero chart and dispersion charts — ~18 months. */
const HERO_WINDOW_DAYS = 540

/** Build a TVL-weighted blended stablecoin supply APY series from per-pool
 *  charts. Pulls all four stables × four protocols, finds matching pools,
 *  and weight-averages `apyBase` by `tvlUsd` per timestamp. */
async function buildBlendedStableApyHistory(
  matrix: RateMatrixCell[],
  morphoChartIndex: Map<string, YieldChartPoint[]>,
): Promise<Array<{ timestamp: number; apyPct: number }>> {
  // Collect (poolId, slug, symbol) for every stable cell + Morpho blended row.
  const targets: Array<{ poolId: string; slug: string; symbol: string }> = []
  for (const c of matrix) {
    if (!RYS_STABLES.includes(c.symbol as (typeof RYS_STABLES)[number])) continue
    targets.push({ poolId: c.poolId, slug: c.protocolSlug, symbol: c.symbol })
  }
  // Pull per-pool charts in parallel. Morpho charts are already loaded
  // during the matrix build (we reuse them via morphoChartIndex).
  const charts = await Promise.all(
    targets.map(async (t) => {
      try {
        const hist = await fetchYieldChart(t.poolId)
        return { ...t, hist }
      } catch (err: any) {
        console.error(
          `[rates/rys] chart ${t.slug}/${t.symbol} failed:`,
          err?.message ?? err,
        )
        return { ...t, hist: [] as YieldChartPoint[] }
      }
    }),
  )

  // Day-bucket aggregation keyed by UTC midnight. Each entry sums
  // (apyBase × tvlUsd) and (tvlUsd) so the final divide yields the
  // TVL-weighted blended APY for that day across every contributing pool.
  // Outlier filter: any per-pool sample with apyBase above the Morpho
  // ceiling is dropped. This is the same flash-spike that the per-row
  // chart already clips at 50% for cross-protocol charts; the blended
  // series picks up multi-thousand-percent days otherwise.
  const dayBuckets = new Map<number, { weighted: number; weight: number }>()
  function add(pt: YieldChartPoint) {
    if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) return
    if (pt.apyBase > MORPHO_APY_CEILING_PCT) return
    if (pt.tvlUsd == null || !Number.isFinite(pt.tvlUsd) || pt.tvlUsd <= 0) return
    const dayTs = Math.floor(pt.timestamp / 86400) * 86400
    const cur = dayBuckets.get(dayTs) ?? { weighted: 0, weight: 0 }
    cur.weighted += pt.apyBase * pt.tvlUsd
    cur.weight += pt.tvlUsd
    dayBuckets.set(dayTs, cur)
  }
  for (const c of charts) for (const pt of c.hist) add(pt)
  // Fold in Morpho's blended-vault charts on the stables we matched.
  for (const sym of RYS_STABLES) {
    const morphoHist = morphoChartIndex.get(sym)
    if (!morphoHist) continue
    for (const pt of morphoHist) add(pt)
  }
  const series = [...dayBuckets.entries()]
    .map(([timestamp, { weighted, weight }]) => ({
      timestamp,
      apyPct: weight > 0 ? weighted / weight : NaN,
    }))
    .filter((p) => Number.isFinite(p.apyPct))
    .sort((a, b) => a.timestamp - b.timestamp)
  return series
}

/** Build the Real Yield Spread history by aligning a blended-stables
 *  daily APY series against the FRED 4-week T-bill series. Carries the
 *  T-bill rate forward across weekend / holiday gaps so the chart
 *  doesn't drop NaN points. */
function buildRealYieldHistory(
  blendedStableApy: Array<{ timestamp: number; apyPct: number }>,
  tBills: FredPoint[],
): RealYieldPoint[] {
  if (blendedStableApy.length === 0 && tBills.length === 0) return []
  // Fast lookup map of T-bill rate by day.
  const tBillByDay = new Map<number, number>()
  for (const p of tBills) {
    const dayTs = Math.floor(p.timestamp / 86400) * 86400
    tBillByDay.set(dayTs, p.rate)
  }
  const apyByDay = new Map<number, number>()
  for (const p of blendedStableApy) apyByDay.set(p.timestamp, p.apyPct)
  // Merge timestamps from both sides so we don't drop days where
  // either source has data but the other doesn't.
  const allDays = new Set<number>([
    ...blendedStableApy.map((p) => p.timestamp),
    ...[...tBillByDay.keys()],
  ])
  const sortedDays = [...allDays].sort((a, b) => a - b)

  const out: RealYieldPoint[] = []
  let lastApy: number | null = null
  let lastTBill: number | null = null
  for (const day of sortedDays) {
    if (apyByDay.has(day)) lastApy = apyByDay.get(day)!
    if (tBillByDay.has(day)) lastTBill = tBillByDay.get(day)!
    if (lastApy == null && lastTBill == null) continue
    out.push({
      timestamp: day,
      stableApyPct: lastApy,
      tBillPct: lastTBill,
      spreadPct:
        lastApy != null && lastTBill != null ? lastApy - lastTBill : null,
    })
  }
  return out
}

export async function loadRates(): Promise<RatesResponse> {
  const pools = await fetchAllYieldPools()
  // Build the matrix from (a) representative single-pool rows for
  // Aave/Spark/Fluid and (b) TVL-weighted blended Morpho rows so the
  // matrix has a Morpho cell on every supported asset.
  const protocolPicks = pickRepresentativePools(pools)
  const morphoBlends = pickMorphoBlendedCells(pools)
  const matrix = [...protocolPicks, ...morphoBlends].sort((a, b) => {
    const ai = MAJOR_ASSETS.indexOf(a.symbol as MajorAsset)
    const bi = MAJOR_ASSETS.indexOf(b.symbol as MajorAsset)
    if (ai !== bi) return ai - bi
    const aj = PROTOCOLS.findIndex((p) => p.slug === a.protocolSlug)
    const bj = PROTOCOLS.findIndex((p) => p.slug === b.protocolSlug)
    return aj - bj
  })

  // Pull supply-history charts for the canonical CHART_ASSETS set. Each
  // (asset, protocol) gets a /chart fetch — Morpho's blended row uses its
  // chosen pool id from `pickMorphoBlendedCells`.
  const supplyHistoryByAsset: Record<string, RateHistoryPoint[]> = {}
  const morphoChartIndex = new Map<string, YieldChartPoint[]>()
  const supplyHistoryJob = Promise.all(
    CHART_ASSETS.map(async (symbol) => {
      const cells = matrix.filter((c) => c.symbol === symbol)
      const perProtocol = new Map<string, YieldChartPoint[]>()
      await Promise.all(
        cells.map(async (c) => {
          try {
            const hist = await fetchYieldChart(c.poolId)
            perProtocol.set(c.protocolSlug, hist)
            if (c.protocolSlug === "morpho-blue") {
              morphoChartIndex.set(symbol, hist)
            }
          } catch (err: any) {
            console.error(`[rates] chart ${c.protocolSlug}/${symbol} failed:`, err.message)
          }
        }),
      )
      supplyHistoryByAsset[symbol] = buildHistoryForAsset(perProtocol)
    }),
  )

  // Macro overlay (DFF for the per-asset chart, TB4WK for Real Yield Spread).
  const [, fedFundsHistory, tBillHistory] = await Promise.all([
    Promise.all([overlayOnChainRates(matrix), supplyHistoryJob]),
    fetchFedFundsRate(HERO_WINDOW_DAYS).catch((err) => {
      console.error("[rates] FRED DFF fetch failed:", err.message)
      return [] as FredPoint[]
    }),
    fetchFredSeries("TB4WK", HERO_WINDOW_DAYS).catch((err) => {
      console.error("[rates] FRED TB4WK fetch failed:", err.message)
      return [] as FredPoint[]
    }),
  ])

  // Per-asset cross-protocol dispersion (max − min supply APY). Same input
  // we already have from the per-asset history fetches.
  const dispersionByAsset: Record<string, Array<{ timestamp: number; value: number }>> = {}
  for (const sym of CHART_ASSETS) {
    const hist = supplyHistoryByAsset[sym]
    if (!hist || hist.length === 0) continue
    dispersionByAsset[sym] = buildDispersionSeries(hist)
  }

  // Blended stablecoin supply APY history → Real Yield Spread series.
  const blendedStable = await buildBlendedStableApyHistory(
    matrix,
    morphoChartIndex,
  )
  const realYieldSpreadHistory = buildRealYieldHistory(
    blendedStable,
    tBillHistory,
  )
  // The "current" snapshot for the verdict-strip card is the latest
  // entry in the spread series (last point that has both legs).
  let realYieldSpreadCurrent = {
    stableApyPct: null as number | null,
    tBillPct: null as number | null,
    spreadPct: null as number | null,
  }
  for (let i = realYieldSpreadHistory.length - 1; i >= 0; i--) {
    const p = realYieldSpreadHistory[i]
    if (p.spreadPct != null) {
      realYieldSpreadCurrent = {
        stableApyPct: p.stableApyPct,
        tBillPct: p.tBillPct,
        spreadPct: p.spreadPct,
      }
      break
    }
  }

  return {
    matrix,
    supplyHistoryByAsset,
    fedFundsHistory,
    realYieldSpreadHistory,
    realYieldSpreadCurrent,
    dispersionByAsset,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
