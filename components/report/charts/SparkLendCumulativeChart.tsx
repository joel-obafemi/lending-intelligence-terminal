"use client"

/**
 * Chart 6 / 7 — SparkLend cumulative net deposits, Feb → May 2026.
 * Single area line with annotations on the April step-up ($1.97B) and
 * the May continuation (+$751.6M cumulative to month-end).
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM, INK } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum { label: string; cumulativeMUsd: number }

interface Props {
  data: { history: Datum[] }
  params: ChartRegistryParams
}

function fmtUsdM(v: number): string {
  const sign = v >= 0 ? "+" : "−"
  const a = Math.abs(v)
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(2)}B`
  return `${sign}$${a.toFixed(0)}M`
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
        color: INK,
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
        minWidth: 170,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{p.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>Cumulative net flow</span>
        <span style={{ color: COBALT, fontWeight: 600 }}>{fmtUsdM(p.cumulativeMUsd)}</span>
      </div>
    </div>
  )
}

export function SparkLendCumulativeChart({ data }: Props) {
  const aprIdx = data.history.findIndex((p) => p.label.toLowerCase().startsWith("apr"))
  const mayIdx = data.history.findIndex((p) => p.label.toLowerCase().startsWith("may"))

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.history} margin={{ top: 16, right: 40, bottom: 8, left: 4 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={COBALT} stopOpacity={0.28} />
              <stop offset="100%" stopColor={COBALT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={FOG} strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="label" tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }} axisLine={{ stroke: FOG }} tickLine={false} />
          <YAxis
            tickFormatter={(v: number) => fmtUsdM(v)}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            domain={[0, 3200]}
            label={{
              value: "Cumulative USD",
              position: "insideTopLeft",
              dy: -4,
              dx: 14,
              style: { fontFamily: "var(--report-font-mono)", fontSize: 10, fill: MUTED, letterSpacing: "0.08em" },
            }}
          />
          <Area dataKey="cumulativeMUsd" stroke={COBALT} strokeWidth={2.2} fill="url(#sparkFill)" isAnimationActive={false} dot={{ r: 3, fill: COBALT, stroke: CREAM, strokeWidth: 1.5 }} />
          {aprIdx >= 0 && (
            <ReferenceDot
              x={data.history[aprIdx].label}
              y={data.history[aprIdx].cumulativeMUsd}
              r={6}
              fill={TERRACOTTA}
              stroke={CREAM}
              strokeWidth={2}
              label={{
                value: "Apr step-up +$1.97B",
                position: "top",
                offset: 14,
                fontSize: 10,
                fontFamily: "var(--report-font-mono)",
                fill: TERRACOTTA,
                fontWeight: 600,
              }}
            />
          )}
          {mayIdx >= 0 && (
            <ReferenceDot
              x={data.history[mayIdx].label}
              y={data.history[mayIdx].cumulativeMUsd}
              r={6}
              fill={TERRACOTTA}
              stroke={CREAM}
              strokeWidth={2}
              label={{
                value: "May +$751.6M",
                position: "top",
                offset: 14,
                fontSize: 10,
                fontFamily: "var(--report-font-mono)",
                fill: TERRACOTTA,
                fontWeight: 600,
              }}
            />
          )}
          <Tooltip content={<ReportTooltip />} cursor={{ stroke: FOG, strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
