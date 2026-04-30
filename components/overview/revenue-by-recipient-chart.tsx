"use client"

import { useMemo, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
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
import type { WeeklyRecipientPoint } from "@/lib/revenue-decomp"

interface Props {
  title: string
  subtitle?: string
  color: string
  data: WeeklyRecipientPoint[]
  defaultRange?: TimeRange
  methodologyKey?: string
}

const RECIPIENT_COLOR = {
  supplySide: "#10B981",  // green — depositors
  protocol: "#FF6B35",    // orange — treasury
  holders: "#B44AFF",     // purple — token buybacks
}
const RECIPIENT_LABEL = {
  supplySide: "Supply-side",
  protocol: "Protocol",
  holders: "Holders",
}

function Tt({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as WeeklyRecipientPoint | undefined
  if (!point) return null
  const total = point.supplySide + point.protocol + point.holders
  const rows: Array<[keyof typeof RECIPIENT_COLOR, number]> = [
    ["supplySide", point.supplySide],
    ["protocol", point.protocol],
    ["holders", point.holders],
  ]
  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5">
        {rows
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([key, v]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: RECIPIENT_COLOR[key] }}
                />
                <span className="text-xs text-text-secondary">{RECIPIENT_LABEL[key]}</span>
              </div>
              <span className="text-xs font-medium text-text-primary">
                {formatUSD(v)}{" "}
                <span className="text-text-muted ml-1">
                  {total > 0 ? `${((v / total) * 100).toFixed(0)}%` : ""}
                </span>
              </span>
            </div>
          ))}
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Total fees</span>
        <span className="text-sm font-semibold text-text-primary">{formatUSD(total)}</span>
      </div>
    </div>
  )
}

export function RevenueByRecipientChart({ title, subtitle, color, data, defaultRange = 30, methodologyKey }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Recipient revenue is flow data — sum daily/weekly values within each bucket.
  const bucketed = useMemo(
    () =>
      bucketSeries<WeeklyRecipientPoint>(data, bucket, "sum", [
        "supplySide",
        "protocol",
        "holders",
      ]),
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
          <span
            className="flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color }}
          >
            {title}
            <MethodologyTooltip methodologyKey={methodologyKey} />
          </span>
          {subtitle && (
            <span className="text-[9px] text-text-muted" style={{ letterSpacing: "0.05em" }}>
              · {subtitle}
            </span>
          )}
        </div>
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
      <div className="relative p-4 h-[240px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
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
              tickFormatter={(v) => formatUSD(v)}
              width={60}
            />
            <Tooltip content={<Tt bucket={bucket} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="supplySide" stackId="1" fill={RECIPIENT_COLOR.supplySide} fillOpacity={0.8} />
            <Bar dataKey="protocol" stackId="1" fill={RECIPIENT_COLOR.protocol} fillOpacity={0.85} />
            <Bar dataKey="holders" stackId="1" fill={RECIPIENT_COLOR.holders} fillOpacity={0.85} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RECIPIENT_COLOR.supplySide }} />
          <span>Supply-side (depositors)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RECIPIENT_COLOR.protocol }} />
          <span>Protocol treasury</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RECIPIENT_COLOR.holders }} />
          <span>Token holders</span>
        </div>
      </div>
    </div>
  )
}
