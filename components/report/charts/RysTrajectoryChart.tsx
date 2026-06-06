"use client"

/**
 * Chart 1 / 7 — Real Yield Spread, 12-month trajectory (May 2025 →
 * May 2026). Single area line, parity (0 bps) marked dashed, Feb '26
 * trough + May 31 parity points annotated.
 *
 * Issue 002 "Capital Rotates" reframe; rendered inside §03.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  ReferenceLine,
  ReferenceDot,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  monthIndex: number
  label: string
  bps: number
}

interface Props {
  data: { history: Datum[]; freezeMarker: number | null }
  params: ChartRegistryParams
}

function ReportTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as Datum | undefined
  if (!p) return null
  return (
    <div
      style={{
        background: CREAM,
        border: "1px solid #D4CFC2",
        borderRadius: 4,
        padding: "8px 12px",
        fontFamily: "var(--report-font-mono)",
        fontSize: 11,
        color: "#0E1B2C",
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
        minWidth: 130,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>{p.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>Spread</span>
        <span style={{ color: p.bps >= 0 ? COBALT : TERRACOTTA, fontWeight: 600 }}>
          {p.bps >= 0 ? "+" : ""}{p.bps.toFixed(1)} bps
        </span>
      </div>
    </div>
  )
}

export function RysTrajectoryChart({ data }: Props) {
  const series = useMemo(() => data.history, [data.history])
  const troughIdx = series.findIndex((p) => p.bps <= Math.min(...series.map((s) => s.bps)))
  const lastIdx = series.length - 1

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 16, right: 36, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id="rysFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COBALT} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COBALT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={FOG} strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: FOG }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}`}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            domain={[-200, 60]}
            label={{
              value: "bps",
              position: "insideTopLeft",
              dy: -4,
              dx: 14,
              style: { fontFamily: "var(--report-font-mono)", fontSize: 10, fill: MUTED, letterSpacing: "0.08em" },
            }}
          />
          <ReferenceLine
            y={0}
            stroke={MUTED}
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{
              value: "T-bill parity",
              position: "insideTopLeft",
              fontSize: 10,
              fontFamily: "var(--report-font-mono)",
              fill: MUTED,
              dy: -2,
              dx: 60,
            }}
          />
          <Area
            dataKey="bps"
            stroke={COBALT}
            strokeWidth={2.2}
            fill="url(#rysFill)"
            isAnimationActive={false}
            dot={false}
          />
          {/* Feb '26 trough annotation */}
          {troughIdx >= 0 && (
            <ReferenceDot
              x={series[troughIdx].label}
              y={series[troughIdx].bps}
              r={5}
              fill={TERRACOTTA}
              stroke="none"
              label={{
                value: `Feb trough −151 bps`,
                position: "bottom",
                offset: 12,
                fontSize: 10,
                fontFamily: "var(--report-font-mono)",
                fill: TERRACOTTA,
                fontWeight: 600,
              }}
            />
          )}
          {/* May 31 parity annotation */}
          <ReferenceDot
            x={series[lastIdx].label}
            y={series[lastIdx].bps}
            r={5}
            fill={COBALT}
            stroke={CREAM}
            strokeWidth={2}
            label={{
              value: "May 31 · parity",
              position: "left",
              offset: 14,
              fontSize: 10,
              fontFamily: "var(--report-font-mono)",
              fill: COBALT,
              fontWeight: 600,
            }}
          />
          <Tooltip content={<ReportTooltip />} cursor={{ stroke: FOG, strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
