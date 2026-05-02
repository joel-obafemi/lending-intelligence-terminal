"use client"

/**
 * Fluid lens — Capital Efficiency + Liquidation Penalty cross-protocol bars.
 *
 * Two horizontal-bar modules side-by-side. Both carry Fluid's pitch:
 *  - Capital Efficiency (borrows ÷ supplied) makes "more borrow per
 *    dollar deposited" empirical against the other three protocols.
 *  - Liquidation Penalty (avg effective bonus paid on liquidations)
 *    surfaces the gap between Fluid's ~0.10% claim and what other
 *    protocols actually pay out.
 *
 * Each chart highlights the Fluid bar in the protocol's brand color and
 * dims the rest, then surfaces an auto insight line beneath ("X% lower
 * than the next-best protocol").
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
} from "recharts"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import { useThemeColors } from "../theme-provider"
import { formatPercent, formatUSD } from "@/lib/utils"
import type {
  ProtocolEfficiencyRow,
  ProtocolLiquidationPenaltyRow,
} from "@/lib/fluid-comparisons"

interface ComparisonsProps {
  efficiency: ProtocolEfficiencyRow[]
  liquidationPenalty: ProtocolLiquidationPenaltyRow[]
  liquidationPeriodDays: number
}

const FLUID_SLUG = "fluid"

export function FluidComparisons({
  efficiency,
  liquidationPenalty,
  liquidationPeriodDays,
}: ComparisonsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CapitalEfficiencyChart rows={efficiency} />
      <LiquidationPenaltyChart
        rows={liquidationPenalty}
        periodDays={liquidationPeriodDays}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Capital Efficiency (borrows ÷ supplied)
// ─────────────────────────────────────────────────────────────────────────

function CapitalEfficiencyChart({ rows }: { rows: ProtocolEfficiencyRow[] }) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const TITLE = "Capital Efficiency · Borrows ÷ Supplied"

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.efficiency - a.efficiency).reverse(),
    [rows],
  )

  const insight = useMemo(() => buildEfficiencyInsight(rows), [rows])

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between"
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
          <MethodologyTooltip methodologyKey="fluid-capital-efficiency" />
        </span>
        <ChartActions cardRef={cardRef} title={TITLE} />
      </div>
      <div className="p-4 chart-body" style={{ height: "200px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
          >
            <XAxis
              type="number"
              domain={[0, 1]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
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
              content={<EfficiencyTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Bar dataKey="efficiency" radius={[0, 2, 2, 0]}>
              {sorted.map((r) => (
                <Cell
                  key={r.slug}
                  fill={r.color}
                  fillOpacity={r.slug === FLUID_SLUG ? 0.85 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {insight && (
        <div
          className="px-4 pb-3 pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {insight}
        </div>
      )}
    </div>
  )
}

function EfficiencyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as ProtocolEfficiencyRow
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {r.name}
      </p>
      <Row label="Borrows ÷ Supplied" value={formatPercent(r.efficiency * 100, 1)} />
      <Row label="Total Borrows" value={formatUSD(r.totalBorrowedUsd)} muted />
      <Row label="Total Supplied" value={formatUSD(r.totalSuppliedUsd)} muted />
    </div>
  )
}

function buildEfficiencyInsight(rows: ProtocolEfficiencyRow[]): string | null {
  const fluid = rows.find((r) => r.slug === FLUID_SLUG)
  if (!fluid || fluid.efficiency <= 0) return null
  const others = rows.filter((r) => r.slug !== FLUID_SLUG && r.efficiency > 0)
  if (others.length === 0) return null
  const nextBest = others.reduce((acc, r) =>
    r.efficiency > acc.efficiency ? r : acc,
  )
  const fluidPct = fluid.efficiency * 100
  const nextPct = nextBest.efficiency * 100
  const diff = fluidPct - nextPct
  if (diff > 0) {
    return `Fluid borrows $${(fluid.efficiency * 100).toFixed(0)}¢ for every $1 supplied — ${diff.toFixed(1)} pp ahead of the next-most-efficient protocol (${nextBest.name} at ${nextPct.toFixed(1)}%).`
  }
  return `Fluid borrows $${(fluid.efficiency * 100).toFixed(0)}¢ for every $1 supplied; ${nextBest.name} runs higher at ${nextPct.toFixed(1)}%.`
}

// ─────────────────────────────────────────────────────────────────────────
// Liquidation Penalty (effective bonus paid)
// ─────────────────────────────────────────────────────────────────────────

function LiquidationPenaltyChart({
  rows,
  periodDays,
}: {
  rows: ProtocolLiquidationPenaltyRow[]
  periodDays: number
}) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const TITLE = `Liquidation Penalty · ${periodDays}d effective`

  // Drop protocols with no events from the chart so an empty bar doesn't
  // stretch the y-axis. Sort smallest-first so Fluid (typically lowest)
  // sits on top after the recharts vertical-layout reverse.
  const sorted = useMemo(
    () =>
      rows
        .filter((r) => r.effectivePenaltyPct != null && r.eventCount > 0)
        .sort((a, b) => (a.effectivePenaltyPct ?? 0) - (b.effectivePenaltyPct ?? 0))
        .reverse(),
    [rows],
  )

  const insight = useMemo(() => buildPenaltyInsight(rows), [rows])

  if (sorted.length === 0) {
    return (
      <div className="tui-card bg-card-bg border border-card-border rounded p-4 text-xs text-text-muted">
        Liquidator-economy DB unavailable — Liquidation Penalty comparison
        will render once a snapshot loads.
      </div>
    )
  }

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between"
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
          <MethodologyTooltip methodologyKey="fluid-liquidation-penalty" />
        </span>
        <ChartActions cardRef={cardRef} title={TITLE} />
      </div>
      <div className="p-4 chart-body" style={{ height: "200px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
          >
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
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
              content={<PenaltyTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Bar dataKey="effectivePenaltyPct" radius={[0, 2, 2, 0]}>
              {sorted.map((r) => (
                <Cell
                  key={r.slug}
                  fill={r.color}
                  fillOpacity={r.slug === FLUID_SLUG ? 0.85 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {insight && (
        <div
          className="px-4 pb-3 pt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {insight}
        </div>
      )}
    </div>
  )
}

function PenaltyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload as ProtocolLiquidationPenaltyRow
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {r.name}
      </p>
      <Row
        label="Effective Penalty"
        value={
          r.effectivePenaltyPct != null
            ? formatPercent(r.effectivePenaltyPct, 2)
            : "—"
        }
      />
      <Row label="Events" value={r.eventCount.toLocaleString()} muted />
      <Row label="Debt Repaid" value={formatUSD(r.totalDebtUsd)} muted />
    </div>
  )
}

function buildPenaltyInsight(
  rows: ProtocolLiquidationPenaltyRow[],
): string | null {
  const fluid = rows.find((r) => r.slug === FLUID_SLUG)
  if (!fluid || fluid.effectivePenaltyPct == null) return null
  const others = rows.filter(
    (r) => r.slug !== FLUID_SLUG && r.effectivePenaltyPct != null,
  )
  if (others.length === 0) return null
  const otherAvg =
    others.reduce((s, r) => s + (r.effectivePenaltyPct ?? 0), 0) / others.length
  const fluidPct = fluid.effectivePenaltyPct
  const gap = otherAvg - fluidPct
  if (gap > 0) {
    return `Fluid pays ${formatPercent(fluidPct, 2)} on liquidations vs a ${formatPercent(otherAvg, 2)} average across the other three protocols — ${formatPercent(gap, 2)} cheaper for borrowers when positions get liquidated.`
  }
  return `Fluid effective penalty: ${formatPercent(fluidPct, 2)}; cross-protocol average: ${formatPercent(otherAvg, 2)}.`
}

// ─────────────────────────────────────────────────────────────────────────
// Tooltip helpers
// ─────────────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
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
