/**
 * Market Spike Callout — surfaces a one-line "watch this" framing when the
 * current supply or borrow APY has run materially above its 30-day mean.
 *
 * Trigger thresholds:
 *   - Supply APY ≥ 30d mean + 100 bps  → "elevated"
 *   - Supply APY ≥ 30d mean + 250 bps  → "heavily elevated" (different lede)
 *   - High utilization (≥95%) is folded in as a secondary phrase since it's
 *     the typical mechanical cause of a supply-APY spike.
 *
 * Renders nothing when the spread is ≤100 bps or the 30d mean isn't
 * available — most markets sit quiet most of the time and a callout that
 * appears every visit becomes background noise.
 */

import { Zap } from "lucide-react"
import { formatPercent } from "@/lib/utils"

interface Props {
  asset: string
  protocolName: string
  supplyApy: number | null
  /** DefiLlama-published 30-day mean of supply APY. */
  supplyApy30d: number | null
  /** Live utilization 0-100. */
  utilizationPct: number | null
}

const ELEVATED_BPS = 100  // 1.00 pp above 30d mean
const HEAVILY_ELEVATED_BPS = 250  // 2.50 pp above

export function MarketSpikeCallout({
  asset,
  protocolName,
  supplyApy,
  supplyApy30d,
  utilizationPct,
}: Props) {
  if (
    supplyApy == null ||
    supplyApy30d == null ||
    !Number.isFinite(supplyApy) ||
    !Number.isFinite(supplyApy30d)
  ) {
    return null
  }
  const spreadPp = supplyApy - supplyApy30d
  const spreadBps = Math.round(spreadPp * 100)
  if (spreadBps < ELEVATED_BPS) return null

  const heavilyElevated = spreadBps >= HEAVILY_ELEVATED_BPS
  const tone = heavilyElevated ? "warn" : "info"
  const accent = tone === "warn" ? "var(--accent-yellow)" : "var(--accent-blue)"
  const bg =
    tone === "warn"
      ? "rgba(217, 119, 6, 0.08)"
      : "rgba(59, 95, 224, 0.08)"
  const border =
    tone === "warn"
      ? "rgba(217, 119, 6, 0.30)"
      : "rgba(59, 95, 224, 0.30)"

  // Build the takeaway. The lede frames the move ("elevated" vs "heavily
  // elevated"); secondary clauses surface utilization context when high
  // and the conventional next-step language ("watch for X").
  const ledeVerb = heavilyElevated ? "is heavily elevated" : "is elevated"
  const utilHigh = utilizationPct != null && utilizationPct >= 95
  const utilMed = utilizationPct != null && utilizationPct >= 80 && utilizationPct < 95
  const utilPhrase = utilHigh
    ? ` Utilization at ${formatPercent(utilizationPct!, 1)} has the rate at the kink.`
    : utilMed
    ? ` Utilization sits at ${formatPercent(utilizationPct!, 1)}, near the kink.`
    : ""
  const tail = utilHigh
    ? " Watch for either a borrow unwind or a supply-cap increase."
    : ""

  const text =
    `${asset} supply rate on ${protocolName} ${ledeVerb}: +${spreadBps} bps vs the 30-day average of ${formatPercent(supplyApy30d, 2)}.${utilPhrase}${tail}`

  return (
    <div
      className="rounded p-3 flex items-start gap-3"
      style={{
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      <span style={{ color: accent, flexShrink: 0, marginTop: 1 }}>
        <Zap size={14} strokeWidth={2.25} />
      </span>
      <div className="flex flex-col gap-1">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: accent }}
        >
          {heavilyElevated ? "Rate spike" : "Elevated rate"}
        </span>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {text}
        </p>
      </div>
    </div>
  )
}
