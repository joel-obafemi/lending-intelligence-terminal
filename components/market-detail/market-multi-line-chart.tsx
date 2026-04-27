"use client"

import { useMemo, useRef, useState } from "react"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import { ChartActions } from "../chart-actions"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
  type BucketMode,
} from "@/lib/time-bucketing"

type Format = "usd" | "percent"

export interface MultiLineSeries {
  /** Series key — used to read the value from each data point. */
  key: string
  /** Display label in legend + tooltip. */
  label: string
  color: string
  data: Array<{ timestamp: number; value: number }>
}

interface Props {
  title: string
  series: MultiLineSeries[]
  format: Format
  bucketMode?: BucketMode
  decimals?: number
  /** Override the default empty-state copy. */
  emptyMessage?: string
}

function formatValue(v: number, format: Format, decimals: number): string {
  if (!Number.isFinite(v)) return "—"
  if (format === "percent") return `${v.toFixed(decimals)}%`
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

/** Merge multiple {timestamp, value} arrays into one row-per-timestamp with
 *  named columns. Missing series get undefined for that timestamp. */
function mergeSeries(series: MultiLineSeries[]): Array<Record<string, number>> {
  const byTs = new Map<number, Record<string, number>>()
  for (const s of series) {
    for (const pt of s.data) {
      const row = byTs.get(pt.timestamp) ?? { timestamp: pt.timestamp }
      row[s.key] = pt.value
      byTs.set(pt.timestamp, row)
    }
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp)
}

function CustomTooltip({ active, payload, bucket, format, decimals, series }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as Record<string, number> | undefined
  if (!row) return null
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs text-text-muted mb-1.5">
        {formatBucketTooltipLabel(row.timestamp, bucket)}
      </p>
      <div className="space-y-1">
        {(series as MultiLineSeries[]).map((s) => {
          const v = row[s.key]
          if (v == null || !Number.isFinite(v)) return null
          return (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-text-secondary">{s.label}</span>
              </div>
              <span className="text-xs font-medium text-text-primary tabular-nums">
                {formatValue(v, format, decimals)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MarketMultiLineChart({
  title,
  series,
  format,
  bucketMode = "last",
  decimals = 2,
  emptyMessage,
}: Props) {
  const [range, setRange] = useState<TimeRange>(30)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)

  // Bucket each series independently, then merge.
  const bucketed = useMemo(() => {
    const bucketedSeries = series.map((s) => ({
      ...s,
      data: bucketSeries(s.data, bucket, bucketMode, ["value"]),
    }))
    return mergeSeries(bucketedSeries)
  }, [series, bucket, bucketMode])

  // Two failure modes for "empty":
  //  - No raw data at all → never had history.
  //  - Raw data exists but the active bucket collapsed it to <2 points
  //    (e.g. only 2 daily snapshots when M is selected → both fall in the
  //    same month → 1 point). Recharts can't draw a line through 1 point so
  //    you'd see a lonely dot — better to show a real empty hint.
  const hasAnyData = series.some((s) => s.data.length >= 1)
  const enoughBuckets = bucketed.length >= 2
  const isEmpty = !hasAnyData || !enoughBuckets

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
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {title}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <TimeToggle
            selected={range}
            onChange={setRange}
            options={[7, 30, 90, 0]}
            labels={{ 7: "W", 30: "M", 90: "Q", 0: "All" }}
          />
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[260px] chart-body">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-[11px] text-text-muted text-center px-6">
            {/* Two distinct empty states: (a) we have daily samples but the
                active bucket compresses them to <2 points → tell the user to
                switch to a finer view; (b) we have no data at all → show the
                caller-supplied hint about the source. */}
            {hasAnyData && !enoughBuckets
              ? "Only a few days of samples so far — switch to the All toggle to see them at daily resolution."
              : emptyMessage ?? "Not enough history yet."}
          </div>
        ) : (
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
                tickFormatter={(v) => formatValue(v, format, decimals)}
                width={70}
              />
              <Tooltip
                content={
                  <CustomTooltip
                    bucket={bucket}
                    format={format}
                    decimals={decimals}
                    series={series}
                  />
                }
                cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 1 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
