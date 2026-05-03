"use client"

/**
 * Risk page lens — Liquidation Efficiency comparison.
 *
 * Single horizontal-bar chart, four bars (one per protocol). Each bar
 * is the effective ratio of $ collateral seized ÷ $ debt repaid on
 * actual liquidation events over the trailing 90 days, weighted by
 * event size. Lower = cheaper for borrowers when liquidated.
 *
 *   ratio = 1 + (collat − debt) / debt
 *
 * Fluid's smart-collateral mechanic targets ~1.001 (the ~0.1% claim
 * verified empirically); Aave V3 / Spark sit ~1.05-1.08 (the standard
 * 5-8% liquidation bonus); Morpho varies per market.
 *
 * Auto-insight beneath the chart calls out Fluid's gap when the
 * cross-protocol average is meaningfully higher.
 */

import { useMemo, useRef } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import { useThemeColors } from "../theme-provider"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { ProtocolLiquidationPenaltyRow } from "@/lib/fluid-comparisons"

interface Props {
  rows: ProtocolLiquidationPenaltyRow[]
  periodDays: number
}

interface Datum {
  slug: string
  name: string
  color: string
  /** $ collateral seized per $ debt repaid; 1.0 = perfect, 1.05 = 5% bonus. */
  ratio: number
  effectivePenaltyPct: number
  eventCount: number
  totalDebtUsd: number
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as Datum
  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {d.name}
      </p>
      <Row label="$ collateral / $ debt" value={d.ratio.toFixed(4)} />
      <Row
        label="Effective penalty"
        value={formatPercent(d.effectivePenaltyPct, 2)}
        muted
      />
      <Row label="Events" value={d.eventCount.toLocaleString()} muted />
      <Row label="Debt repaid" value={formatUSD(d.totalDebtUsd)} muted />
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        className="tabular-nums"
        style={{ color: muted ? "var(--text-muted)" : "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  )
}

export function LiquidationEfficiencyComparison({ rows, periodDays }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const colors = useThemeColors()
  const TITLE = `Liquidation Efficiency · ${periodDays}d`

  const data: Datum[] = useMemo(() => {
    return rows
      .filter(
        (r) =>
          r.effectivePenaltyPct != null &&
          Number.isFinite(r.effectivePenaltyPct) &&
          r.eventCount > 0,
      )
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        color: r.color,
        ratio: 1 + (r.effectivePenaltyPct as number) / 100,
        effectivePenaltyPct: r.effectivePenaltyPct as number,
        eventCount: r.eventCount,
        totalDebtUsd: r.totalDebtUsd,
      }))
      // Smallest-ratio first so bars render bottom-up cheapest → most-expensive.
      .sort((a, b) => b.ratio - a.ratio)
  }, [rows])

  const insight = useMemo(() => buildInsight(data), [data])

  if (data.length === 0) {
    return (
      <div
        className="tui-card bg-card-bg border border-card-border rounded p-6 text-[11px] text-center"
        style={{ color: "var(--text-muted)" }}
      >
        Liquidator-economy DB unavailable — Liquidation Efficiency
        renders once a liquidation snapshot loads.
      </div>
    )
  }

  // Domain pads from 1.00 (the floor) to slightly above the worst bar.
  const max = Math.max(...data.map((d) => d.ratio), 1.0)
  const domainMax = Math.min(2.0, max + 0.02)

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {TITLE}
          <MethodologyTooltip methodologyKey="risk-liquidation-efficiency" />
        </span>
        <ChartActions cardRef={cardRef} title={TITLE} />
      </div>
      <div className="p-4 chart-body" style={{ height: "200px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 36, left: 8, bottom: 0 }}
          >
            <XAxis
              type="number"
              domain={[1.0, domainMax]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${v.toFixed(2)}×`}
            />
            <YAxis
              type="category"
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              width={100}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <ReferenceLine
              x={1.0}
              stroke={colors.textMuted}
              strokeDasharray="2 4"
              label={{
                value: "1.00× (no penalty)",
                position: "insideBottomLeft",
                fontSize: 9,
                fill: colors.textMuted,
              }}
            />
            <Bar dataKey="ratio" radius={[0, 2, 2, 0]}>
              {data.map((d) => (
                <Cell key={d.slug} fill={d.color} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {insight && (
        <p
          className="px-4 pb-3 pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {insight}
        </p>
      )}
    </div>
  )
}

function buildInsight(data: Datum[]): string | null {
  if (data.length < 2) return null
  const cheapest = [...data].sort((a, b) => a.ratio - b.ratio)[0]
  const others = data.filter((d) => d.slug !== cheapest.slug)
  const otherAvgPct =
    others.reduce((s, d) => s + d.effectivePenaltyPct, 0) / others.length
  const cheapestPct = cheapest.effectivePenaltyPct
  const gap = otherAvgPct - cheapestPct
  if (gap > 0.5) {
    return `${cheapest.name} liquidations cost borrowers ${formatPercent(cheapestPct, 2)} on average — ${formatPercent(gap, 2)} cheaper than the ${formatPercent(otherAvgPct, 2)} mean across the other protocols.`
  }
  return `Cross-protocol liquidation penalty band: ${formatPercent(cheapestPct, 2)} (${cheapest.name}) to ${formatPercent(Math.max(...data.map((d) => d.effectivePenaltyPct)), 2)}.`
}
