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

export function MarketCrossProtocolRateChart({
  asset,
  currentProtocolSlug,
  history,
}: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const slugs = Object.keys(history)
  const data = useMemo(() => mergeHistories(history), [history])
  const annotations = useAnnotations(
    `market-cross-protocol-rate-${asset.toLowerCase()}`,
  )

  if (slugs.length < 2 || data.length < 2) {
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
    </div>
  )
}
