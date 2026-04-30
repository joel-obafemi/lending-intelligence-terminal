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
import type { RateHistoryPoint } from "@/lib/rates"
import type { FredPoint } from "@/lib/fred"

interface Props {
  title: string
  data: RateHistoryPoint[]
  /** Optional Fed Funds Rate series; overlays as a dashed grey line. */
  fedFunds?: FredPoint[]
  defaultRange?: TimeRange
  /** Hint text shown next to the title (e.g. "snapshot-seeded") */
  subtitle?: string
  methodologyKey?: string
}

/**
 * Merge rate data with Fed Funds by closest day. Each rate point may get an
 * extra `fedFunds` key. Build a map from day-bucket → DFF, then lookup.
 */
function mergeWithFedFunds(
  rateData: RateHistoryPoint[],
  fedFunds: FredPoint[] | undefined,
): Array<RateHistoryPoint & { fedFunds?: number }> {
  if (!fedFunds || fedFunds.length === 0) return rateData
  // Key by YYYY-MM-DD for a fast same-day lookup.
  const byDay = new Map<string, number>()
  for (const p of fedFunds) {
    const key = new Date(p.timestamp * 1000).toISOString().slice(0, 10)
    byDay.set(key, p.rate)
  }
  let lastKnown: number | undefined = undefined
  return rateData.map((pt) => {
    const key = new Date(pt.timestamp * 1000).toISOString().slice(0, 10)
    const dff = byDay.get(key) ?? lastKnown
    if (dff != null) lastKnown = dff
    // Skip the field entirely when undefined — RateHistoryPoint's index
    // signature is `number`, so `fedFunds: undefined` makes TS unhappy.
    return dff != null ? { ...pt, fedFunds: dff } : { ...pt }
  })
}

function RateTooltip({ active, payload, showFed, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as (RateHistoryPoint & { fedFunds?: number }) | undefined
  if (!point) return null

  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    value: point[p.slug] as number | undefined,
  }))
    .filter((r) => r.value != null && Number.isFinite(r.value))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs text-text-muted mb-2">{formatBucketTooltipLabel(point.timestamp, bucket)}</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {formatPercent(r.value ?? 0, 2)}
            </span>
          </div>
        ))}
        {showFed && point.fedFunds != null && (
          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-card-border">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-0.5 flex-shrink-0"
                style={{ backgroundColor: "var(--text-muted)" }}
              />
              <span className="text-xs text-text-secondary">Fed Funds</span>
            </div>
            <span className="text-xs font-medium text-text-muted tabular-nums">
              {formatPercent(point.fedFunds, 2)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function RateHistoryChart({
  title,
  data,
  fedFunds,
  defaultRange = 30,
  subtitle,
  methodologyKey,
}: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Rates are continuous values — average daily values within each bucket.
  const protocolKeys = PROTOCOLS.map((p) => p.slug)
  const bucketed = useMemo(
    () => bucketSeries<RateHistoryPoint>(data, bucket, "avg", protocolKeys),
    [data, bucket],
  )
  const merged = useMemo(() => mergeWithFedFunds(bucketed, fedFunds), [bucketed, fedFunds])
  const showFed = !!fedFunds && fedFunds.length > 0

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
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
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
          <LineChart data={merged} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <XAxis
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(ts) => formatBucketLabel(ts, bucket)}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              width={42}
            />
            <Tooltip
              content={<RateTooltip showFed={showFed} bucket={bucket} />}
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
                connectNulls
              />
            ))}
            {showFed && (
              <Line
                type="monotone"
                dataKey="fedFunds"
                stroke={colors.textMuted}
                strokeDasharray="4 4"
                strokeWidth={1.25}
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showFed && (
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
          <div className="flex items-center gap-1.5 ml-auto">
            <span
              className="w-2 h-0.5"
              style={{ backgroundColor: "var(--text-muted)", borderBottom: "1px dashed var(--text-muted)" }}
            />
            <span>Fed Funds (DFF)</span>
          </div>
        </div>
      )}
    </div>
  )
}
