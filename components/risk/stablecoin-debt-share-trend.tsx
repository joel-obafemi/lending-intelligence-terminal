"use client"

/**
 * Stablecoin Debt Share trend — 24-month area chart of % of cross-protocol
 * borrows that are denominated in stablecoins. Same metric as the Risk
 * Verdict card; this view shows trajectory.
 */

import { useMemo, useRef } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  type BucketType,
} from "@/lib/time-bucketing"

interface Props {
  title: string
  /** Daily series: { timestamp, sharePct } */
  data: Array<{ timestamp: number; sharePct: number }>
  methodologyKey?: string
  /** Optional auto-generated insight rendered beneath the chart. */
  insight?: string | null
}

const BUCKET: BucketType = "month"
const MONTHS = 24
const ACCENT = "#F59E0B"

function ShareTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as { timestamp: number; sharePct: number } | undefined
  if (!point) return null
  return (
    <div className="custom-tooltip min-w-[180px]">
      <p className="text-xs text-text-muted mb-1.5">
        {formatBucketTooltipLabel(point.timestamp, BUCKET)}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-text-secondary">Stablecoin share</span>
        <span className="text-xs font-medium text-text-primary tabular-nums">
          {point.sharePct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

export function StablecoinDebtShareTrend({ title, data, methodologyKey, insight }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucketed = useMemo(
    () => bucketSeries(data, BUCKET, "last", ["sharePct"], MONTHS),
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
      <div className="relative p-4 h-[280px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bucketed} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="stableShareFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.5} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.05} />
              </linearGradient>
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
            <ReferenceLine
              y={50}
              stroke={colors.textMuted}
              strokeOpacity={0.4}
              strokeDasharray="3 3"
              label={{ value: "50% line", position: "right", fontSize: 9, fill: colors.textMuted }}
            />
            <Area
              type="monotone"
              dataKey="sharePct"
              stroke={ACCENT}
              strokeWidth={1.75}
              fill="url(#stableShareFill)"
              fillOpacity={1}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {insight && (
        <p
          className="px-4 pb-3 pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {insight}
        </p>
      )}
    </div>
  )
}
