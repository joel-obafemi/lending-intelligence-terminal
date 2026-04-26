"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
  type BucketMode,
} from "@/lib/time-bucketing"

type Format = "usd" | "percent"

interface Props {
  title: string
  data: Array<{ timestamp: number; value: number }>
  /** Color of the chart line/fill. Defaults to the accent. */
  color?: string
  /** Display format for the value axis + tooltip. */
  format?: Format
  /** Aggregation mode when collapsing daily points into W/M/Q buckets. */
  bucketMode?: BucketMode
  /** Render style — area (with gradient) for stocks like TVL, line for rates. */
  variant?: "area" | "line"
  /** Decimals for percent formatting. */
  decimals?: number
  /** Optional empty-state copy when `data` is short or missing. */
  emptyMessage?: string
}

function formatValue(v: number, format: Format, decimals: number): string {
  if (!Number.isFinite(v)) return "—"
  if (format === "percent") return `${v.toFixed(decimals)}%`
  // USD with K/M/B abbreviations.
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function CustomTooltip({ active, payload, bucket, format, decimals, color, label }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload as { timestamp: number; value: number } | undefined
  if (!point) return null
  return (
    <div className="custom-tooltip min-w-[180px]">
      <p className="text-xs text-text-muted mb-1.5">
        {formatBucketTooltipLabel(point.timestamp, bucket)}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs text-text-secondary">{label}</span>
        </div>
        <span className="text-sm font-semibold text-text-primary tabular-nums">
          {formatValue(point.value, format, decimals)}
        </span>
      </div>
    </div>
  )
}

export function MarketHistoryChart({
  title,
  data,
  color,
  format = "usd",
  bucketMode = "last",
  variant = "area",
  decimals = 2,
  emptyMessage,
}: Props) {
  const [range, setRange] = useState<TimeRange>(30)
  const colors = useThemeColors()
  const lineColor = color ?? colors.accent
  const bucket = rangeToBucket(range)
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, bucketMode, ["value"]),
    [data, bucket, bucketMode],
  )

  const isEmpty = !data || data.length < 2

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {title}
        </span>
        <TimeToggle
          selected={range}
          onChange={setRange}
          options={[7, 30, 90, 0]}
          labels={{ 7: "W", 30: "M", 90: "Q", 0: "All" }}
        />
      </div>
      <div className="relative p-4 h-[260px]">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-[11px] text-text-muted text-center px-6">
            {emptyMessage ?? "Not enough history yet."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "area" ? (
              <AreaChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${title.replace(/\s/g, "-")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                  </linearGradient>
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
                  tickFormatter={(v) => formatValue(v, format, decimals)}
                  width={70}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      bucket={bucket}
                      format={format}
                      decimals={decimals}
                      color={lineColor}
                      label={title}
                    />
                  }
                  cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={1.75}
                  fill={`url(#grad-${title.replace(/\s/g, "-")})`}
                  fillOpacity={1}
                />
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
                  tickFormatter={(v) => formatValue(v, format, decimals)}
                  width={60}
                />
                <Tooltip
                  content={
                    <CustomTooltip
                      bucket={bucket}
                      format={format}
                      decimals={decimals}
                      color={lineColor}
                      label={title}
                    />
                  }
                  cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 1 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
