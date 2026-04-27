"use client"

import { useMemo, useRef, useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { formatUSD, getChartColor } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import { ChartActions } from "../chart-actions"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
} from "@/lib/time-bucketing"
import type { AssetTimeseriesPoint } from "@/lib/overview"

interface Props {
  title: string
  data: AssetTimeseriesPoint[]
  /** Top asset symbols to render as named areas; rest fold into "Other" */
  topAssets: string[]
  defaultRange?: TimeRange
}

function AssetTooltip({ active, payload, stackKeys, colorMap, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as AssetTimeseriesPoint | undefined
  if (!point) return null

  const rows = stackKeys
    .map((sym: string) => ({ sym, value: (point[sym] as number) || 0 }))
    .filter((r: { value: number }) => r.value > 0)
    .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
  const total = rows.reduce((s: number, r: { value: number }) => s + r.value, 0)

  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
        {rows.map((r: { sym: string; value: number }) => (
          <div key={r.sym} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[r.sym] }} />
              <span className="text-xs text-text-secondary">{r.sym}</span>
            </div>
            <span className="text-xs font-medium text-text-primary">{formatUSD(r.value)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Total</span>
        <span className="text-sm font-semibold text-text-primary">{formatUSD(total)}</span>
      </div>
    </div>
  )
}

export function AssetStackChart({ title, data, topAssets, defaultRange = 30 }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  const stackKeys = useMemo(
    () => (data.some((p) => (p["Other"] as number) > 0) ? [...topAssets, "Other"] : topAssets),
    [topAssets, data],
  )
  // Asset USD breakdowns are snapshots — take the last value within each bucket.
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "last", stackKeys),
    [data, bucket, stackKeys],
  )
  const colorMap = useMemo(() => {
    const m: Record<string, string> = {}
    topAssets.forEach((sym, i) => {
      m[sym] = getChartColor(i)
    })
    m["Other"] = "#6B7280"
    return m
  }, [topAssets])

  const gradientId = useMemo(() => title.replace(/\s+/g, "-").toLowerCase(), [title])

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
            options={[7, 30, 90]}
            labels={{ 7: "W", 30: "M", 90: "Q" }}
          />
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[280px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              {stackKeys.map((sym) => (
                <linearGradient key={sym} id={`as-${gradientId}-${sym}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorMap[sym]} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={colorMap[sym]} stopOpacity={0.15} />
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
              content={<AssetTooltip stackKeys={stackKeys} colorMap={colorMap} bucket={bucket} />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {stackKeys.map((sym) => (
              <Area
                key={sym}
                type="monotone"
                dataKey={sym}
                stackId="1"
                stroke={colorMap[sym]}
                strokeWidth={0.8}
                fill={`url(#as-${gradientId}-${sym})`}
                fillOpacity={1}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        {stackKeys.map((sym) => (
          <div key={sym} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorMap[sym] }} />
            <span>{sym}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
