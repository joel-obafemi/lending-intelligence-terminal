"use client"

/**
 * Market Cross-Protocol Rate Chart — answers "where has the best supply
 * yield for this asset been over the last 90 days?".
 *
 * One line per protocol that lists the asset, all on the same axes. The
 * current protocol's line uses its full brand color; siblings use a
 * faded variant so the reader's visual focus stays on the market they
 * came from.
 *
 * Borrow APY isn't included here — DefiLlama's free `/chart/{poolId}`
 * only exposes supply APY (`apyBase`). A toggle for borrow lands when
 * `rate_snapshots` accumulates enough days to backfill the borrow side.
 */

import { useMemo, useRef } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import { ChartAnnotations } from "../overview/chart-annotations"
import { useAnnotations } from "@/lib/annotations"
import { PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { formatDate } from "@/lib/utils"

interface Props {
  /** Asset symbol — used in the title. */
  asset: string
  /** Protocol slug for the market the user is currently viewing. Its line
   *  is drawn at full saturation; siblings get a faded variant. */
  currentProtocolSlug: string
  /** Per-protocol supply APY history. Each entry's points are already
   *  filtered to the last 90 days. */
  history: Record<string, Array<{ timestamp: number; value: number }>>
}

interface Row {
  timestamp: number
  [protocolSlug: string]: number | undefined
}

function mergeHistories(
  history: Record<string, Array<{ timestamp: number; value: number }>>,
): Row[] {
  const byTs = new Map<number, Row>()
  for (const [slug, points] of Object.entries(history)) {
    for (const p of points) {
      const row = byTs.get(p.timestamp) ?? { timestamp: p.timestamp }
      row[slug] = p.value
      byTs.set(p.timestamp, row)
    }
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
}

function buildInsight(
  history: Record<string, Array<{ timestamp: number; value: number }>>,
  asset: string,
): string | null {
  // Pick the protocol with the highest LATEST supply APY — the "best venue
  // right now" sentence the audit specifically called out.
  const latestBySlug: Array<{ slug: string; value: number }> = []
  for (const [slug, points] of Object.entries(history)) {
    if (points.length === 0) continue
    const latest = points[points.length - 1]
    if (Number.isFinite(latest.value)) latestBySlug.push({ slug, value: latest.value })
  }
  if (latestBySlug.length === 0) return null
  latestBySlug.sort((a, b) => b.value - a.value)
  const top = latestBySlug[0]
  const topName = PROTOCOL_BY_SLUG[top.slug]?.name ?? top.slug

  // Single-protocol fallback — still useful: tells the reader nobody else
  // lists this asset right now.
  if (latestBySlug.length === 1) {
    return `${topName} is the only protocol with ${asset} supply data right now (${top.value.toFixed(2)}%).`
  }

  const second = latestBySlug[1]
  const secondName = PROTOCOL_BY_SLUG[second.slug]?.name ?? second.slug
  const spreadBps = Math.round((top.value - second.value) * 100)

  if (spreadBps < 1) {
    return `${asset} supply rates are converged across protocols — within 1 bp at the latest read.`
  }

  // When the leader's APY is at least 5× the runner-up AND the runner-up is
  // effectively zero (<5 bps), surface the "only meaningful APY" callout.
  // Catches the wstETH case where Fluid actively pays for borrowed
  // collateral and others sit at parking-lot rates.
  const baseInsight = `Best supply venue right now: ${topName} at ${top.value.toFixed(2)}% (+${spreadBps} bps over ${secondName} at ${second.value.toFixed(2)}%).`
  const meaningfullyAhead = top.value > 0 && top.value >= second.value * 5 && second.value < 0.05
  if (meaningfullyAhead) {
    return `${baseInsight} ${topName} is the only protocol where ${asset} lenders earn meaningful APY — a function of being one of the few venues where ${asset} is actively borrowed.`
  }
  return baseInsight
}

export function MarketCrossProtocolRateChart({
  asset,
  currentProtocolSlug,
  history,
}: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const slugs = Object.keys(history)
  const data = useMemo(() => mergeHistories(history), [history])
  const insight = useMemo(() => buildInsight(history, asset), [history, asset])
  // Per-asset annotation channel — events keyed
  // `market-cross-protocol-rate-<asset>` (lowercase) opt in here. PYUSD
  // and other assets get a dashed reference line at the event timestamp
  // with the curated label rendered above the chart.
  const annotations = useAnnotations(
    `market-cross-protocol-rate-${asset.toLowerCase()}`,
  )

  if (slugs.length < 2 || data.length < 2) {
    // No siblings (or insufficient data) — the chart itself would just
    // dupe the per-market supply history above. Skip the chart but keep
    // the insight line if we have one ("Fluid is the only protocol with
    // wstETH supply data" still informs the reader).
    if (insight) {
      return (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {insight}
        </p>
      )
    }
    return null
  }

  const title = `${asset} Supply APY · 90 days · cross-protocol`

  return (
    <div className="space-y-2">
      <div
        ref={cardRef}
        className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
      >
        <div
          className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {title}
            <MethodologyTooltip methodologyKey="market-cross-protocol-rate" />
          </span>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-3 text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              {slugs.map((slug) => {
                const cfg = PROTOCOL_BY_SLUG[slug]
                return (
                  <div key={slug} className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: cfg?.color ?? "#6B7280",
                        opacity: slug === currentProtocolSlug ? 1 : 0.55,
                      }}
                    />
                    <span
                      style={{
                        color:
                          slug === currentProtocolSlug ? "var(--text-primary)" : "var(--text-muted)",
                        fontWeight: slug === currentProtocolSlug ? 600 : 400,
                      }}
                    >
                      {cfg?.name ?? slug}
                    </span>
                  </div>
                )
              })}
            </div>
            <ChartActions cardRef={cardRef} title={title} />
          </div>
        </div>
        <div className="relative p-4 h-[260px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 16, left: 5, bottom: 0 }}>
              <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(ts) => formatDate(ts)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}
                labelFormatter={(ts) => formatDate(ts as number)}
                formatter={(v: number, name: string) => {
                  const cfg = PROTOCOL_BY_SLUG[name]
                  return [`${v.toFixed(2)}%`, cfg?.name ?? name]
                }}
              />
              <ChartAnnotations events={annotations} bucket="day" />
              {slugs.map((slug) => {
                const cfg = PROTOCOL_BY_SLUG[slug]
                const isCurrent = slug === currentProtocolSlug
                return (
                  <Line
                    key={slug}
                    type="monotone"
                    dataKey={slug}
                    stroke={cfg?.color ?? "#6B7280"}
                    strokeWidth={isCurrent ? 2.25 : 1.5}
                    strokeOpacity={isCurrent ? 1 : 0.65}
                    dot={false}
                    connectNulls
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      {insight && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {insight}
        </p>
      )}
    </div>
  )
}
