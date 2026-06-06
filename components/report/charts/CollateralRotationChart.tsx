"use client"

/**
 * Chart 3 / 7 — Collateral mix rotation, sector-wide, Apr 30 → May 31.
 * Diverging bars: LRT family outflows on the left (negative) vs BTC
 * family inflows on the right (positive). Component breakdown shown
 * as ordered horizontal segments within each family group.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  LabelList,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM, INK } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  asset: string
  family: "LRT" | "BTC"
  flowMUsd: number
}

interface Props {
  data: { history: Datum[]; totals: { lrtMUsd: number; btcMUsd: number } }
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
        minWidth: 180,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{p.asset} <span style={{ color: MUTED, fontWeight: 400 }}>· {p.family} family</span></div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>Net flow</span>
        <span style={{ color: p.flowMUsd >= 0 ? COBALT : TERRACOTTA, fontWeight: 600 }}>{fmtUsdM(p.flowMUsd)}</span>
      </div>
    </div>
  )
}

export function CollateralRotationChart({ data }: Props) {
  // Order: LRT first (most negative at top), then BTC (most positive).
  const series = useMemo(() => {
    const lrt = data.history.filter((d) => d.family === "LRT").sort((a, b) => a.flowMUsd - b.flowMUsd)
    const btc = data.history.filter((d) => d.family === "BTC").sort((a, b) => b.flowMUsd - a.flowMUsd)
    return [...lrt, ...btc]
  }, [data.history])

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={series} margin={{ top: 12, right: 96, bottom: 8, left: 28 }}>
            <CartesianGrid stroke={FOG} strokeOpacity={0.4} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${v >= 0 ? "+" : "−"}$${Math.abs(v).toFixed(0)}M`}
              tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
              axisLine={{ stroke: FOG }}
              tickLine={false}
              domain={[-1400, 600]}
            />
            <YAxis
              type="category"
              dataKey="asset"
              tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={84}
            />
            <ReferenceLine x={0} stroke={INK} strokeOpacity={0.7} />
            <Bar dataKey="flowMUsd" isAnimationActive={false}>
              <LabelList
                dataKey="flowMUsd"
                position="right"
                formatter={(v: number) => fmtUsdM(v)}
                style={{ fontFamily: "var(--report-font-mono)", fontSize: 10, fill: MUTED }}
              />
              {series.map((d) => (
                <Cell key={d.asset} fill={d.family === "BTC" ? COBALT : TERRACOTTA} />
              ))}
            </Bar>
            <Tooltip content={<ReportTooltip />} cursor={{ fill: "rgba(31, 58, 95, 0.06)" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          paddingTop: 8,
          borderTop: `1px solid ${FOG}`,
          fontFamily: "var(--report-font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <div>
          <span style={{ color: MUTED }}>LRT family · </span>
          <span style={{ color: TERRACOTTA, fontWeight: 600 }}>{fmtUsdM(data.totals.lrtMUsd)}</span>
        </div>
        <div>
          <span style={{ color: MUTED }}>BTC family · </span>
          <span style={{ color: COBALT, fontWeight: 600 }}>{fmtUsdM(data.totals.btcMUsd)}</span>
        </div>
      </div>
    </div>
  )
}
