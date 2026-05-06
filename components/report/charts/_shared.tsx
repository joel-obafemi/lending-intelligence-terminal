"use client"

/**
 * Shared Recharts primitives used by the report chart renderers.
 *
 * Each registry entry's renderer is a small adapter component on top of
 * these — passes data shape + key list + axis formatters and gets a
 * report-styled chart back. Cuts the per-chart code to ~30-50 lines
 * instead of repeating tooltip / axis / legend boilerplate every time.
 *
 * Visual conventions:
 *  - Series colors come from the report palette (accent + brand) plus a
 *    small qualitative ramp for stacked / multi-series charts.
 *  - Axes use --report-text-muted, no axis lines, light grid.
 *  - Tooltip uses cream surface + serif label + monospaced numerals.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  type TooltipProps,
} from "recharts"

export const ACCENT = "#C5511A"
export const BRAND = "#1F3A5F"
export const MUTED = "#595959"
export const SUBTLE = "#B8C9DD"
export const CREAM = "#F7F4ED"

/** Brand-coordinated qualitative ramp for stacked / multi-series charts.
 *  First three are the canonical protocol order (Aave/Spark/Morpho/Fluid);
 *  the rest are extras for asset-stack scenarios. */
export const SERIES_COLORS = [
  "#1F3A5F", // navy — Aave V3
  "#C5511A", // burnt orange — Spark / accent
  "#5B7FFF", // soft blue — Morpho
  "#10B981", // green — Fluid
  "#B44AFF", // purple
  "#F59E0B", // amber
  "#EC4899", // pink
  "#0090B2", // teal
  "#6B7280", // grey — Other / long-tail
]

export interface TimeseriesPoint {
  timestamp: number
  [key: string]: number | null | undefined
}

export interface SeriesKey {
  key: string
  label: string
  color?: string
}

export function fmtMonthYear(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
}

export function fmtFullDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function fmtCompactUsd(v: number): string {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

export function fmtPctTick(v: number): string {
  return `${v.toFixed(0)}%`
}

interface TooltipBoxProps<T> extends TooltipProps<number, string> {
  series: SeriesKey[]
  formatter?: (v: number, key: string) => string
  total?: boolean
}

export function ReportTooltip<T extends TimeseriesPoint>({
  active,
  payload,
  series,
  formatter = (v) => v.toFixed(2),
  total = false,
}: TooltipBoxProps<T>) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as T
  if (!point) return null
  const rows = series
    .map((s) => ({
      ...s,
      value: typeof point[s.key] === "number" ? (point[s.key] as number) : null,
    }))
    .filter((r) => r.value != null)
  const sum = rows.reduce((s, r) => s + (r.value ?? 0), 0)

  return (
    <div
      style={{
        background: CREAM,
        border: `1px solid #D4CFC2`,
        borderRadius: 4,
        padding: "10px 14px",
        fontFamily: "var(--report-font-sans, Inter, sans-serif)",
        fontSize: 12,
        color: "#0E1B2C",
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
        minWidth: 200,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{fmtFullDate(point.timestamp)}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: "4px 16px",
        }}
      >
        {rows.map((r) => (
          <>
            <span key={`${r.key}-l`} style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: r.color,
                }}
              />
              {r.label}
            </span>
            <span
              key={`${r.key}-v`}
              style={{
                fontFamily: "var(--report-font-mono)",
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
              }}
            >
              {formatter(r.value as number, r.key)}
            </span>
          </>
        ))}
        {total && (
          <>
            <span
              style={{
                color: MUTED,
                paddingTop: 4,
                borderTop: "1px solid #D4CFC2",
                fontWeight: 600,
              }}
            >
              Total
            </span>
            <span
              style={{
                fontFamily: "var(--report-font-mono)",
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
                paddingTop: 4,
                borderTop: "1px solid #D4CFC2",
                fontWeight: 600,
              }}
            >
              {formatter(sum, "total")}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

interface SharedChartProps<T extends TimeseriesPoint> {
  data: T[]
  series: SeriesKey[]
  type: "stacked-area" | "lines" | "stacked-bars"
  yFormatter?: (v: number) => string
  tooltipFormatter?: (v: number, key: string) => string
  height?: number
  showZeroLine?: boolean
  freezeMarker?: number | null
  /** Hide individual series legend (e.g. for single-series line charts). */
  hideLegend?: boolean
  /** Domain override for Y axis (auto by default). */
  yDomain?: [number | "auto" | "dataMin", number | "auto" | "dataMax"]
  /** Stacked-bar tooltip should show the per-bar total. */
  tooltipTotal?: boolean
}

/** Render a daily timeseries as stacked area, multi-line, or stacked bars,
 *  in the report's color palette and with the report's Recharts chrome.
 *  Per-chart renderers wrap this with their own data-shaping logic. */
export function SharedTimeseriesChart<T extends TimeseriesPoint>({
  data,
  series,
  type,
  yFormatter = (v) => v.toFixed(0),
  tooltipFormatter,
  height = 360,
  showZeroLine = false,
  freezeMarker = null,
  hideLegend = false,
  yDomain,
  tooltipTotal = false,
}: SharedChartProps<T>) {
  const colorMap = useMemo(() => {
    const out: Record<string, string> = {}
    series.forEach((s, i) => {
      out[s.key] = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]
    })
    return out
  }, [series])

  const seriesWithColors = useMemo(
    () => series.map((s, i) => ({ ...s, color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] })),
    [series],
  )

  if (data.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED,
          fontFamily: "var(--report-font-mono)",
          fontSize: 12,
          background: "rgba(31, 58, 95, 0.04)",
          border: "1px dashed #D4CFC2",
          borderRadius: 4,
        }}
      >
        No data
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 32, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={SUBTLE} strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={fmtMonthYear}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: SUBTLE }}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={yFormatter}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            domain={yDomain}
          />
          {showZeroLine && <ReferenceLine y={0} stroke={BRAND} strokeOpacity={0.5} />}
          {freezeMarker != null && (
            <ReferenceLine
              x={freezeMarker}
              stroke={BRAND}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              opacity={0.5}
            />
          )}
          {type === "stacked-area" &&
            seriesWithColors.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stackId="stack"
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.55}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ))}
          {type === "lines" &&
            seriesWithColors.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          {type === "stacked-bars" &&
            seriesWithColors.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="stack"
                fill={s.color}
                isAnimationActive={false}
              />
            ))}
          <Tooltip
            content={
              <ReportTooltip
                series={seriesWithColors}
                formatter={tooltipFormatter}
                total={tooltipTotal}
              />
            }
            cursor={
              type === "stacked-bars"
                ? { fill: "rgba(31, 58, 95, 0.06)" }
                : { stroke: SUBTLE, strokeWidth: 1 }
            }
          />
          {!hideLegend && (
            <Legend
              wrapperStyle={{
                fontFamily: "var(--report-font-mono)",
                fontSize: 11,
                color: MUTED,
                paddingTop: 12,
              }}
              iconType="square"
              iconSize={10}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
