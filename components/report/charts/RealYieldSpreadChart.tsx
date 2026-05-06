"use client"

/**
 * Real Yield Spread renderer for /reports.
 *
 * Pure presentation. Receives pre-loaded data from the registry — no
 * data layer access here. Renders the spread as a filled area chart,
 * with the T-bill parity line as a dashed reference and the freeze
 * marker (when present) as a vertical reference line.
 *
 * Color palette comes from the report design tokens — burnt orange
 * for the spread series, navy for the parity / freeze marker, no
 * dashboard-mode chart palette here.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  timestamp: number
  stableApyPct: number | null
  tBillPct: number | null
  spreadPct: number | null
}

interface Props {
  data: { history: Datum[]; freezeMarker: number | null }
  params: ChartRegistryParams
}

const ACCENT = "#C5511A"
const BRAND = "#1F3A5F"
const MUTED = "#595959"
const SUBTLE = "#B8C9DD"

function fmtMonthYear(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
}

function fmtFullDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function ReportTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as Datum | undefined
  if (!p) return null
  return (
    <div
      style={{
        background: "var(--report-bg, #F7F4ED)",
        border: "1px solid var(--report-border, #D4CFC2)",
        borderRadius: "4px",
        padding: "10px 14px",
        fontFamily: "var(--report-font-sans, Inter, sans-serif)",
        fontSize: "12px",
        color: "var(--report-text, #0E1B2C)",
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{fmtFullDate(p.timestamp)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 16px" }}>
        <span style={{ color: MUTED }}>Spread</span>
        <span style={{ color: ACCENT, fontWeight: 600, textAlign: "right" }}>
          {p.spreadPct != null ? `${p.spreadPct >= 0 ? "+" : ""}${p.spreadPct.toFixed(2)} pp` : "—"}
        </span>
        <span style={{ color: MUTED }}>Stables APY</span>
        <span style={{ textAlign: "right" }}>
          {p.stableApyPct != null ? `${p.stableApyPct.toFixed(2)}%` : "—"}
        </span>
        <span style={{ color: MUTED }}>T-bill (4w)</span>
        <span style={{ textAlign: "right" }}>
          {p.tBillPct != null ? `${p.tBillPct.toFixed(2)}%` : "—"}
        </span>
      </div>
    </div>
  )
}

export function RealYieldSpreadChart({ data, params }: Props) {
  const series = useMemo(
    () => data.history.filter((p) => p.spreadPct != null),
    [data.history],
  )

  if (series.length === 0) {
    return (
      <div
        style={{
          height: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED,
          fontFamily: "var(--report-font-mono)",
          fontSize: "12px",
          background: "rgba(31, 58, 95, 0.04)",
          border: "1px dashed var(--report-border)",
          borderRadius: "4px",
        }}
      >
        No data in window
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={series}
          margin={{ top: 12, right: 32, bottom: 8, left: 0 }}
        >
          <defs>
            <linearGradient id="reportSpreadFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.32} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={SUBTLE} strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={fmtMonthYear}
            tick={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              fill: MUTED,
            }}
            axisLine={{ stroke: SUBTLE }}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}`}
            tick={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              fill: MUTED,
            }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "pp",
              position: "insideTopLeft",
              dy: -4,
              dx: 12,
              style: {
                fontFamily: "var(--report-font-mono)",
                fontSize: 10,
                fill: MUTED,
                letterSpacing: "0.08em",
              },
            }}
          />
          <ReferenceLine
            y={0}
            stroke={BRAND}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: "T-bill parity",
              position: "right",
              fontSize: 10,
              fontFamily: "var(--report-font-mono)",
              fill: BRAND,
              opacity: 0.7,
            }}
          />
          {data.freezeMarker != null && (
            <ReferenceLine
              x={data.freezeMarker}
              stroke={BRAND}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              opacity={0.5}
            />
          )}
          <Area
            dataKey="spreadPct"
            stroke={ACCENT}
            strokeWidth={2.2}
            fill="url(#reportSpreadFill)"
            isAnimationActive={false}
            dot={false}
          />
          <Tooltip content={<ReportTooltip />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
