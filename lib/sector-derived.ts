/**
 * Derived metrics for the Sector Overview Week-2 layout.
 *
 * Pure helpers over an `OverviewResponse` payload — no I/O, so they run on
 * the server during SSR. Centralising here keeps `app/page.tsx` shape-only
 * and makes the same numbers reusable on /reports later.
 */
import { PROTOCOLS } from "./protocols"
import type {
  OverviewResponse,
  OverviewTimeseriesPoint,
} from "./overview"

/** Last-30d sum of a per-protocol daily timeseries, returned per slug. */
function sumLast30Days(
  series: OverviewTimeseriesPoint[],
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(
    PROTOCOLS.map((p) => [p.slug, 0]),
  )
  if (series.length === 0) return out
  const lastTs = series[series.length - 1].timestamp
  const cutoff = lastTs - 30 * 86400
  for (const pt of series) {
    if (pt.timestamp < cutoff) continue
    for (const p of PROTOCOLS) {
      out[p.slug] += (pt[p.slug] as number) || 0
    }
  }
  return out
}

/** 30-day net deposit per protocol — derived from the weekly net-flow series.
 *  Sums the most recent ~4 weeks (≤30 days) so we get a clean trailing-month
 *  number without exposing daily flows from the data layer. */
export function netDeposits30dByProtocol(
  weeklyFlows: OverviewTimeseriesPoint[],
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(
    PROTOCOLS.map((p) => [p.slug, 0]),
  )
  if (weeklyFlows.length === 0) return out
  const lastTs = weeklyFlows[weeklyFlows.length - 1].timestamp
  const cutoff = lastTs - 30 * 86400
  for (const pt of weeklyFlows) {
    if (pt.timestamp < cutoff) continue
    for (const p of PROTOCOLS) {
      out[p.slug] += (pt[p.slug] as number) || 0
    }
  }
  return out
}

/** 30-day interest accrual per protocol — sum of dailyUserFees (or fallback)
 *  over the trailing 30 days. */
export function interestAccrual30dByProtocol(
  dailyInterest: OverviewTimeseriesPoint[],
): Record<string, number> {
  return sumLast30Days(dailyInterest)
}

/** Sector take rate (%): annualized revenue ÷ TVL.
 *  fees30d × (365 / 30) ÷ TVL × 100. */
export function sectorTakeRatePct(d: OverviewResponse): number {
  const fees30d = d.revenueSnapshot.reduce((s, r) => s + (r.fees30d || 0), 0)
  if (d.snapshot.totalTvl <= 0) return 0
  return (fees30d * (365 / 30) / d.snapshot.totalTvl) * 100
}

/** Sector utilization (%): total borrows ÷ total supplied. */
export function sectorUtilizationPct(d: OverviewResponse): number {
  if (d.snapshot.totalSupplied <= 0) return 0
  return (d.snapshot.totalBorrowed / d.snapshot.totalSupplied) * 100
}

/** Month-over-month total-supplied change as a fraction (e.g. -0.123 =
 *  -12.3%). Uses the same MoM-window value the Total Supply counter
 *  renders. Returns null when the lookup didn't find a baseline.
 *
 *  We use Total Supplied (TVL + active borrows) here — NOT DefiLlama's
 *  net-liquidity TVL — because the Verdict sentence claims the system
 *  is "up/down X% MoM", and a moving borrow book inverts the net-liquidity
 *  signal. With a stable supply but rising borrows, net liquidity falls
 *  even though no capital left. Total supply is the right denominator. */
export function suppliedMomChangeFraction(d: OverviewResponse): number | null {
  const change = d.snapshot.suppliedDeltas.changeMoM
  if (change === 0) return null
  const baseline = d.snapshot.totalSupplied - change
  if (baseline <= 0) return null
  return change / baseline
}

/** @deprecated Use suppliedMomChangeFraction. The Sector Verdict band now
 *  reports total-supplied MoM rather than net-liquidity MoM (the latter
 *  was misleading because it inverts when borrow demand rises). */
export const tvlMomChangeFraction = suppliedMomChangeFraction

/** Identify the protocol with the largest absolute net-deposit move over the
 *  trailing 30 days. Returns null when there's nothing meaningful to report
 *  (all values < $5M absolute, the noise floor). */
