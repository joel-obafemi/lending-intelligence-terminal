"use client"

/**
 * Net Flow Bar Chart — vertical-bar replacement for Zone 4.
 *
 * One bar per protocol over the trailing 30 days. Each bar is stacked
 * with two segments:
 *   - Organic deposits — Total − Interest accrual. Saturated accent
 *     orange when positive, brand red when negative.
 *   - Interest accrual — always positive (interest can't go backward).
 *     Rendered in a muted grey so the saturated organic segment stays
 *     the visual focus.
 *
 * Linear y-axis is honest about magnitude — when one protocol's flow is
 * 30× larger than the rest, the small bars compress, but that's the
 * accurate story. The takeaway sentence beneath does the work of
 * surfacing the small movers in words.
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
import { formatUSD, formatPercent } from "@/lib/utils"
import { formatUsdShort } from "@/lib/headline-sentence"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import type { OverviewProtocolRow } from "@/lib/overview"

interface Props {
  netDeposits30d: Record<string, number>
  interest30d: Record<string, number>
  protocols: OverviewProtocolRow[]
  methodologyKey?: string
}

interface BarRow {
  slug: string
  name: string
  /** Cross-protocol identity color — used in the legend / tooltip header. */
  color: string
  total: number
  interest: number
  organic: number
  organicSharePct: number | null
  pctOfTvl: number | null
}

const ORGANIC_POS = "var(--accent-orange)"
const ORGANIC_NEG = "var(--danger)"
// Muted grey for interest accrual — always positive, never the visual focus.
const INTEREST_FILL = "rgba(91, 99, 115, 0.35)"

function buildRows(
  netDeps: Record<string, number>,
  interest: Record<string, number>,
  protocols: OverviewProtocolRow[],
): BarRow[] {
  return PROTOCOLS.map((p) => {
    const total = netDeps[p.slug] ?? 0
    const interestVal = interest[p.slug] ?? 0
    const organic = total - interestVal
    const protoRow = protocols.find((r) => r.slug === p.slug)
    const tvl = protoRow?.tvl ?? 0
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      total,
      interest: interestVal,
      organic,
      organicSharePct:
        Math.abs(total) > 0 ? (Math.abs(organic) / Math.abs(total)) * 100 : null,
      pctOfTvl: tvl > 0 ? (total / tvl) * 100 : null,
    }
  }).sort((a, b) => b.total - a.total)
}

function buildTakeaway(rows: BarRow[]): string | null {
  if (rows.length === 0) return null
  const inflows = rows.filter((r) => r.total > 0)
  const outflows = rows.filter((r) => r.total < 0)
  if (outflows.length === 0 && inflows.length === 0) return null
  const biggestOut =
    outflows.length > 0
      ? outflows.reduce((b, r) => (Math.abs(r.total) > Math.abs(b.total) ? r : b))
      : null
  const biggestIn =
    inflows.length > 0 ? inflows.reduce((b, r) => (r.total > b.total ? r : b)) : null
  const parts: string[] = []
  if (biggestOut) {
    const organicShare = biggestOut.organicSharePct
    parts.push(
      `${biggestOut.name} saw ${formatUsdShort(Math.abs(biggestOut.total))} leave (${organicShare != null ? `${organicShare.toFixed(0)}% organic` : "organic share unavailable"})`,
    )
  }
  if (biggestIn) {
    const onlyPos = inflows.length === 1
    parts.push(
      `${biggestIn.name} added ${formatUsdShort(biggestIn.total)} of net new deposits${onlyPos ? " — the only protocol with positive flows this month" : ""}`,
    )
  }
  return parts.join(". ") + "."
}

function FlowTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as BarRow | undefined
  if (!row) return null
  return (
    <div className="custom-tooltip min-w-[240px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
        <span className="text-xs font-semibold text-text-primary">{row.name}</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Organic deposits</span>
          <span
            className="font-medium tabular-nums"
            style={{ color: row.organic >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {row.organic >= 0 ? "+" : "−"}
            {formatUSD(Math.abs(row.organic))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Interest accrual</span>
          <span className="font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
            +{formatUSD(row.interest)}
          </span>
        </div>
      </div>
      <div
        className="border-t mt-2 pt-2 flex items-center justify-between"
        style={{ borderColor: "var(--card-border)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Total 30d
        </span>
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: row.total >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          {row.total >= 0 ? "+" : "−"}
          {formatUSD(Math.abs(row.total))}
        </span>
      </div>
      {row.pctOfTvl != null && (
        <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
          {row.pctOfTvl >= 0 ? "+" : "−"}
          {Math.abs(row.pctOfTvl).toFixed(1)}% of current TVL · organic share{" "}
          {row.organicSharePct != null ? formatPercent(row.organicSharePct, 0) : "—"}
        </div>
      )}
    </div>
  )
}

export function NetFlowBarChart({
  netDeposits30d,
  interest30d,
  protocols,
  methodologyKey,
}: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const rows = buildRows(netDeposits30d, interest30d, protocols)
  const takeaway = buildTakeaway(rows)

  return (
    <div className="space-y-2">
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
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Net Supply Flows · Trailing 30 days
            <MethodologyTooltip methodologyKey={methodologyKey} />
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Organic = Total − Interest accrual
          </span>
        </div>
        <div className="relative p-4 h-[300px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 16, right: 16, left: 8, bottom: 0 }}
              stackOffset="sign"
            >
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: colors.textPrimary }}
                interval={0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => formatUSD(v)}
                width={70}
              />
              <Tooltip
                content={<FlowTooltip />}
                cursor={{ fill: "rgba(15, 17, 21, 0.04)" }}
              />
              <ReferenceLine y={0} stroke={colors.textMuted} strokeOpacity={0.5} />
              <Bar dataKey="organic" stackId="flow" radius={[2, 2, 0, 0]}>
                {rows.map((r) => (
                  <Cell key={r.slug} fill={r.organic >= 0 ? ORGANIC_POS : ORGANIC_NEG} />
                ))}
              </Bar>
              <Bar dataKey="interest" stackId="flow" radius={[2, 2, 0, 0]}>
                {rows.map((r) => (
                  <Cell key={r.slug} fill={INTEREST_FILL} />
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
              style={{ background: ORGANIC_POS }}
            />
            <span>Organic deposits (positive)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{ background: ORGANIC_NEG }}
            />
            <span>Organic withdrawals (negative)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-2 rounded-sm"
              style={{ background: INTEREST_FILL }}
            />
            <span>Interest accrual</span>
          </div>
        </div>
      </div>
      {takeaway && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {takeaway}
        </p>
      )}
    </div>
  )
}
