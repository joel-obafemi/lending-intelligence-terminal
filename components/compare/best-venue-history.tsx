"use client"

/**
 * Best Venue History stripe — Compare page module.
 *
 * Single horizontal colored timeline showing which protocol offered the
 * best supply APY on each day for the selected asset over the trailing
 * 12 months. Each day → one ~1-2px segment, colored by winner protocol.
 *
 * Beneath the stripe: a one-line readout that names how many of the
 * last 365 days each protocol led on. The chart is the "where has the
 * best yield been historically?" answer at a glance — different lens
 * from the per-protocol supply APY history above (which shows the
 * level), and from the dispersion chart below (which shows the gap).
 */

import { useMemo } from "react"
import { PROTOCOL_BY_SLUG, PROTOCOLS } from "@/lib/protocols"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import type { CompareSupplyHistoryPoint } from "@/lib/compare"

interface Props {
  symbol: string
  supplyHistory: CompareSupplyHistoryPoint[]
}

interface Segment {
  timestamp: number
  winner: string | null
  winnerApy: number
  runnerUpApy: number | null
}

function buildSegments(history: CompareSupplyHistoryPoint[]): Segment[] {
  const out: Segment[] = []
  for (const pt of history) {
    let winner: string | null = null
    let winnerApy = -Infinity
    let runnerUpApy: number | null = null
    for (const p of PROTOCOLS) {
      const v = pt[p.slug]
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      if (v > winnerApy) {
        runnerUpApy = winnerApy === -Infinity ? null : winnerApy
        winnerApy = v
        winner = p.slug
      } else if (runnerUpApy == null || v > runnerUpApy) {
        runnerUpApy = v
      }
    }
    if (winner == null || !Number.isFinite(winnerApy)) {
      // No data for this day; render a neutral gap segment so the
      // stripe stays continuous over the time axis.
      out.push({
        timestamp: pt.timestamp,
        winner: null,
        winnerApy: 0,
        runnerUpApy: null,
      })
      continue
    }
    out.push({ timestamp: pt.timestamp, winner, winnerApy, runnerUpApy })
  }
  return out
}

function fmtDateShort(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function BestVenueHistory({ symbol, supplyHistory }: Props) {
  const segments = useMemo(() => buildSegments(supplyHistory), [supplyHistory])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of PROTOCOLS) c[p.slug] = 0
    for (const s of segments) if (s.winner) c[s.winner] = (c[s.winner] ?? 0) + 1
    return c
  }, [segments])

  if (segments.length < 30) {
    return (
      <div
        className="tui-card bg-card-bg border border-card-border rounded p-6 text-[11px] text-center"
        style={{ color: "var(--text-muted)" }}
      >
        Best Venue History accumulates as cross-protocol supply data
        builds up for {symbol}.
      </div>
    )
  }

  const totalDays = segments.length
  const ranked = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    days: counts[p.slug] ?? 0,
  })).sort((a, b) => b.days - a.days)
  const startTs = segments[0].timestamp
  const endTs = segments[segments.length - 1].timestamp

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {symbol} · Best Supply Venue History · 12 months
          <MethodologyTooltip methodologyKey="compare-best-venue-history" />
        </span>
        <span
          className="text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "var(--text-muted)" }}
        >
          one segment per day · {totalDays} days
        </span>
      </div>
      {/* Stripe — flexbox with proportional widths so the visual length
          matches the number of days won. Tooltip on each segment reveals
          the protocol + that day's leading APY. */}
      <div className="px-4 pt-4 pb-2">
        <div
          className="flex w-full overflow-hidden rounded"
          style={{ height: "20px", border: "1px solid var(--card-border)" }}
        >
          {segments.map((s, i) => {
            const cfg = s.winner ? PROTOCOL_BY_SLUG[s.winner] : null
            const bg = cfg?.color ?? "var(--card-hover)"
            const title = s.winner
              ? `${fmtDateShort(s.timestamp)} · ${cfg?.name ?? s.winner} ${s.winnerApy.toFixed(2)}%${
                  s.runnerUpApy != null
                    ? ` (runner-up ${s.runnerUpApy.toFixed(2)}%)`
                    : ""
                }`
              : `${fmtDateShort(s.timestamp)} · no data`
            return (
              <div
                key={i}
                title={title}
                style={{
                  flex: "1 1 auto",
                  background: bg,
                  opacity: cfg ? 0.85 : 0.25,
                }}
              />
            )
          })}
        </div>
        {/* Date axis — only label start / mid / end so the stripe stays clean. */}
        <div
          className="flex items-center justify-between mt-1 text-[10px] tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          <span>{fmtDateShort(startTs)}</span>
          <span>{fmtDateShort(segments[Math.floor(segments.length / 2)].timestamp)}</span>
          <span>{fmtDateShort(endTs)}</span>
        </div>
      </div>
      {/* Per-protocol days-led readout. Always renders all 4 protocols so a
          "0 days" entry is informative ("Spark never led on this asset"). */}
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 pt-1 text-[11px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {ranked.map((r) => (
          <div key={r.slug} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span style={{ color: r.color }}>{r.name}</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {r.days}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              of {totalDays}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
