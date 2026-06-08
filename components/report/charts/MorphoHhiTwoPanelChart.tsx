"use client"

/**
 * Chart 5 / 7 — Morpho curator HHI trajectory + top-3 composition,
 * March → June 2026. Two panels side by side: HHI line with the 2,500
 * antitrust threshold reference, and a stacked bar of the top-three
 * curator share at each month.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM, INK } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface HhiPoint { label: string; hhi: number }
interface CompPoint { label: string; sentora: number; steakhouse: number; gauntlet: number }

interface Props {
  data: { hhi: HhiPoint[]; composition: CompPoint[] }
  params: ChartRegistryParams
}

function HhiTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as HhiPoint | undefined
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
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{p.label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>HHI</span>
        <span style={{ color: COBALT, fontWeight: 600 }}>{p.hhi.toLocaleString()}</span>
      </div>
    </div>
  )
}

function CompTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload as CompPoint | undefined
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
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "3px 12px" }}>
        <span style={{ color: MUTED }}>Sentora</span>
        <span style={{ color: COBALT, textAlign: "right" }}>{p.sentora.toFixed(1)}%</span>
        <span style={{ color: MUTED }}>Steakhouse</span>
        <span style={{ color: TERRACOTTA, textAlign: "right" }}>{p.steakhouse.toFixed(1)}%</span>
        <span style={{ color: MUTED }}>Gauntlet</span>
        <span style={{ color: FOG, textAlign: "right", filter: "brightness(0.7)" }}>{p.gauntlet.toFixed(1)}%</span>
      </div>
    </div>
  )
}

export function MorphoHhiTwoPanelChart({ data }: Props) {
  const lastHhi = data.hhi[data.hhi.length - 1]
  const GAUNTLET_COLOR = "#8FA1B8"
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "stretch" }}>
      {/* Left panel: HHI line */}
      <div style={{ height: 320 }}>
        <div style={{ fontFamily: "var(--report-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>
          Curator HHI — month-end + Jun 4
        </div>
        <ResponsiveContainer width="100%" height="92%">
          <ComposedChart data={data.hhi} margin={{ top: 12, right: 18, bottom: 8, left: -12 }}>
            <CartesianGrid stroke={FOG} strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }} axisLine={{ stroke: FOG }} tickLine={false} />
            <YAxis tickFormatter={(v: number) => v.toLocaleString()} tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} domain={[2400, 3500]} />
            <ReferenceLine
              y={2500}
              stroke={TERRACOTTA}
              strokeDasharray="4 4"
              label={{
                value: "Antitrust threshold 2,500",
                position: "insideTopLeft",
                fontSize: 10,
                fontFamily: "var(--report-font-mono)",
                fill: TERRACOTTA,
                offset: 6,
              }}
            />
            <Line dataKey="hhi" stroke={COBALT} strokeWidth={2.4} dot={{ r: 4, fill: COBALT, stroke: CREAM, strokeWidth: 1.5 }} isAnimationActive={false} />
            <ReferenceDot
              x={lastHhi.label}
              y={lastHhi.hhi}
              r={6}
              fill={TERRACOTTA}
              stroke={CREAM}
              strokeWidth={2}
              label={{
                value: `${lastHhi.hhi.toLocaleString()}`,
                position: "top",
                offset: 10,
                fontSize: 11,
                fontFamily: "var(--report-font-mono)",
                fill: TERRACOTTA,
                fontWeight: 600,
              }}
            />
            <Tooltip content={<HhiTooltip />} cursor={{ stroke: FOG, strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {/* Right panel: top-3 stacked bar */}
      <div style={{ height: 320 }}>
        <div style={{ fontFamily: "var(--report-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>
          Top-3 curator share by month
        </div>
        <ResponsiveContainer width="100%" height="92%">
          <BarChart data={data.composition} margin={{ top: 12, right: 18, bottom: 8, left: -12 }}>
            <CartesianGrid stroke={FOG} strokeOpacity={0.4} vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }} axisLine={{ stroke: FOG }} tickLine={false} />
            <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Bar dataKey="sentora" stackId="s" fill={COBALT} isAnimationActive={false} />
            <Bar dataKey="steakhouse" stackId="s" fill={TERRACOTTA} isAnimationActive={false} />
            <Bar dataKey="gauntlet" stackId="s" fill={GAUNTLET_COLOR} isAnimationActive={false} />
            <Tooltip content={<CompTooltip />} cursor={{ fill: "rgba(31, 58, 95, 0.06)" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: 24,
        paddingTop: 8,
        borderTop: `1px solid ${FOG}`,
        fontFamily: "var(--report-font-mono)",
        fontSize: 11,
        color: MUTED,
        letterSpacing: "0.04em",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-block", width: 12, height: 12, background: COBALT }} />
        Sentora
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-block", width: 12, height: 12, background: TERRACOTTA }} />
        Steakhouse Financial
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ display: "inline-block", width: 12, height: 12, background: GAUNTLET_COLOR }} />
        Gauntlet
      </span>
    </div>
    </div>
  )
}
