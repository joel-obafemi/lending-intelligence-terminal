"use client"

import { useMemo, useState } from "react"
import {
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
  defaultRange?: TimeRange
}

function CumulativeTooltip({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as OverviewTimeseriesPoint | undefined
  if (!point) return null

  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    value: (point[p.slug] as number) || 0,
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)

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
    </div>
  )
}

export function CumulativeRevenueChart({ title, data, defaultRange = 90 }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const bucket = rangeToBucket(range)
  // Cumulative is monotonic — take the last value within each bucket as the
  // running-total snapshot at that bucket's end.
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "last", PROTOCOLS.map((p) => p.slug)),
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
      <div className="relative p-4 h-[280px]">
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
              tickFormatter={(v) => formatUSD(v)}
              width={70}
            />
            <Tooltip
              content={<CumulativeTooltip bucket={bucket} />}
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
