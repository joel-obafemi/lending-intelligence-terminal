"use client"

/**
 * Chart 7 / 7 — Sector take rate vs U.S. Treasury 4-week T-bill,
 * 12-month, monthly close. Two lines crossing at May 31 (take rate
 * 3.38%, T-bill 3.60%) — first sub-T-bill print in the captured series.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  Legend,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM, INK } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  label: string
  takeRatePct: number
  tBillPct: number
}

interface Props {
  data: { history: Datum[] }
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
        color: INK,
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
        minWidth: 180,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{p.label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 12px" }}>
        <span style={{ color: MUTED }}>Take rate</span>
        <span style={{ color: COBALT, textAlign: "right", fontWeight: 600 }}>{p.takeRatePct.toFixed(2)}%</span>
        <span style={{ color: MUTED }}>4w T-bill</span>
        <span style={{ color: TERRACOTTA, textAlign: "right", fontWeight: 600 }}>{p.tBillPct.toFixed(2)}%</span>
      </div>
    </div>
  )
}

export function TakeRateVsTbillChart({ data }: Props) {
  const lastIdx = data.history.length - 1
  const last = data.history[lastIdx]
  return (
    <div style={{ width: "100%", height: 380 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.history} margin={{ top: 16, right: 40, bottom: 28, left: 4 }}>
          <CartesianGrid stroke={FOG} strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="label" tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }} axisLine={{ stroke: FOG }} tickLine={false} interval={0} />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            domain={[2.5, 6.5]}
            label={{
              value: "Annualized %",
              position: "insideTopLeft",
              dy: -4,
              dx: 14,
              style: { fontFamily: "var(--report-font-mono)", fontSize: 10, fill: MUTED, letterSpacing: "0.08em" },
            }}
          />
          <Line
            dataKey="takeRatePct"
            name="Sector take rate"
            stroke={COBALT}
            strokeWidth={2.4}
            dot={{ r: 3, fill: COBALT, stroke: CREAM, strokeWidth: 1.2 }}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="tBillPct"
            name="4-week T-bill"
            stroke={TERRACOTTA}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <ReferenceDot
            x={last.label}
            y={last.takeRatePct}
            r={6}
            fill={TERRACOTTA}
            stroke={CREAM}
            strokeWidth={2}
            label={{
              value: `${last.takeRatePct.toFixed(2)}% < ${last.tBillPct.toFixed(2)}%`,
              position: "left",
              offset: 12,
              fontSize: 11,
              fontFamily: "var(--report-font-mono)",
              fill: TERRACOTTA,
              fontWeight: 600,
            }}
          />
          <Legend
            wrapperStyle={{ fontFamily: "var(--report-font-mono)", fontSize: 11, color: MUTED, paddingTop: 12 }}
            iconType="plainline"
            iconSize={14}
          />
          <Tooltip content={<ReportTooltip />} cursor={{ stroke: FOG, strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
