/**
 * Revenue page Verdict band — sector-wide aggregates + biggest-mover
 * detection, computed server-side from the data we already load.
 *
 * The strip leads the page with the 3 numbers worth caring about:
 *   1. Sector 30d fees + MoM delta
 *   2. Sector capture rate (what % of fees flow to protocol/holders
 *      across the four projects)
 *   3. Sector real-yield-adjacent number — biggest mover (the
 *      protocol whose 30d fees grew or shrank most MoM)
 *
 * The auto-line beneath the strip stitches these into one sentence
 * the way every other page does.
 */

import { PROTOCOLS } from "./protocols"
import type { OverviewResponse } from "./overview"
import type { RevenueDecompResponse } from "./revenue-decomp"

export interface SectorMomFees {
  /** Trailing-30d total fees across protocols (USD). */
  current: number
  /** Total fees in the prior 30-day window (the trailing 30 days
   *  ending one month ago), used to compute MoM. */
  previous: number
  /** (current − previous) / previous, percent. Null if previous is 0. */
  changePct: number | null
}

export interface RevenueVerdict {
  /** Sum of fees30d across the four protocols. */
  sectorFees30d: number
  /** Sector MoM change in fees, computed from the daily cumulative
   *  series (current 30d vs prior 30d). */
  sectorMom: SectorMomFees
  /** Fraction of gross sector fees flowing to protocol+holders, derived
   *  from the decomp window. */
  sectorCaptureRate: number
  /** Per-protocol MoM deltas, sorted by absolute change so the biggest
   *  mover is at index 0. */
  perProtocolMom: Array<{
    slug: string
    name: string
    color: string
    current: number
    previous: number
    changePct: number | null
    /** Sparkline series (last 30 days of daily fees) for the protocol's
     *  snapshot card. */
    sparkline: Array<{ timestamp: number; value: number }>
  }>
}

/** Compute (current 30d, prior 30d) fee totals from a cumulative-fees
 *  daily series. The cumulative series is monotonic by construction;
 *  we walk it in reverse to find each window's bounds. */
function computeWindowFees(
  cumulativeSeries: OverviewResponse["cumulativeFeesSeries"],
  slug: string,
): { current: number; previous: number } {
  if (cumulativeSeries.length === 0) return { current: 0, previous: 0 }
  const sorted = [...cumulativeSeries].sort((a, b) => a.timestamp - b.timestamp)
  const lastIdx = sorted.length - 1
  const last = sorted[lastIdx]
  const lastTs = last.timestamp
  const cutoffCurrent = lastTs - 30 * 86400
  const cutoffPrevious = lastTs - 60 * 86400

  function findCumAt(ts: number): number {
    // Find the most-recent cumulative reading at or before `ts`.
    for (let i = lastIdx; i >= 0; i--) {
      if (sorted[i].timestamp <= ts) {
        return (sorted[i][slug] as number) ?? 0
      }
    }
    return 0
  }

  const cumNow = (last[slug] as number) ?? 0
  const cumStartCurrent = findCumAt(cutoffCurrent)
  const cumStartPrevious = findCumAt(cutoffPrevious)
  return {
    current: Math.max(0, cumNow - cumStartCurrent),
    previous: Math.max(0, cumStartCurrent - cumStartPrevious),
  }
}

function buildSparkline(
  cumulativeSeries: OverviewResponse["cumulativeFeesSeries"],
  slug: string,
): Array<{ timestamp: number; value: number }> {
  if (cumulativeSeries.length < 2) return []
  const sorted = [...cumulativeSeries].sort((a, b) => a.timestamp - b.timestamp)
  const lastTs = sorted[sorted.length - 1].timestamp
  const cutoff = lastTs - 30 * 86400
  const out: Array<{ timestamp: number; value: number }> = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp < cutoff) continue
    const cur = (sorted[i][slug] as number) ?? 0
    const prev = (sorted[i - 1][slug] as number) ?? 0
    const daily = Math.max(0, cur - prev)
    out.push({ timestamp: sorted[i].timestamp, value: daily })
  }
  return out
}

export function computeRevenueVerdict(
  overview: OverviewResponse,
  decomp: RevenueDecompResponse,
): RevenueVerdict {
  const perProtocolMom = PROTOCOLS.map((p) => {
    const { current, previous } = computeWindowFees(
      overview.cumulativeFeesSeries,
      p.slug,
    )
    const changePct =
      previous > 0 ? ((current - previous) / previous) * 100 : null
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      current,
      previous,
      changePct,
      sparkline: buildSparkline(overview.cumulativeFeesSeries, p.slug),
    }
  })
  // Sort by abs(changePct) descending so consumers get the biggest mover
  // first; protocols with no comparable prior window fall to the end.
  const sortedByMover = [...perProtocolMom].sort((a, b) => {
    const av = a.changePct == null ? -1 : Math.abs(a.changePct)
    const bv = b.changePct == null ? -1 : Math.abs(b.changePct)
    return bv - av
  })

  const sectorFees30d = perProtocolMom.reduce((s, r) => s + r.current, 0)
  const sectorPrevious = perProtocolMom.reduce((s, r) => s + r.previous, 0)
  const sectorMom: SectorMomFees = {
    current: sectorFees30d,
    previous: sectorPrevious,
    changePct:
      sectorPrevious > 0
        ? ((sectorFees30d - sectorPrevious) / sectorPrevious) * 100
        : null,
  }

  const totalDecomp = decomp.protocols.reduce((s, r) => s + r.totalFees, 0)
  const captureUsd = decomp.protocols.reduce(
    (s, r) => s + r.protocolRevenue + r.holdersRevenue,
    0,
  )
  const sectorCaptureRate = totalDecomp > 0 ? captureUsd / totalDecomp : 0

  return {
    sectorFees30d,
    sectorMom,
    sectorCaptureRate,
    perProtocolMom: sortedByMover,
  }
}

