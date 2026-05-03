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
import { formatUSD } from "@/lib/utils"
import { ASSET_TYPE_LABEL, ASSET_TYPE_COLOR, ASSET_TYPE_STACK_ORDER, type AssetType } from "@/lib/assets"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { ChartAnnotations } from "./chart-annotations"
import { useAnnotations } from "@/lib/annotations"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
} from "@/lib/time-bucketing"
import type { AssetTypeTimeseriesPoint } from "@/lib/overview"

interface Props {
  title: string
  data: AssetTypeTimeseriesPoint[]
  defaultRange?: TimeRange
  methodologyKey?: string
}

function TypeTooltip({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as AssetTypeTimeseriesPoint | undefined
  if (!point) return null

  const rows = ASSET_TYPE_STACK_ORDER.map((t) => ({
    type: t,
    value: point[t] as number,
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.type} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ASSET_TYPE_COLOR[r.type] }} />
              <span className="text-xs text-text-secondary">{ASSET_TYPE_LABEL[r.type]}</span>
            </div>
            <span className="text-xs font-medium text-text-primary">
              {formatUSD(r.value)}
              <span className="text-text-muted ml-2">
                {total > 0 ? `${((r.value / total) * 100).toFixed(1)}%` : ""}
              </span>
            </span>
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

export function CollateralTypeChart({ title, data, defaultRange = 30, methodologyKey }: Props) {
  // Annotations for the Total Collateral by Asset Type chart — keyed
  // "collateral-by-asset-type". Currently carries the Aug/Sep 2025
  // sector peak callout (~$80B).
  const annotations = useAnnotations("collateral-by-asset-type")
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Collateral mix is a snapshot — take the last value within each bucket.
  const bucketed = useMemo(
    () => bucketSeries<AssetTypeTimeseriesPoint>(data, bucket, "last", ASSET_TYPE_STACK_ORDER as unknown as string[]),
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
              {ASSET_TYPE_STACK_ORDER.map((t) => (
                <linearGradient key={t} id={`ct-${t}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ASSET_TYPE_COLOR[t]} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={ASSET_TYPE_COLOR[t]} stopOpacity={0.12} />
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
              content={<TypeTooltip bucket={bucket} />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <ChartAnnotations events={annotations} bucket={bucket} />
            {ASSET_TYPE_STACK_ORDER.map((t) => (
              <Area
                key={t}
                type="monotone"
                dataKey={t}
                stackId="1"
                stroke={ASSET_TYPE_COLOR[t]}
                strokeWidth={0.8}
                fill={`url(#ct-${t})`}
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
        {ASSET_TYPE_STACK_ORDER.map((t) => (
          <div key={t} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ASSET_TYPE_COLOR[t] }} />
            <span>{ASSET_TYPE_LABEL[t]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
