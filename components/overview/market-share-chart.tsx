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
import { PROTOCOLS } from "@/lib/protocols"
import { formatPercent } from "@/lib/utils"
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
import type { OverviewTimeseriesPoint } from "@/lib/overview"

interface Props {
  title: string
  data: OverviewTimeseriesPoint[]
  defaultRange?: TimeRange
  methodologyKey?: string
}

function ShareTooltip({ active, payload, bucket }: any) {
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
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
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

export function MarketShareChart({ title, data, defaultRange = 90, methodologyKey }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Market share is a snapshot percent — take the last value within each bucket.
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "last", PROTOCOLS.map((p) => p.slug)),
    [data, bucket],
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
              {PROTOCOLS.map((p) => (
                <linearGradient key={p.slug} id={`ms-${p.slug}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={p.color} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={p.color} stopOpacity={0.3} />
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
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[0, 100]}
              width={40}
            />
            <Tooltip
              content={<ShareTooltip bucket={bucket} />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {PROTOCOLS.map((p) => (
              <Area
                key={p.slug}
                type="monotone"
                dataKey={p.slug}
                stackId="1"
                stroke={p.color}
                strokeWidth={0.8}
                fill={`url(#ms-${p.slug})`}
                fillOpacity={1}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
