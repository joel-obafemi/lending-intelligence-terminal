/**
 * Server-side auto insight sentence for the Rate Monitor.
 *
 * One short paragraph generated from the matrix + KPIs + spread history.
 * The sentence is the screenshot a KOL drops on X — keep it punchy,
 * data-rich, and avoid hedge words.
 */

import type { RateMatrixCell } from "./rates"
import type { RateKpis } from "./rates-kpi"

export interface RatesInsightInput {
  kpis: RateKpis
  /** Latest spread (percent, can be negative). Null when no data. */
  realYieldSpreadPct: number | null
  /** Series of daily real-yield-spread points (≈18 months). Used to
   *  identify whether the spread is at a recent extreme. */
  realYieldSpreadHistory: Array<{
    timestamp: number
    spreadPct: number | null
  }>
}

const MAX_LOOKBACK_DAYS = 540

/** Return one or two sentences keyed off the spread + dispersion. */
export function ratesInsightSentence(input: RatesInsightInput): string | null {
  const { realYieldSpreadPct, realYieldSpreadHistory, kpis } = input
  const parts: string[] = []

  if (realYieldSpreadPct != null) {
    const verdict =
      realYieldSpreadPct >= 0
        ? `${(realYieldSpreadPct * 100).toFixed(0)} bps over 4-week T-bills`
        : `${Math.abs(realYieldSpreadPct * 100).toFixed(0)} bps below 4-week T-bills`
    const extreme = describeSpreadExtreme(
      realYieldSpreadPct,
      realYieldSpreadHistory,
    )
    parts.push(
      `Stablecoin lenders are earning ${verdict}${extreme ? `, ${extreme}` : ""}.`,
    )
  }

  if (kpis.stableDispersion && kpis.stableDispersion.spreadPct >= 0.1) {
    const d = kpis.stableDispersion
    parts.push(
      `Widest stablecoin rate dispersion: ${d.asset}, where ${d.topProtocolName} pays ${(d.spreadPct * 100).toFixed(0)} bps more than ${d.bottomProtocolName} (${d.topApyPct.toFixed(2)}% vs ${d.bottomApyPct.toFixed(2)}%).`,
    )
  } else if (kpis.bestSupply && kpis.bestBorrow) {
    parts.push(
      `Best supply: ${kpis.bestSupply.asset} at ${kpis.bestSupply.value.toFixed(2)}% on ${kpis.bestSupply.protocolName}. Best borrow: ${kpis.bestBorrow.asset} at ${kpis.bestBorrow.value.toFixed(2)}% on ${kpis.bestBorrow.protocolName}.`,
    )
  }

  if (parts.length === 0) return null
  return parts.join(" ")
}

/** Compare today's spread against the rolling history window. Returns a
 *  prose phrase ("the tightest in 4 months", "near a 12-month high") or
 *  null when the data is too thin to characterize. */
function describeSpreadExtreme(
  current: number,
  history: Array<{ timestamp: number; spreadPct: number | null }>,
): string | null {
  if (history.length < 30) return null
  // Trim history to the lookback window.
  const cutoff =
    Math.floor(Date.now() / 1000) - MAX_LOOKBACK_DAYS * 86400
  const window = history.filter(
    (p) =>
      p.timestamp >= cutoff &&
      p.spreadPct != null &&
      Number.isFinite(p.spreadPct),
  )
  if (window.length < 30) return null

  let min = Infinity
  let max = -Infinity
  let minTs = 0
  let maxTs = 0
  for (const p of window) {
    if ((p.spreadPct as number) < min) {
      min = p.spreadPct as number
      minTs = p.timestamp
    }
    if ((p.spreadPct as number) > max) {
      max = p.spreadPct as number
      maxTs = p.timestamp
    }
  }
  // Tightness check — within 5% of the observed minimum spread, AND that
  // minimum was at least 30 days ago (otherwise we're at the start of
  // the window, no real story).
  const range = max - min
  if (range <= 0) return null
  const nearLow = (current - min) / range < 0.05
  const nearHigh = (max - current) / range < 0.05
  const nowTs = window[window.length - 1].timestamp
  if (nearLow && nowTs - minTs > 30 * 86400) {
    return `the tightest spread in ${describeMonthsBack(nowTs, minTs)}`
  }
  if (nearHigh && nowTs - maxTs > 30 * 86400) {
    return `near the widest spread in ${describeMonthsBack(nowTs, maxTs)}`
  }
  return null
}

function describeMonthsBack(now: number, then: number): string {
  const months = Math.max(1, Math.round((now - then) / (30 * 86400)))
  if (months >= 12) {
    const years = Math.round(months / 12)
    return years === 1 ? "a year" : `${years} years`
  }
  return `${months} ${months === 1 ? "month" : "months"}`
}
