"use client"

/**
 * Market Share by Borrows — Zone 2 hero of the Sector Overview rebuild.
 *
 * 24-month monthly-bucketed stacked area, sums to 100% per bucket. Replaces
 * the old "Total Supply by Protocol" double-row as the page's anchor chart.
 * Annotations from `content/annotations.json` (chartKey "sector-borrows-share")
 * render as dashed reference lines so depegs / parameter changes / liquidation
 * cascades are called out inline.
 */

import { useMemo, useRef } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import { formatPercent } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { ChartAnnotations } from "./chart-annotations"
import { useAnnotations } from "@/lib/annotations"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  type BucketType,
} from "@/lib/time-bucketing"
import type { OverviewTimeseriesPoint } from "@/lib/overview"

interface Props {
  title: string
  /** Pre-normalized market-share-by-borrows daily series (each row sums to 100). */
  data: OverviewTimeseriesPoint[]
  methodologyKey?: string
}

const BUCKET: BucketType = "month"
const MONTHS = 24

function ShareTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as OverviewTimeseriesPoint | undefined
  if (!point) return null

  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    pct: (point[p.slug] as number) || 0,
  }))
    .filter((r) => r.pct > 0.01)
    .sort((a, b) => b.pct - a.pct)

  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">
        {formatBucketTooltipLabel(point.timestamp, BUCKET)}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {formatPercent(r.pct, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MarketShareBorrowsHero({ title, data, methodologyKey }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const annotations = useAnnotations("sector-borrows-share")
  const bucketed = useMemo(
    () => bucketSeries(data, BUCKET, "last", PROTOCOLS.map((p) => p.slug), MONTHS),
    [data],
  )

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            24-month view
          </span>
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[360px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bucketed} margin={{ top: 18, right: 5, left: 5, bottom: 0 }}>
            <defs>
              {PROTOCOLS.map((p) => (
                <linearGradient key={p.slug} id={`msb-${p.slug}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.color} stopOpacity={0.65} />
                  <stop offset="100%" stopColor={p.color} stopOpacity={0.35} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(ts) => formatBucketLabel(ts, BUCKET)}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[0, 100]}
              width={40}
            />
            <Tooltip
              content={<ShareTooltip />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <ChartAnnotations events={annotations} bucket={BUCKET} />
            {PROTOCOLS.map((p) => (
              <Area
                key={p.slug}
                type="monotone"
                dataKey={p.slug}
                stackId="1"
                stroke={p.color}
                strokeWidth={1}
                fill={`url(#msb-${p.slug})`}
                fillOpacity={1}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        {PROTOCOLS.map((p) => (
          <div key={p.slug} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
