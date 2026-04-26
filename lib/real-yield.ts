/**
 * Real Yield Spread (Tier 2 metric, Section 7.2 of the State of DeFi
 * Lending blueprint).
 *
 *   Real yield spread =  (blended stablecoin lending APY)  −  (4-week T-bill rate)
 *
 *   - Blended stablecoin lending APY: TVL-weighted average of supply APY for
 *     USDC, USDT, DAI, USDS across the four tracked protocols.
 *   - 4-week T-bill rate: FRED `TB4WK` (4-week Treasury bill secondary market
 *     rate), which is the closest risk-free benchmark for short-duration
 *     stablecoin lending.
 *
 * Positive spread = stablecoin lenders are earning above the risk-free rate.
 * Compression / inversion is the headline narrative for "DeFi yields losing
 * their edge vs. tradfi".
 */
import { fetchAllYieldPools } from "./defillama"
import { fetchFredSeries, type FredPoint } from "./fred"
import { YIELDS_PROJECT_BY_PROTOCOL } from "./rates"

const STABLE_SYMBOLS = ["USDC", "USDT", "DAI", "USDS"] as const

export interface RealYieldPoint {
  /** Unix seconds (UTC midnight) */
  timestamp: number
  /** TVL-weighted blended stablecoin supply APY % */
  stableApyPct: number | null
  /** 4-week T-bill rate %, last carried-forward when the FRED series is missing */
  tBillPct: number | null
  /** Spread = stableApy − tBill */
  spreadPct: number | null
}

export interface RealYieldResponse {
  /** Latest values of each leg + spread */
  current: {
    stableApyPct: number | null
    tBillPct: number | null
    spreadPct: number | null
  }
  /** Daily series (1 year) suitable for plotting */
  history: RealYieldPoint[]
  fetchedAt: number
}

function isOurProject(project: string): boolean {
  for (const arr of Object.values(YIELDS_PROJECT_BY_PROTOCOL)) {
    if (arr.includes(project)) return true
  }
  return false
}

/**
 * V1 implementation produces a current spread (from live Yields snapshot)
 * and a 1-year history of T-bill rates with stableApy carried at "current"
 * (DefiLlama's free /chart endpoint doesn't expose historical TVL-weighted
 * blended APY without N pool fetches). Once we have ≥30 days of
 * `rate_snapshots` data we'll backfill `stableApyPct` history from the DB.
 */
export async function loadRealYieldSpread(): Promise<RealYieldResponse> {
  const [allPools, tBills] = await Promise.all([
    fetchAllYieldPools().catch(() => []),
    fetchFredSeries("TB4WK", 400).catch(() => [] as FredPoint[]),
  ])

  // Blended stablecoin supply APY = sum(supply_usd × apyBase) / sum(supply_usd)
  let weightedSum = 0
  let weightSum = 0
  for (const p of allPools) {
    if (p.chain !== "Ethereum") continue
    if (!isOurProject(p.project)) continue
    if (!STABLE_SYMBOLS.includes(p.symbol as (typeof STABLE_SYMBOLS)[number])) continue
    if (p.apyBase == null || !Number.isFinite(p.apyBase)) continue
    const w = p.totalSupplyUsd ?? p.tvlUsd ?? 0
    if (w <= 0) continue
    weightedSum += p.apyBase * w
    weightSum += w
  }
  const stableApyPct = weightSum > 0 ? weightedSum / weightSum : null

  // Carry-forward the T-bill series so weekend/holiday gaps don't break the chart.
  const sortedTBills = [...tBills].sort((a, b) => a.timestamp - b.timestamp)
  const history: RealYieldPoint[] = []
  let lastRate: number | null = null
  for (const pt of sortedTBills) {
    lastRate = pt.rate
    history.push({
      timestamp: pt.timestamp,
      stableApyPct,
      tBillPct: pt.rate,
      spreadPct: stableApyPct != null ? stableApyPct - pt.rate : null,
    })
  }

  return {
    current: {
      stableApyPct,
      tBillPct: lastRate,
      spreadPct: stableApyPct != null && lastRate != null ? stableApyPct - lastRate : null,
    },
    history,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
