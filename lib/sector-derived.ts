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

/** Month-over-month TVL change as a fraction (e.g. -0.123 = -12.3%).
 *  Uses the same MoM-window value that the headline TVL counter is already
 *  rendering — saves us redoing the lookup. Returns null when MoM data
 *  isn't available. */
export function tvlMomChangeFraction(d: OverviewResponse): number | null {
  const change = d.snapshot.tvlDeltas.changeMoM
  if (change === 0) return null
  const baseline = d.snapshot.totalTvl - change
  if (baseline <= 0) return null
  return change / baseline
}

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

/** Build a market-share-by-borrows daily series — each point is the % share
 *  of total active borrows held by each protocol that day. Sums to 100. */
export function marketShareByBorrowsSeries(
  borrowedSeries: OverviewTimeseriesPoint[],
): OverviewTimeseriesPoint[] {
  return borrowedSeries.map((pt) => {
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
