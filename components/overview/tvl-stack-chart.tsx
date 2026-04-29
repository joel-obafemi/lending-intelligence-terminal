"use client"

import { useMemo, useRef } from "react"
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import { formatUSD } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import { ChartActions } from "../chart-actions"
import { usePermalinkRange } from "@/lib/use-permalink-range"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
} from "@/lib/time-bucketing"
import type { OverviewTimeseriesPoint } from "@/lib/overview"

interface Props {
  title: string
  data: OverviewTimeseriesPoint[]
  /** When true, exposes an "All" toggle option (Sector Overview headline charts). */
  showAllOption?: boolean
  /**
   * Render mode. `lines` (default) puts each protocol on its own independent
   * line so individual movements are readable. `stacked` keeps the legacy
   * stacked-area behavior — useful when total + composition is the point.
   */
  mode?: "lines" | "stacked"
  /** When set, the time-range toggle syncs to a URL query param so the
   *  chart's W/M/Q/All state survives reload + can be linked. Distinct keys
   *  required when multiple TvlStackCharts share a page. */
  paramKey?: string
}

function CustomTooltip({ active, payload, bucket, mode }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as OverviewTimeseriesPoint | undefined
  if (!point) return null

  const rows = PROTOCOLS
    .map((p) => ({ slug: p.slug, name: p.name, color: p.color, value: (point[p.slug] as number) || 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span className="text-xs font-medium text-text-primary">{formatUSD(r.value)}</span>
          </div>
        ))}
      </div>
      {/* Show a Total row only for stacked mode — for line mode, total isn't
          the visual point of the chart and would be misleading. */}
      {mode === "stacked" && (
        <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">Total</span>
          <span className="text-sm font-semibold text-text-primary">{formatUSD(total)}</span>
        </div>
      )}
    </div>
  )
}

export function TvlStackChart({
  title,
  data,
  showAllOption = false,
  mode = "lines",
  paramKey,
}: Props) {
  const [range, setRange] = usePermalinkRange(paramKey, 30)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Snapshot data (TVL/supply/borrow): take the LAST value within each bucket.
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "last", PROTOCOLS.map((p) => p.slug)),
    [data, bucket],
  )
  const toggleOptions: TimeRange[] = showAllOption ? [7, 30, 90, 0] : [7, 30, 90]
  const toggleLabels = showAllOption
    ? { 7: "W", 30: "M", 90: "Q", 0: "All" }
    : { 7: "W", 30: "M", 90: "Q" }

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
          className="text-accent"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <div className="flex items-center gap-2">
          <TimeToggle
            selected={range}
            onChange={setRange}
            options={toggleOptions}
            labels={toggleLabels}
          />
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[280px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "stacked" ? (
            <AreaChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                {PROTOCOLS.map((p) => (
                  <linearGradient key={p.slug} id={`grad-${p.slug}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={p.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(ts) => formatBucketLabel(ts, bucket)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => formatUSD(v)}
                width={70}
              />
              <Tooltip
                content={<CustomTooltip bucket={bucket} mode="stacked" />}
                cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              {PROTOCOLS.map((p) => (
                <Area
                  key={p.slug}
                  type="monotone"
                  dataKey={p.slug}
                  stackId="1"
                  stroke={p.color}
                  strokeWidth={1}
                  fill={`url(#grad-${p.slug})`}
                  fillOpacity={1}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(ts) => formatBucketLabel(ts, bucket)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => formatUSD(v)}
                width={70}
              />
              <Tooltip
                content={<CustomTooltip bucket={bucket} mode="lines" />}
                cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              {PROTOCOLS.map((p) => (
                <Line
                  key={p.slug}
                  type="monotone"
                  dataKey={p.slug}
                  stroke={p.color}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 1 }}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {/* Legend */}
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
