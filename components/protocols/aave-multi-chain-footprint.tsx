"use client"

/**
 * Multi-Chain Footprint — Aave V3 protocol-specific lens.
 *
 * Single horizontal bar chart showing Aave V3's footprint across every
 * chain it's deployed on. Filter toggle picks which dimension to rank:
 *
 *   - Available Liquidity → DefiLlama `chainTvls.<Chain>.tvl` (unborrowed)
 *   - Active Borrows      → DefiLlama `chainTvls.<Chain>-borrowed`
 *
 * The toggle swaps the chart's data, title, methodology copy, and auto
 * insight line all together so a reader landing on the Borrows view
 * never sees Supply-side prose.
 *
 * Long tail past the top 7 individual chains is rolled into "Other (N
 * chains)" so the dominant deployment story stays legible.
 */

import { useMemo, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import { formatUSD, formatPercent } from "@/lib/utils"

type View = "available" | "borrows"

const VIEW_LABEL: Record<View, string> = {
  available: "Available Liquidity",
  borrows: "Active Borrows",
}
const VIEW_NOUN: Record<View, string> = {
  available: "Available Liquidity",
  borrows: "active borrows",
}
const VIEW_METHODOLOGY: Record<View, string> = {
  available: "aave-multi-chain-available",
  borrows: "aave-multi-chain-borrows",
}

interface Props {
  /** Per-chain Available Liquidity (DefiLlama net-liquidity TVL) in USD. */
  multiChainAvailable: Record<string, number>
  /** Per-chain Active Borrows in USD. */
  multiChainBorrowed: Record<string, number>
  /** Protocol brand color used for the bars. */
  color: string
  /** Protocol display name for the title + insight. */
  protocolName: string
}

interface Row {
  chain: string
  value: number
  sharePct: number
}

const TOP_N = 8

function buildRows(dict: Record<string, number>): { rows: Row[]; total: number } {
  const total = Object.values(dict).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  if (total <= 0) return { rows: [], total: 0 }
  const sorted = Object.entries(dict)
    .filter(([, v]) => v > 0)
    .map(([chain, value]) => ({
      chain,
      value,
      sharePct: (value / total) * 100,
    }))
    .sort((a, b) => b.value - a.value)
  if (sorted.length <= TOP_N) return { rows: sorted, total }
  const head = sorted.slice(0, TOP_N - 1)
  const tail = sorted.slice(TOP_N - 1)
  const tailValue = tail.reduce((s, r) => s + r.value, 0)
  const tailShare = tail.reduce((s, r) => s + r.sharePct, 0)
  return {
    rows: [
      ...head,
      { chain: `Other (${tail.length} chains)`, value: tailValue, sharePct: tailShare },
    ],
    total,
  }
}

function FootprintTooltip({ active, payload, view }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0]?.payload as Row
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
        {r.chain}
      </p>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>{VIEW_LABEL[view as View]}</span>
        <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatUSD(r.value)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>Share</span>
        <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatPercent(r.sharePct, 1)}
        </span>
      </div>
    </div>
  )
}

export function AaveMultiChainFootprint({
  multiChainAvailable,
  multiChainBorrowed,
  color,
  protocolName,
}: Props) {
  const [view, setView] = useState<View>("available")
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const sourceDict = view === "available" ? multiChainAvailable : multiChainBorrowed
  const { rows, total } = useMemo(() => buildRows(sourceDict), [sourceDict])
  const ethRow = rows.find((r) => r.chain === "Ethereum")
  const ethShare = ethRow?.sharePct ?? 0
  // Reverse so the largest chain renders at the top of the horizontal chart.
  const data = [...rows].reverse()
  // Dynamic chart height — same trick as the top-markets bar chart.
  const chartHeight = Math.max(220, data.length * 32 + 40)

  if (rows.length === 0) {
    return null
  }

  const title = `${protocolName} · ${VIEW_LABEL[view]} by Chain`

  return (
    <div className="space-y-2 flex flex-col">
      <div
        ref={cardRef}
        className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col flex-1"
      >
        <div
          className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {title}
            <MethodologyTooltip methodologyKey={VIEW_METHODOLOGY[view]} />
          </span>
          <div className="flex items-center gap-2">
            <ViewToggle view={view} setView={setView} />
            <ChartActions cardRef={cardRef} title={title} />
          </div>
        </div>
        <div className="p-4 chart-body" style={{ height: `${chartHeight}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 28, left: 10, bottom: 0 }}>
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => formatUSD(v)}
              />
              <YAxis
                type="category"
                dataKey="chain"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                width={130}
              />
              <Tooltip content={<FootprintTooltip view={view} />} cursor={{ fill: "rgba(15, 17, 21, 0.04)" }} />
              <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                {data.map((r, i) => (
                  // Ethereum bar uses the protocol's brand color; other chains
                  // a faded version so the comparison reads at a glance.
                  <Cell
                    key={r.chain}
                    fill={color}
                    fillOpacity={r.chain === "Ethereum" ? 0.85 : 0.3 + (i / data.length) * 0.4}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function ViewToggle({
  view,
  setView,
}: {
  view: View
  setView: (v: View) => void
}) {
  const options: View[] = ["available", "borrows"]
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--card-border)",
        borderRadius: "4px",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => setView(opt)}
          style={{
            padding: "4px 10px",
            fontSize: "10px",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
            fontFamily: "inherit",
            backgroundColor: view === opt ? "var(--card-border)" : "transparent",
            color: view === opt ? "var(--text-primary)" : "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {opt === "available" ? "Available" : "Borrows"}
        </button>
      ))}
    </div>
  )
}
