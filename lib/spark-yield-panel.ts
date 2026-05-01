/**
 * Spark Stablecoin Yield Panel — data layer.
 *
 * Surfaces the captured-yield story that's specific to Spark:
 *
 *   - Sky Savings Rate (SSR) — the rate USDS staked into Sky's sUSDS
 *     savings vault earns. We pick this up from DefiLlama Yields with
 *     `project: "sky-lend" | "sky-savings"` and the largest matching
 *     pool's `apyBase`. When DefiLlama hasn't indexed Sky directly we
 *     fall back to null and the chart drops the SSR line cleanly.
 *
 *   - sUSDS APY on Spark — the rate Spark depositors actually earn for
 *     parking USDS in the Spark sUSDS market.
 *
 *   - 4-week T-bill — the risk-free benchmark the spread reads against.
 *     Same FRED series the Sector page already uses.
 *
 * The "wedge between SSR and sUSDS-on-Spark" is the entire Spark business
 * model. A reader who sees the three lines side by side gets the captured-
 * spread story without prose.
 */
import { fetchAllYieldPools, fetchYieldChart, type YieldPool } from "./defillama"
import { fetchFredSeries, type FredPoint } from "./fred"
import { YIELDS_PROJECT_BY_PROTOCOL } from "./rates"

export interface YieldPanelPoint {
  timestamp: number
  /** Sky Savings Rate %; null when DefiLlama hasn't indexed it yet. */
  ssrPct: number | null
  /** sUSDS supply APY on Spark %; null when missing. */
  susdsSparkPct: number | null
  /** 4-week T-bill rate %; carried forward across weekend gaps. */
  tBillPct: number | null
}

export interface SparkYieldPanelResponse {
  history: YieldPanelPoint[]
  current: {
    ssrPct: number | null
    susdsSparkPct: number | null
    tBillPct: number | null
    /** sUSDS APY on Spark minus T-bill, in pp. */
    sparkSpreadPct: number | null
    /** Sky → Spark passthrough loss in pp (SSR − Spark APY). Positive
     *  means Spark depositors earn less than direct SSR; negative is
     *  unusual and would warrant investigation. Null when SSR missing. */
    skyToSparkLossPct: number | null
  }
  fetchedAt: number
}

/** Heuristic project-string match for Sky Savings Rate on DefiLlama Yields. */
const SKY_PROJECT_CANDIDATES = ["sky-lend", "sky-savings", "sky", "sky-money", "makerdao"] as const

function pickLargestMatch(
  pools: YieldPool[],
  projects: readonly string[],
  symbols: readonly string[],
): YieldPool | null {
  const symSet = new Set(symbols.map((s) => s.toUpperCase()))
  const candidates = pools.filter(
    (p) =>
      p.chain === "Ethereum" &&
      projects.includes(p.project) &&
      symSet.has(p.symbol.toUpperCase()) &&
      p.apyBase != null,
  )
  if (candidates.length === 0) return null
  return candidates.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  )
}

export async function loadSparkYieldPanel(): Promise<SparkYieldPanelResponse> {
  const [pools, tBills] = await Promise.all([
    fetchAllYieldPools().catch(() => [] as YieldPool[]),
    fetchFredSeries("TB4WK", 400).catch(() => [] as FredPoint[]),
  ])

  const ssrPool = pickLargestMatch(pools, SKY_PROJECT_CANDIDATES, ["USDS", "SUSDS", "DAI", "SDAI"])
  const sparkProjects = YIELDS_PROJECT_BY_PROTOCOL["spark"] ?? ["spark", "sparklend"]
  const sparkPool = pickLargestMatch(pools, sparkProjects, ["SUSDS", "USDS"])

  // Pull historical APY for both pools in parallel. Failure on either
  // collapses cleanly to a null line in the chart.
  const [ssrChart, sparkChart] = await Promise.all([
    ssrPool
      ? fetchYieldChart(ssrPool.pool).catch(() => [])
      : Promise.resolve([]),
    sparkPool
      ? fetchYieldChart(sparkPool.pool).catch(() => [])
      : Promise.resolve([]),
  ])

  // Carry-forward T-bill across weekends so the chart line stays continuous.
  const sortedTBills = [...tBills].sort((a, b) => a.timestamp - b.timestamp)

  // Build a unified daily series indexed by timestamp. We use the union of
  // all three sources' timestamps so each line spans its own data, with
  // gaps where a source doesn't have a sample.
  const byTs = new Map<number, YieldPanelPoint>()
  const seed = (ts: number): YieldPanelPoint => {
    const existing = byTs.get(ts)
    if (existing) return existing
    const fresh: YieldPanelPoint = {
      timestamp: ts,
      ssrPct: null,
      susdsSparkPct: null,
      tBillPct: null,
    }
    byTs.set(ts, fresh)
    return fresh
  }
  for (const pt of ssrChart) {
    if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue
    seed(pt.timestamp).ssrPct = pt.apyBase
  }
  for (const pt of sparkChart) {
    if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue
    seed(pt.timestamp).susdsSparkPct = pt.apyBase
  }
  let lastTbill: number | null = null
  for (const pt of sortedTBills) {
    lastTbill = pt.rate
    seed(pt.timestamp).tBillPct = pt.rate
  }

  // Walk the timeline once forward and carry-forward T-bill across gaps so
  // the chart's tBill line stays continuous through weekends and holidays.
  const history = [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
  let carry: number | null = null
  for (const row of history) {
    if (row.tBillPct != null) {
      carry = row.tBillPct
    } else if (carry != null) {
      row.tBillPct = carry
    }
  }

  // Current snapshot: pick the most recent value of each line that exists.
  const lastSsr = [...history].reverse().find((p) => p.ssrPct != null)?.ssrPct ?? null
  const lastSpark = [...history].reverse().find((p) => p.susdsSparkPct != null)?.susdsSparkPct ?? null
  const lastTbillVal = lastTbill ?? history.at(-1)?.tBillPct ?? null

  return {
    history,
    current: {
      ssrPct: lastSsr,
      susdsSparkPct: lastSpark,
      tBillPct: lastTbillVal,
      sparkSpreadPct:
        lastSpark != null && lastTbillVal != null ? lastSpark - lastTbillVal : null,
      skyToSparkLossPct:
        lastSsr != null && lastSpark != null ? lastSsr - lastSpark : null,
    },
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