export function biggestMover(
  netDeps: Record<string, number>,
): { slug: string; name: string; usd: number } | null {
  let best: { slug: string; usd: number } | null = null
  for (const p of PROTOCOLS) {
    const v = netDeps[p.slug] ?? 0
    if (Math.abs(v) < 5_000_000) continue
    if (!best || Math.abs(v) > Math.abs(best.usd)) {
      best = { slug: p.slug, usd: v }
    }
  }
  if (!best) return null
  const cfg = PROTOCOLS.find((p) => p.slug === best!.slug)!
  return { slug: cfg.slug, name: cfg.name, usd: best.usd }
}

/** Build a market-share daily series for any per-protocol value series. Each
 *  point becomes the % share of the cross-protocol total at that timestamp.
 *  Sums to 100 per row. Used by the Hero chart toggle (Borrows / Supply /
 *  Available Liquidity). */
export function marketShareSeries(
  series: OverviewTimeseriesPoint[],
): OverviewTimeseriesPoint[] {
  return series.map((pt) => {
    const total = PROTOCOLS.reduce(
      (s, p) => s + ((pt[p.slug] as number) || 0),
      0,
    )
    const out: OverviewTimeseriesPoint = { timestamp: pt.timestamp }
    for (const p of PROTOCOLS) {
      const v = (pt[p.slug] as number) || 0
      out[p.slug] = total > 0 ? (v / total) * 100 : 0
    }
    return out
  })
}

/** @deprecated Use marketShareSeries — that variant works on any per-protocol
 *  value series, not just borrows. Kept as an alias so the Phase E Week 2
 *  page.tsx call site doesn't break before the rebuild. */
export const marketShareByBorrowsSeries = marketShareSeries

// ─────────────────────────────────────────────────────────────────────────
// Daily-series helpers used by the Verdict-strip sparklines.
// ─────────────────────────────────────────────────────────────────────────

interface DailySeriesPoint {
  timestamp: number
  value: number
}

/** Sum a per-protocol series across all PROTOCOLS at every timestamp. */
function sumProtocolsSeries(
  series: OverviewTimeseriesPoint[],
): DailySeriesPoint[] {
  return series.map((pt) => {
    let v = 0
    for (const p of PROTOCOLS) v += (pt[p.slug] as number) || 0
    return { timestamp: pt.timestamp, value: v }
  })
}

/** Daily sector-wide utilization (%) = total borrowed / total supplied,
 *  computed by zipping the supplied + borrowed series on shared timestamps. */
export function sectorUtilizationDailySeries(
  d: OverviewResponse,
): DailySeriesPoint[] {
  const borrowedByTs = new Map<number, number>()
  for (const pt of d.borrowedSeries) {
    let v = 0
    for (const p of PROTOCOLS) v += (pt[p.slug] as number) || 0
    borrowedByTs.set(pt.timestamp, v)
  }
  const out: DailySeriesPoint[] = []
  for (const pt of d.supplySeries) {
    let supplied = 0
    for (const p of PROTOCOLS) supplied += (pt[p.slug] as number) || 0
    if (supplied <= 0) continue
    const borrowed = borrowedByTs.get(pt.timestamp) ?? 0
    out.push({ timestamp: pt.timestamp, value: (borrowed / supplied) * 100 })
  }
  return out
}

/** Closest-to-target lookup over a daily series (used for MoM / YoY windows). */
function valueAtNearest(
  series: DailySeriesPoint[],
  targetTs: number,
  toleranceSec: number,
): number | null {
  let best: DailySeriesPoint | undefined
  let bestDist = Infinity
  for (const pt of series) {
    const d = Math.abs(pt.timestamp - targetTs)
    if (d < bestDist && d <= toleranceSec) {
      best = pt
      bestDist = d
    }
  }
  return best ? best.value : null
}

/** Multi-window deltas for a generic daily series — change from latest vs
 *  the value 24h / 30d / 365d ago, plus the trailing-30-day sparkline. The
 *  shape matches the existing `DeltaTriple` so it slots into MetricCard. */
export interface DailyDeltaTriple {
  current: number
  change24h: number
  changeMoM: number
  changeYoY: number
  sparkline: Array<{ timestamp: number; value: number }>
}

