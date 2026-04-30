"use client"

/**
 * Net Flows v1 — Zone 4 of the Sector Overview rebuild.
 *
 * Per-protocol horizontal bars over the trailing 30 days. Each bar is split
 * into two stacked segments:
 *   - Interest accrual (sum of dailyUserFees / dailyFees fallback over 30d)
 *   - Organic deposits = total net flow − interest accrual (can be negative)
 *
 * Total flow = the protocol's net change in supplied USD over the period.
 * Reading the chart: an Aave V3 bar that's mostly interest with a small
 * organic-negative slice tells you "users net withdrew but interest still
 * carried the supply base higher".
 */

import { useRef } from "react"
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
import { PROTOCOLS } from "@/lib/protocols"
import { formatUSD } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"

interface Props {
  title: string
  netDeposits30d: Record<string, number>
  interest30d: Record<string, number>
  methodologyKey?: string
}

interface FlowRow {
  slug: string
  name: string
  color: string
  organic: number
  interest: number
  total: number
}

function FlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as FlowRow | undefined
  if (!row) return null
  return (
    <div className="custom-tooltip min-w-[220px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
        <span className="text-xs font-semibold text-text-primary">{row.name}</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-secondary">Organic deposits</span>
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: row.organic >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {row.organic >= 0 ? "+" : "−"}
            {formatUSD(Math.abs(row.organic))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-text-secondary">Interest accrual</span>
          <span className="text-xs font-medium text-text-primary tabular-nums">
            +{formatUSD(row.interest)}
          </span>
        </div>
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs text-text-secondary">Total 30d</span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: row.total >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          {row.total >= 0 ? "+" : "−"}
          {formatUSD(Math.abs(row.total))}
        </span>
      </div>
    </div>
  )
}

export function NetFlows30d({
  title,
  netDeposits30d,
  interest30d,
  methodologyKey,
}: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)

  const rows: FlowRow[] = PROTOCOLS.map((p) => {
    const total = netDeposits30d[p.slug] ?? 0
    const interest = interest30d[p.slug] ?? 0
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      organic: total - interest,
      interest,
      total,
    }
  }).sort((a, b) => b.total - a.total)

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
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Trailing 30d
          </span>
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[280px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 5, right: 16, left: 0, bottom: 0 }}
            stackOffset="sign"
          >
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => formatUSD(v)}
            />
            <YAxis
              dataKey="name"
              type="category"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: colors.textPrimary }}
              width={88}
            />
            <Tooltip
              content={<FlowTooltip />}
              cursor={{ fill: "rgba(15, 17, 21, 0.04)" }}
            />
            <ReferenceLine x={0} stroke={colors.textMuted} strokeOpacity={0.5} />
            <Bar dataKey="organic" stackId="flow" radius={[2, 0, 0, 2]}>
              {rows.map((r) => (
                <Cell
                  key={r.slug}
                  fill={r.organic >= 0 ? r.color : "var(--accent-red)"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
            <Bar dataKey="interest" stackId="flow" radius={[0, 2, 2, 0]}>
              {rows.map((r) => (
                <Cell key={r.slug} fill={r.color} fillOpacity={0.35} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-2 rounded-sm"
            style={{ background: "var(--text-primary)", opacity: 0.85 }}
          />
          <span>Organic (net deposits − interest)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-2 rounded-sm"
            style={{ background: "var(--text-primary)", opacity: 0.35 }}
          />
          <span>Interest accrual</span>
        </div>
      </div>
    </div>
  )
}
