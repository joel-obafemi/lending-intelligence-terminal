"use client"

import { useMemo, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import { formatUSD } from "@/lib/utils"
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

function NetFlowTooltip({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as OverviewTimeseriesPoint | undefined
  if (!point) return null

  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    value: (point[p.slug] as number) || 0,
  }))
    .filter((r) => Math.abs(r.value) > 1000)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <div className="custom-tooltip min-w-[240px]">
      <p className="text-xs text-text-muted mb-2">
        {formatBucketTooltipLabel(point.timestamp, bucket)}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span
              className="text-xs font-medium tabular-nums"
              style={{ color: r.value >= 0 ? "var(--success)" : "var(--danger)" }}
            >
              {r.value >= 0 ? "+" : "\u2212"}
              {formatUSD(Math.abs(r.value))}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Net flow</span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: total >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          {total >= 0 ? "+" : "\u2212"}
          {formatUSD(Math.abs(total))}
        </span>
      </div>
    </div>
  )
}

export function NetFlowChart({ title, data, defaultRange = 90, methodologyKey }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Net flow is signed flow data — sum daily/weekly values within each bucket.
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "sum", PROTOCOLS.map((p) => p.slug)),
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
          <BarChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }} stackOffset="sign">
            <XAxis
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(ts) => formatBucketLabel(ts, bucket)}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => {
                const abs = Math.abs(v)
                const prefix = v >= 0 ? "" : "\u2212"
                if (abs >= 1e9) return `${prefix}$${(abs / 1e9).toFixed(1)}B`
                if (abs >= 1e6) return `${prefix}$${(abs / 1e6).toFixed(0)}M`
                if (abs >= 1e3) return `${prefix}$${(abs / 1e3).toFixed(0)}K`
                return `${prefix}$${abs}`
              }}
              width={70}
            />
            <ReferenceLine y={0} stroke={colors.textMuted} strokeOpacity={0.3} />
            <Tooltip
              content={<NetFlowTooltip bucket={bucket} />}
              cursor={{ fill: "rgba(255, 255, 255, 0.03)" }}
            />
            {PROTOCOLS.map((p) => (
              <Bar key={p.slug} dataKey={p.slug} stackId="sign" fill={p.color} fillOpacity={0.85} />
            ))}
          </BarChart>
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
        <span className="ml-auto text-[9px] opacity-70">
          Priced at latest token prices, isolating flows from price moves.
        </span>
      </div>
    </div>
  )
}
