"use client"

/**
 * Chart 4 / 7 — USDC supply APY by protocol at May 31, 2026.
 *
 * Horizontal bar chart of the six covered protocols' USDC supply APY
 * at month-end, sorted leader-to-laggard, with a callout for the
 * cross-protocol dispersion (max − min, in basis points) and its
 * multiple of the trailing 12-month average.
 *
 * Source: content/snapshots/2026-05-rate-dispersion.json
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts"
import { COBALT, TERRACOTTA, MUTED, FOG, CREAM, INK } from "./_may26-palette"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Row {
  protocol: string
  supplyApyPct: number
  isLeader?: boolean
  isLaggard?: boolean
}

interface Props {
  data: {
    asOf: string
    rows: Row[]
    dispersionBps: number
    twelveMonthAverageBps: number
    multipleOfAverage: number
  }
  params: ChartRegistryParams
}

function colorFor(row: Row): string {
  if (row.isLeader) return TERRACOTTA
  if (row.isLaggard) return MUTED
  return COBALT
}

function ReportTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0]?.payload as Row | undefined
  if (!r) return null
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
        minWidth: 160,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{r.protocol}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: MUTED }}>USDC supply APY</span>
        <span style={{ color: colorFor(r), fontWeight: 600 }}>
          {r.supplyApyPct.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

export function UsdcSupplyApyByProtocolChart({ data }: Props) {
  // Sort descending by APY so leader appears at the top of the chart.
  const sorted = [...data.rows].sort((a, b) => b.supplyApyPct - a.supplyApyPct)

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: 24, alignItems: "center" }}>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 16, right: 32, bottom: 24, left: 0 }}
          >
            <CartesianGrid stroke={FOG} strokeOpacity={0.4} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
              axisLine={{ stroke: FOG }}
              tickLine={false}
              domain={[0, 6.5]}
              ticks={[0, 1, 2, 3, 4, 5, 6]}
              label={{
                value: "Supply APY",
                position: "insideBottom",
                dy: 14,
                style: {
                  fontFamily: "var(--report-font-mono)",
                  fontSize: 10,
                  fill: MUTED,
                  letterSpacing: "0.08em",
                },
              }}
            />
            <YAxis
              type="category"
              dataKey="protocol"
              tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: INK }}
              axisLine={false}
              tickLine={false}
              width={92}
            />
            <Tooltip content={<ReportTooltip />} cursor={{ fill: "rgba(31, 58, 95, 0.06)" }} />
            <Bar dataKey="supplyApyPct" isAnimationActive={false} radius={[0, 2, 2, 0]}>
              {sorted.map((row) => (
                <Cell key={row.protocol} fill={colorFor(row)} />
              ))}
              <LabelList
                dataKey="supplyApyPct"
                position="right"
                offset={8}
                formatter={(v: number) => `${v.toFixed(2)}%`}
                style={{
                  fontFamily: "var(--report-font-mono)",
                  fontSize: 11,
                  fill: INK,
                  fontWeight: 600,
                }}
              />
            </Bar>
          </BarChart>
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
        <Stat
          label="Dispersion (max − min)"
          value={`${data.dispersionBps.toFixed(1)} bps`}
          color={TERRACOTTA}
        />
        <Stat
          label="12-mo average"
          value={`${data.twelveMonthAverageBps.toFixed(1)} bps`}
          color={COBALT}
        />
        <Stat
          label="Multiple of average"
          value={`${data.multipleOfAverage.toFixed(2)}×`}
          color={COBALT}
        />
        <div
          style={{
            paddingTop: 6,
            borderTop: `1px solid ${FOG}`,
            fontSize: 10,
            color: MUTED,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          USDC running widest of the three assets tracked at May 31
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: MUTED,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--report-font-serif)",
          fontSize: 22,
          fontWeight: 600,
          color,
        }}
      >
        {value}
      </div>
    </div>
  )
}
