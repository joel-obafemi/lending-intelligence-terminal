"use client"

/**
 * Revenue page Verdict band — 3 dense cards leading the page with the
 * sector aggregates that anchor every other module beneath.
 *
 *   1. Sector fees 30d (with MoM delta)
 *   2. Sector capture rate (% of fees flowing to protocol+holders)
 *   3. Biggest mover (the protocol whose 30d fees moved most MoM)
 */

import { formatPercent, formatUSD } from "@/lib/utils"
import type { RevenueVerdict } from "@/lib/revenue-verdict"

interface Props {
  verdict: RevenueVerdict
}

export function RevenueVerdictStrip({ verdict }: Props) {
  const topMover =
    verdict.perProtocolMom.find((p) => p.changePct != null) ?? null
  const captureColor =
    verdict.sectorCaptureRate < 0.05
      ? "var(--accent-blue)"
      : verdict.sectorCaptureRate > 0.2
      ? "var(--accent-orange)"
      : "var(--accent-orange)"
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card
        label="Sector fees 30d"
        value={formatUSD(verdict.sectorFees30d)}
        delta={
          verdict.sectorMom.changePct != null
            ? formatDelta(verdict.sectorMom.changePct)
            : null
        }
        attribution={
          verdict.sectorMom.previous > 0
            ? `vs ${formatUSD(verdict.sectorMom.previous)} prior 30d`
            : "no prior window"
        }
        accent="var(--accent-orange)"
      />
      <Card
        label="Sector capture rate"
        value={formatPercent(verdict.sectorCaptureRate * 100, 1)}
        delta={null}
        attribution={`Depositors keep ${formatPercent((1 - verdict.sectorCaptureRate) * 100, 0)} · protocol+holders keep the rest`}
        accent={captureColor}
      />
      <Card
        label={
          topMover
            ? topMover.changePct != null && topMover.changePct >= 0
              ? "Biggest gainer"
              : "Biggest decliner"
            : "Biggest mover"
        }
        value={topMover ? topMover.name : "—"}
        delta={
          topMover && topMover.changePct != null
            ? formatDelta(topMover.changePct)
            : null
        }
        attribution={
          topMover
            ? `${formatUSD(topMover.current)} this 30d · ${formatUSD(topMover.previous)} prior`
            : "insufficient prior data"
        }
        accent={topMover?.color ?? "var(--accent-orange)"}
      />
    </div>
  )
}

function formatDelta(pct: number): { label: string; positive: boolean } {
  const positive = pct >= 0
  const sign = positive ? "+" : ""
  return { label: `${sign}${pct.toFixed(0)}%`, positive }
}

interface CardProps {
  label: string
  value: string
  delta: { label: string; positive: boolean } | null
  attribution: string
  accent: string
}

function Card({ label, value, delta, attribution, accent }: CardProps) {
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded p-4"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{
              color: delta.positive ? "var(--success)" : "var(--danger)",
            }}
          >
            {delta.label} MoM
          </span>
        )}
      </div>
      <div
        className="text-[11px] mt-0.5 truncate"
        style={{ color: "var(--text-muted)" }}
        title={attribution}
      >
        {attribution}
      </div>
    </div>
  )
}
