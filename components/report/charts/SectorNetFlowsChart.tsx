"use client"

/**
 * Chart 2 / 7 — Sector net flows by protocol, Apr 30 → May 31, 2026
 * (constant-price). Horizontal bar chart, six protocols sorted by
 * absolute USD flow magnitude. Positive = cobalt, negative =
 * terracotta. Values pulled from the §01 cheat sheet's "Net flows by
 * protocol" table.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  protocol: string
  flowMUsd: number
}

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
        color: "#0E1B2C",
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
        minWidth: 160,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{p.protocol}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>Net flow</span>
        <span style={{ color: p.flowMUsd >= 0 ? COBALT : TERRACOTTA, fontWeight: 600 }}>{fmtUsdM(p.flowMUsd)}</span>
      </div>
    </div>
  )
}

export function SectorNetFlowsChart({ data }: Props) {
  const series = useMemo(
    () => [...data.history].sort((a, b) => Math.abs(b.flowMUsd) - Math.abs(a.flowMUsd)),
    [data.history],
  )

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={series} margin={{ top: 12, right: 64, bottom: 8, left: 16 }}>
          <CartesianGrid stroke={FOG} strokeOpacity={0.4} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(0)}M`}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: FOG }}
            tickLine={false}
            domain={[-800, 800]}
          />
          <YAxis
            type="category"
            dataKey="protocol"
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            width={96}
          />
          <ReferenceLine x={0} stroke={MUTED} strokeOpacity={0.7} />
          <Bar dataKey="flowMUsd" isAnimationActive={false}>
            {series.map((d) => (
              <Cell key={d.protocol} fill={d.flowMUsd >= 0 ? COBALT : TERRACOTTA} />
            ))}
          </Bar>
          <Tooltip content={<ReportTooltip />} cursor={{ fill: "rgba(31, 58, 95, 0.06)" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
