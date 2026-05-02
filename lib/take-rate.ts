/**
 * Take Rate Comparison — Section 5 derivative metric.
 *
 * Per-protocol annualized Rev/TVL over time, computed on a trailing
 * 30-day rolling basis so the line is smooth enough to read but still
 * responsive to recent shifts. The headline number on each per-protocol
 * card already shows this for "today"; this module plots it historically
 * so a reader can see who's becoming more or less efficient with
 * depositor capital.
 *
 *   take_rate_pct(t) = (sum daily fees [t-30, t]) ÷ tvl(t) × (365 / 30) × 100
 *
 * Inputs come from the Overview response we already load:
 *  - `cumulativeFeesSeries` — daily cumulative fees per protocol (we
 *    diff to recover daily fees).
 *  - `tvlSeries` — daily Available Liquidity per protocol (the
 *    denominator). Reads as "what % of the deposit base is the
 *    protocol earning per year".
 */

import { PROTOCOLS } from "./protocols"
import type { OverviewTimeseriesPoint, OverviewResponse } from "./overview"

const ROLLING_WINDOW_DAYS = 30
/** Default chart window (~12 months) — caller can override. */
const DEFAULT_HISTORY_DAYS = 365

export interface TakeRatePoint {
  /** Unix seconds (UTC midnight). */
  timestamp: number
  /** Per-protocol annualized take rate, percent. Missing slug = no data. */
  [protocolSlug: string]: number
}

/** Build a daily {timestamp, [slug]: dailyFees} series by differencing
 *  the cumulative fees series (which is monotonic by construction). */
function buildDailyFeesFromCumulative(
  cumulative: OverviewTimeseriesPoint[],
): OverviewTimeseriesPoint[] {
  if (cumulative.length === 0) return []
  const out: OverviewTimeseriesPoint[] = []
  for (let i = 0; i < cumulative.length; i++) {
    const cur = cumulative[i]
    const point: OverviewTimeseriesPoint = { timestamp: cur.timestamp }
    if (i === 0) {
      // First day: we can't difference, so leave fees at 0 (the pre-first-day
      // history isn't part of our window anyway).
      for (const p of PROTOCOLS) point[p.slug] = 0
    } else {
      const prev = cumulative[i - 1]
      for (const p of PROTOCOLS) {
        const c = (cur[p.slug] as number) ?? 0
        const pPrev = (prev[p.slug] as number) ?? 0
        const delta = c - pPrev
        // Cumulative fee streams should be monotone; tiny negatives from
        // rounding get clamped to zero rather than poisoning the rolling sum.
        point[p.slug] = delta > 0 ? delta : 0
      }
    }
    out.push(point)
  }
  return out
}

/** Build a TVL-by-day map for fast lookup. Missing days are linearly
 *  filled by carrying the last observed value forward. */
function buildTvlLookup(
  tvlSeries: OverviewTimeseriesPoint[],
): Map<number, OverviewTimeseriesPoint> {
  const map = new Map<number, OverviewTimeseriesPoint>()
  for (const pt of tvlSeries) map.set(pt.timestamp, pt)
  return map
}

/**
 * Compute the daily trailing-30d annualized take rate per protocol.
 *
 * Returned series is aligned to the cumulative-fees timestamps and
 * trimmed to the trailing `historyDays` (default 365). Days where TVL
 * is missing produce 0 for that protocol; days before there's a full
 * 30-day window are dropped (the rolling sum would be biased).
 */
export function buildTakeRateSeries(
  overview: OverviewResponse,
  historyDays = DEFAULT_HISTORY_DAYS,
): TakeRatePoint[] {
  const dailyFees = buildDailyFeesFromCumulative(overview.cumulativeFeesSeries)
  const tvlLookup = buildTvlLookup(overview.tvlSeries)
  if (dailyFees.length < ROLLING_WINDOW_DAYS) return []

  // Trailing-30d rolling sum per protocol. We walk forward; at each
  // index `i ≥ ROLLING_WINDOW_DAYS - 1` the rolling window covers days
  // [i - 29, i]. The protocol's annualized take rate at day i =
  //   (window sum) / tvl(day i) × 365/30 × 100.
  const series: TakeRatePoint[] = []
  const rolling: Record<string, number> = Object.fromEntries(
    PROTOCOLS.map((p) => [p.slug, 0]),
  )
  const cutoff = Math.floor(Date.now() / 1000) - historyDays * 86400
  for (let i = 0; i < dailyFees.length; i++) {
    const cur = dailyFees[i]
    for (const p of PROTOCOLS) {
      rolling[p.slug] += (cur[p.slug] as number) ?? 0
      if (i >= ROLLING_WINDOW_DAYS) {
        const drop = dailyFees[i - ROLLING_WINDOW_DAYS]
        rolling[p.slug] -= (drop[p.slug] as number) ?? 0
      }
    }
    if (i < ROLLING_WINDOW_DAYS - 1) continue
    if (cur.timestamp < cutoff) continue
    const tvlPoint = tvlLookup.get(cur.timestamp)
    if (!tvlPoint) continue
    const point: TakeRatePoint = { timestamp: cur.timestamp }
    for (const p of PROTOCOLS) {
      const tvl = (tvlPoint[p.slug] as number) ?? 0
      if (tvl <= 0) continue
      const annualized = ((rolling[p.slug] / tvl) * 365) / ROLLING_WINDOW_DAYS
      // Sanity ceiling — anything above 50% reads as a data artefact
      // (cumulative-fees discontinuity, TVL near zero) rather than a
      // real take rate. Drop the point so the line doesn't spike.
      if (Number.isFinite(annualized) && annualized > 0 && annualized < 0.5) {
        point[p.slug] = annualized * 100
      }
    }
    series.push(point)
  }
  return series
}