export function buildDailyDeltaTriple(
  series: DailySeriesPoint[],
): DailyDeltaTriple {
  if (series.length === 0) {
    return { current: 0, change24h: 0, changeMoM: 0, changeYoY: 0, sparkline: [] }
  }
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp)
  const latest = sorted[sorted.length - 1]
  const v24 = valueAtNearest(sorted, latest.timestamp - 86400, 2 * 86400)
  const vMoM = valueAtNearest(sorted, latest.timestamp - 30 * 86400, 4 * 86400)
  const vYoY = valueAtNearest(sorted, latest.timestamp - 365 * 86400, 14 * 86400)
  const sparkCutoff = latest.timestamp - 30 * 86400
  const sparkline = sorted
    .filter((p) => p.timestamp >= sparkCutoff)
    .map((p) => ({ timestamp: p.timestamp, value: p.value }))
  return {
    current: latest.value,
    change24h: v24 != null ? latest.value - v24 : 0,
    changeMoM: vMoM != null ? latest.value - vMoM : 0,
    changeYoY: vYoY != null ? latest.value - vYoY : 0,
    sparkline,
  }
}

/** Hero chart needs ~24-month per-protocol series for each of three
 *  lenses (borrows / supply / available liquidity). The data layer
 *  already produces all three at daily resolution; we just normalize to
 *  market-share % using `marketShareSeries`. */
export interface HeroLensData {
  /** Each lens's pre-normalized share series (sums to 100% per day). */
  borrowsShare: OverviewTimeseriesPoint[]
  supplyShare: OverviewTimeseriesPoint[]
  availableShare: OverviewTimeseriesPoint[]
  /** 12-month delta in pp share for the dominant protocol — used for the
   *  Hero chart's auto insight line. */
  insight: HeroInsight | null
}

export interface HeroInsight {
  topProtocolSlug: string
  topProtocolName: string
  topSharePct: number
  yoyDeltaPp: number | null
  /** Protocol that gained the most share over 12 months (could be the same). */
  gainerSlug: string
  gainerName: string
  gainerYoyPp: number | null
}

/** Build the lens series + an insight derived from the borrows-share series
 *  (the canonical Hero default). Insight returns null if the series is too
 *  short to compute YoY. */
export function buildHeroLenses(d: OverviewResponse): HeroLensData {
  const borrowsShare = marketShareSeries(d.borrowedSeries)
  const supplyShare = marketShareSeries(d.supplySeries)
  const availableShare = marketShareSeries(d.tvlSeries)
  const insight = buildHeroInsight(borrowsShare)
  return { borrowsShare, supplyShare, availableShare, insight }
}

function buildHeroInsight(
  shareSeries: OverviewTimeseriesPoint[],
): HeroInsight | null {
  if (shareSeries.length === 0) return null
  const last = shareSeries[shareSeries.length - 1]
  // YoY = same row 365d earlier (±14d tolerance), per protocol.
  const targetTs = last.timestamp - 365 * 86400
  let yoy: OverviewTimeseriesPoint | undefined
  let bestDist = Infinity
  for (const pt of shareSeries) {
    const d = Math.abs(pt.timestamp - targetTs)
    if (d < bestDist && d <= 14 * 86400) {
      bestDist = d
      yoy = pt
    }
  }

  let topSlug: string | null = null
  let topShare = -Infinity
  let topYoyPp: number | null = null
  let gainerSlug: string | null = null
  let gainerYoyPp = -Infinity
  for (const p of PROTOCOLS) {
    const cur = (last[p.slug] as number) ?? 0
    if (cur > topShare) {
      topShare = cur
      topSlug = p.slug
    }
    if (yoy) {
      const old = (yoy[p.slug] as number) ?? 0
      const delta = cur - old
      if (p.slug === topSlug) topYoyPp = cur - old
      if (delta > gainerYoyPp) {
        gainerYoyPp = delta
        gainerSlug = p.slug
      }
    }
  }
  if (!topSlug) return null
  // Recompute topYoyPp against the final topSlug (the loop may have set it
  // before the final winner was known).
  if (yoy) {
    const old = (yoy[topSlug] as number) ?? 0
    topYoyPp = topShare - old
  }
  const topCfg = PROTOCOLS.find((p) => p.slug === topSlug)!
  const gainerCfg = gainerSlug ? PROTOCOLS.find((p) => p.slug === gainerSlug)! : topCfg
  return {
    topProtocolSlug: topSlug,
    topProtocolName: topCfg.name,
    topSharePct: topShare,
    yoyDeltaPp: yoy ? topYoyPp : null,
    gainerSlug: gainerCfg.slug,
    gainerName: gainerCfg.name,
    gainerYoyPp: yoy ? gainerYoyPp : null,
  }
}

// `sumProtocolsSeries` reserved for future per-protocol sparkline work
// (Composition strip's per-card sparkline was dropped from this iteration to
// keep the diff small). Re-export silently below to avoid an unused warning.
export { sumProtocolsSeries }
