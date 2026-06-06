"use client"

/**
 * Chart 4 / 7 — Aave V3 USDC market at May 31, 2026. The IRM curve
 * (borrow rate vs utilization) with a dot at the current 97.6%
 * utilization, plus a side panel surfacing the three headline numbers
 * (utilization, supply APY, borrow APY).
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM, INK } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Props {
  data: {
    kinkPct: number          // optimal-utilization kink (Aave V3 USDC ≈ 90%)
    currentPct: number       // 97.6
    supplyApyPct: number     // 9.62
    borrowApyPct: number     // 10.95
    baseRatePct: number      // ~0
    slope1Pct: number        // pre-kink slope (rate at kink)
    slope2Pct: number        // post-kink slope (rate at 100% util)
  }
  params: ChartRegistryParams
}

interface CurvePoint { util: number; borrow: number }

function ReportTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as CurvePoint | undefined
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
        minWidth: 150,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>Utilization {p.util.toFixed(0)}%</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>Borrow APY</span>
        <span style={{ color: COBALT, fontWeight: 600 }}>{p.borrow.toFixed(2)}%</span>
      </div>
    </div>
  )
}

export function AaveUsdcIrmChart({ data }: Props) {
  const { kinkPct, currentPct, supplyApyPct, borrowApyPct, baseRatePct, slope1Pct, slope2Pct } = data
  // Sample the IRM curve every 2%, kinked at `kinkPct`.
  const curve = useMemo<CurvePoint[]>(() => {
    const out: CurvePoint[] = []
    for (let u = 0; u <= 100; u += 2) {
      let r: number
      if (u <= kinkPct) {
        r = baseRatePct + (slope1Pct - baseRatePct) * (u / kinkPct)
      } else {
        r = slope1Pct + (slope2Pct - slope1Pct) * ((u - kinkPct) / (100 - kinkPct))
      }
      out.push({ util: u, borrow: r })
    }
    return out
  }, [baseRatePct, slope1Pct, slope2Pct, kinkPct])

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: 24, alignItems: "center" }}>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={curve} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
            <defs>
              <linearGradient id="irmFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={COBALT} stopOpacity={0.18} />
                <stop offset="100%" stopColor={COBALT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={FOG} strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="util"
              type="number"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
              axisLine={{ stroke: FOG }}
              tickLine={false}
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              label={{
                value: "Utilization",
                position: "insideBottom",
                dy: 14,
                style: { fontFamily: "var(--report-font-mono)", fontSize: 10, fill: MUTED, letterSpacing: "0.08em" },
              }}
            />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
              axisLine={false}
              tickLine={false}
              domain={[0, 60]}
              width={48}
            />
            <ReferenceLine
              x={kinkPct}
              stroke={MUTED}
              strokeDasharray="3 4"
              strokeOpacity={0.6}
              label={{
                value: `Kink ${kinkPct}%`,
                position: "top",
                fontSize: 10,
                fontFamily: "var(--report-font-mono)",
                fill: MUTED,
              }}
            />
            <Area dataKey="borrow" stroke={COBALT} strokeWidth={2} fill="url(#irmFill)" isAnimationActive={false} dot={false} />
            <ReferenceDot
              x={currentPct}
              y={borrowApyPct}
              r={6}
              fill={TERRACOTTA}
              stroke={CREAM}
              strokeWidth={2}
              label={{
                value: `${borrowApyPct.toFixed(2)}%`,
                position: "left",
                offset: 12,
                fontSize: 11,
                fontFamily: "var(--report-font-mono)",
                fill: TERRACOTTA,
                fontWeight: 600,
              }}
            />
            <Tooltip content={<ReportTooltip />} cursor={{ stroke: FOG, strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <aside
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "20px 18px",
          background: "rgba(31, 58, 95, 0.04)",
          border: `1px solid ${FOG}`,
          borderRadius: 4,
          fontFamily: "var(--report-font-mono)",
        }}
      >
        <Stat label="Utilization" value={`${currentPct}%`} color={TERRACOTTA} />
        <Stat label="Supply APY" value={`${supplyApyPct.toFixed(2)}%`} color={COBALT} />
        <Stat label="Borrow APY" value={`${borrowApyPct.toFixed(2)}%`} color={COBALT} />
        <div style={{ paddingTop: 6, borderTop: `1px solid ${FOG}`, fontSize: 10, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Sitting {(currentPct - kinkPct).toFixed(1)} pp past the kink
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--report-font-serif)", fontSize: 28, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}
