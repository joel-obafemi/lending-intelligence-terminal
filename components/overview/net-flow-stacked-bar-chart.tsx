"use client"

/**
 * Net Supply Flows — Zone 4, time-series stacked-bar variant.
 *
 * Each bar is one bucket (W / M / Q) of summed per-protocol net supply
 * flow. Bars are stacked by protocol; positive contributions stack above
 * the zero line, negative below (Recharts handles this via
 * `stackOffset="sign"`). Default view is monthly over 24 months — the
 * canonical "Lending Pulse" cadence.
 *
 * Source series: `OverviewResponse.netFlowWeeklySeries`. With weekly
 * input, the bucketing helper acts as:
 *   - W → no-op (already weekly)
 *   - M → sums weeks within each calendar month
 *   - Q → sums weeks within each calendar quarter
 *
 * The previous trailing-30-day Organic / Interest split is dropped here
 * — it doesn't fit a time-series view, and the time view answers the
 * question "where is the trend going" more cleanly than a single
 * one-month snapshot ever could.
 */

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
  /** Weekly per-protocol net flow series — `netFlowWeeklySeries`. */
  data: OverviewTimeseriesPoint[]
  defaultRange?: TimeRange
  methodologyKey?: string
}

function FlowTooltip({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as OverviewTimeseriesPoint | undefined
  if (!point) return null
  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    value: (point[p.slug] as number) || 0,
  }))
    .filter((r) => Math.abs(r.value) > 0)
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
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: r.color }}
              />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span
              className="text-xs font-medium tabular-nums"
              style={{ color: r.value >= 0 ? "var(--success)" : "var(--danger)" }}
            >
              {r.value >= 0 ? "+" : "−"}
              {formatUSD(Math.abs(r.value))}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Net total</span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: total >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          {total >= 0 ? "+" : "−"}
          {formatUSD(Math.abs(total))}
        </span>
      </div>
    </div>
  )
}

/** Auto takeaway for the latest bucket — names the dominant protocol's
 *  contribution and the net direction. */
function buildTakeaway(
  bucketed: OverviewTimeseriesPoint[],
  bucket: ReturnType<typeof rangeToBucket>,
): string | null {
  if (bucketed.length === 0) return null
  const last = bucketed[bucketed.length - 1]
  const rows = PROTOCOLS.map((p) => ({
    name: p.name,
    value: (last[p.slug] as number) || 0,
  })).filter((r) => Math.abs(r.value) >= 5_000_000) // noise floor
  if (rows.length === 0) return null
  const total = rows.reduce((s, r) => s + r.value, 0)
  const driver = rows.reduce((b, r) => (Math.abs(r.value) > Math.abs(b.value) ? r : b))
  const direction = total >= 0 ? "added" : "lost"
  const period = formatBucketTooltipLabel(last.timestamp, bucket)
  const driverPhrase =
    driver.value >= 0
      ? `${driver.name} drove the move with +${formatUSD(driver.value)}`
      : `${driver.name} drove the move with −${formatUSD(Math.abs(driver.value))}`
  return `${period} ${direction} ${formatUSD(Math.abs(total))} of net supply across the four protocols. ${driverPhrase}.`
}

export function NetFlowStackedBarChart({
  title,
  data,
  defaultRange = 30,
  methodologyKey,
}: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  const bucketed = useMemo(
    () => bucketSeries(data, bucket, "sum", PROTOCOLS.map((p) => p.slug)),
    [data, bucket],
  )
  const takeaway = useMemo(() => buildTakeaway(bucketed, bucket), [bucketed, bucket])

  return (
    <div className="space-y-2">
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
        <div className="relative p-4 h-[320px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bucketed}
              margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
              stackOffset="sign"
            >
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
                width={70}
              />
              <Tooltip
                content={<FlowTooltip bucket={bucket} />}
                cursor={{ fill: "rgba(15, 17, 21, 0.04)" }}
              />
              <ReferenceLine y={0} stroke={colors.textMuted} strokeOpacity={0.5} />
              {PROTOCOLS.map((p) => (
                <Bar
                  key={p.slug}
                  dataKey={p.slug}
                  stackId="flow"
                  fill={p.color}
                  fillOpacity={0.85}
                />
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
        </div>
      </div>
      {takeaway && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {takeaway}
        </p>
      )}
    </div>
  )
}
