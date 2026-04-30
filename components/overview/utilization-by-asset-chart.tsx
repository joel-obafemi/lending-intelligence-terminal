"use client"

import { useMemo, useRef, useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { formatPercent, getChartColor } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
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
  topAssets: string[]
  defaultRange?: TimeRange
  methodologyKey?: string
}

function UtilTooltip({ active, payload, topAssets, colorMap, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as AssetTimeseriesPoint | undefined
  if (!point) return null

  const rows = topAssets
    .map((sym: string) => ({ sym, value: (point[sym] as number) || 0 }))
    .filter((r: { value: number }) => r.value > 0)
    .sort((a: { value: number }, b: { value: number }) => b.value - a.value)

  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
        {rows.map((r: { sym: string; value: number }) => (
          <div key={r.sym} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[r.sym] }} />
              <span className="text-xs text-text-secondary">{r.sym}</span>
            </div>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {formatPercent(r.value, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function UtilizationByAssetChart({ title, data, topAssets, defaultRange = 30, methodologyKey }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Per-asset utilization is a ratio — average within each bucket.
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "avg", topAssets),
    [data, bucket, topAssets],
  )

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {}
    topAssets.forEach((sym, i) => {
      m[sym] = getChartColor(i)
    })
    return m
  }, [topAssets])

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
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[0, 100]}
              width={40}
            />
            <Tooltip
              content={<UtilTooltip topAssets={topAssets} colorMap={colorMap} bucket={bucket} />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {topAssets.map((sym) => (
              <Line
                key={sym}
                type="monotone"
                dataKey={sym}
                stroke={colorMap[sym]}
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 1 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        {topAssets.map((sym) => (
          <div key={sym} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorMap[sym] }} />
            <span>{sym}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
