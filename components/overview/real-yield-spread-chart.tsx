"use client"

import { useMemo, useState } from "react"
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"
import { formatPercent } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
} from "@/lib/time-bucketing"
import type { RealYieldPoint } from "@/lib/real-yield"

interface Props {
  title: string
  data: RealYieldPoint[]
  defaultRange?: TimeRange
}

function Tt({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as RealYieldPoint | undefined
  if (!point) return null
  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-secondary">Stablecoin lending APY</span>
          <span className="text-xs font-medium text-text-primary tabular-nums">
            {point.stableApyPct != null ? formatPercent(point.stableApyPct, 2) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-secondary">4-week T-bill</span>
          <span className="text-xs font-medium text-text-muted tabular-nums">
            {point.tBillPct != null ? formatPercent(point.tBillPct, 2) : "—"}
          </span>
        </div>
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Real yield spread</span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{
            color: (point.spreadPct ?? 0) >= 0 ? "var(--success)" : "var(--danger)",
          }}
        >
          {point.spreadPct != null ? formatPercent(point.spreadPct, 2) : "—"}
        </span>
      </div>
    </div>
  )
}

export function RealYieldSpreadChart({ title, data, defaultRange = 90 }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const bucket = rangeToBucket(range)
  // Rates are continuous values — average daily readings within each bucket.
  const bucketed = useMemo(
    () =>
      bucketSeries<RealYieldPoint>(data, bucket, "avg", [
        "stableApyPct",
        "tBillPct",
        "spreadPct",
      ]),
    [data, bucket],
  )

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
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
        <TimeToggle
          selected={range}
          onChange={setRange}
          options={[7, 30, 90]}
          labels={{ 7: "W", 30: "M", 90: "Q" }}
        />
      </div>
      <div className="relative p-4 h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="rys-spread" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.accent} stopOpacity={0.45} />
                <stop offset="100%" stopColor={colors.accent} stopOpacity={0.05} />
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
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              width={42}
            />
            <ReferenceLine y={0} stroke={colors.textMuted} strokeDasharray="2 4" />
            <Tooltip content={<Tt bucket={bucket} />} cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="spreadPct"
              stroke={colors.accent}
              strokeWidth={1.75}
              fill="url(#rys-spread)"
              fillOpacity={1}
            />
            <Line
              type="monotone"
              dataKey="tBillPct"
              stroke={colors.textMuted}
              strokeDasharray="4 4"
              strokeWidth={1.25}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="stableApyPct"
              stroke={colors.textSecondary}
              strokeDasharray="2 2"
              strokeWidth={1.25}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: colors.accent }}
          />
          <span>Real yield spread (area)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-0.5"
            style={{ backgroundColor: colors.textSecondary, borderBottom: `1px dashed ${colors.textSecondary}` }}
          />
          <span>Stablecoin lending APY</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-0.5"
            style={{ backgroundColor: colors.textMuted, borderBottom: `1px dashed ${colors.textMuted}` }}
          />
          <span>4-week T-bill (FRED TB4WK)</span>
        </div>
      </div>
    </div>
  )
}
