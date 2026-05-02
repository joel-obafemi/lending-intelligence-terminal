"use client"

/**
 * Take Rate Comparison — the Revenue page's signature long-term lens.
 *
 * One line per protocol over ~12 months, Y-axis = trailing-30d
 * annualized Rev/TVL (%). Answers "is each protocol becoming more or
 * less efficient with depositor capital?" — a sentence the per-card
 * snapshot can't tell on its own.
 */

import { useMemo, useRef, useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { PROTOCOLS, PROTOCOL_BY_SLUG } from "@/lib/protocols"
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
import type { TakeRatePoint } from "@/lib/take-rate"

interface Props {
  data: TakeRatePoint[]
  defaultRange?: TimeRange
}

function CustomTooltip({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as TakeRatePoint | undefined
  if (!point) return null
  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    value: (point[p.slug] as number) ?? null,
  }))
    .filter((r) => r.value != null && Number.isFinite(r.value))
    .sort((a, b) => (b.value as number) - (a.value as number))
  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs text-text-muted mb-2">
        {formatBucketTooltipLabel(point.timestamp, bucket)}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span className="text-xs font-medium tabular-nums text-text-primary">
              {formatPercent(r.value as number, 2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TakeRateComparisonChart({ data, defaultRange = 30 }: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Take rate is a percent — average daily readings within each bucket.
  const bucketed = useMemo(
    () =>
      bucketSeries<TakeRatePoint>(
        data,
        bucket,
        "avg",
        PROTOCOLS.map((p) => p.slug),
        // Display ~12 months of monthly buckets; weekly stays at 12 (≈3
        // months) which is fine for a recent-dynamics zoom view.
        bucket === "month" ? 12 : undefined,
      ),
    [data, bucket],
  )

  const TITLE = "Take Rate · Rev/TVL annualized · 12 months"
  // Compute the latest non-null take rate per protocol so we can render
  // a small legend strip at the bottom showing today's reading.
  const latest: Array<{ slug: string; v: number }> = []
  for (const p of PROTOCOLS) {
    for (let i = bucketed.length - 1; i >= 0; i--) {
      const v = (bucketed[i] as TakeRatePoint)[p.slug] as number | undefined
      if (v != null && Number.isFinite(v) && v > 0) {
        latest.push({ slug: p.slug, v })
        break
      }
    }
  }
  latest.sort((a, b) => b.v - a.v)

  if (data.length < 30) {
    return (
      <div
        className="tui-card bg-card-bg border border-card-border rounded p-6 text-[11px] text-center"
        style={{ color: "var(--text-muted)" }}
      >
        Take Rate Comparison renders once daily fees + TVL data has accumulated.
      </div>
    )
  }

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {TITLE}
          <MethodologyTooltip methodologyKey="revenue-take-rate-comparison" />
        </span>
        <div className="flex items-center gap-2">
          <TimeToggle
            selected={range}
            onChange={setRange}
            options={[7, 30, 90]}
            labels={{ 7: "W", 30: "M", 90: "Q" }}
          />
          <ChartActions cardRef={cardRef} title={TITLE} />
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
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              width={48}
            />
            <Tooltip
              content={<CustomTooltip bucket={bucket} />}
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
                connectNulls
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
        {latest.map(({ slug, v }) => {
          const cfg = PROTOCOL_BY_SLUG[slug]
          return (
            <div key={slug} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: cfg?.color }}
              />
              <span>
                {cfg?.name} ·{" "}
                <span className="tabular-nums" style={{ color: cfg?.color }}>
                  {formatPercent(v, 2)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
