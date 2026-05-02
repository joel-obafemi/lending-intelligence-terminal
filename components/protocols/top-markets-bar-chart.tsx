"use client"

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
import { formatUSD } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import type { MarketRow } from "@/lib/protocol-detail"

type View = "supply" | "available" | "borrows"

const VIEW_LABEL: Record<View, string> = {
  supply: "Total Supply",
  available: "Available Liquidity",
  borrows: "Borrows",
}

const VIEW_METHODOLOGY: Record<View, string> = {
  supply: "protocol-top-markets",
  available: "protocol-top-markets-available",
  borrows: "protocol-top-markets-borrows",
}

interface Props {
  /** Display name of the protocol — combined with the active filter to
   *  build the chart's title (e.g. "Aave V3 · Top Markets by Borrows"). */
  protocolName: string
  color: string
  markets: MarketRow[]
  /** Number of markets to show in the bar chart (default 10). */
  topN?: number
  /** Default filter selection. Defaults to total supply for the canonical
   *  "what's the biggest market" answer. */
  defaultView?: View
  /** Restrict the filter pills to the views the caller wants to expose.
   *  Aave V3 / Spark / Fluid pages use ["available", "borrows"]; Morpho
   *  uses just ["supply"] since vault rows don't expose borrowed USD. */
  views?: View[]
  /** Architecture-aware noun for chart title and bar tooltip. Defaults
   *  to "Markets" — Morpho / Fluid pass "Vaults" so a Fluid reader
   *  doesn't see "Top Markets" right above a "Vaults" table. */
  itemNoun?: "Markets" | "Vaults"
}

function valueFor(m: MarketRow, view: View): number {
  switch (view) {
    case "supply":
      return m.totalSupplyUsd
    case "available":
      return m.tvlUsd
    case "borrows":
      return m.borrowedUsd ?? 0
  }
}

function CustomTooltip({ active, payload, view }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as MarketRow
  const v = valueFor(row, view as View)
  return (
    <div className="custom-tooltip min-w-[180px]">
      <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {row.asset}
        {row.subLabel && (
          <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            {row.subLabel}
          </span>
        )}
      </p>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>
          {VIEW_LABEL[view as View]}
        </span>
        <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatUSD(v)}
        </span>
      </div>
      {/* Always surface the other two scale numbers in the tooltip so the
          reader has the full picture even when filtering. */}
      {(view as View) !== "supply" && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Total Supply</span>
          <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
            {formatUSD(row.totalSupplyUsd)}
          </span>
        </div>
      )}
      {(view as View) !== "available" && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Available Liquidity</span>
          <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
            {formatUSD(row.tvlUsd)}
          </span>
        </div>
      )}
      {(view as View) !== "borrows" && row.borrowedUsd != null && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <span style={{ color: "var(--text-secondary)" }}>Borrowed</span>
          <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
            {formatUSD(row.borrowedUsd)}
          </span>
        </div>
      )}
    </div>
  )
}

export function TopMarketsBarChart({
  protocolName,
  color,
  markets,
  topN = 10,
  defaultView = "supply",
  views = ["supply", "available", "borrows"],
  itemNoun = "Markets",
}: Props) {
  const [view, setView] = useState<View>(defaultView)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)

  // Re-rank by the active filter and slice to topN. Markets with a missing
  // value for the current view fall to the bottom (`-Infinity` sort weight)
  // and get dropped by the topN slice when there's enough data above them.
  const data = useMemo(() => {
    const sorted = [...markets].sort((a, b) => {
      const av = valueFor(a, view)
      const bv = valueFor(b, view)
      return (Number.isFinite(bv) ? bv : -Infinity) - (Number.isFinite(av) ? av : -Infinity)
    })
    return sorted.slice(0, topN).reverse() // reverse so biggest is at top of horizontal chart
  }, [markets, view, topN])

  // Dynamic chart height — same trick as the multi-chain footprint chart so
  // y-axis labels don't get squeezed when topN is large.
  const chartHeight = Math.max(280, data.length * 28 + 40)
  const title = `${protocolName} · Top ${itemNoun} by ${VIEW_LABEL[view]}`

  return (
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
          {views.length > 1 && <ViewToggle views={views} view={view} setView={setView} />}
          <span className="text-[10px] text-text-muted">
            Top {Math.min(topN, markets.length)}
          </span>
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="p-4 chart-body" style={{ height: `${chartHeight}px` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => formatUSD(v)}
            />
            <YAxis
              type="category"
              dataKey="asset"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              width={100}
            />
            <Tooltip content={<CustomTooltip view={view} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar
              dataKey={(m: MarketRow) => valueFor(m, view)}
              fill={color}
              fillOpacity={0.7}
              radius={[0, 2, 2, 0]}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={0.4 + (i / data.length) * 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ViewToggle({
  views,
  view,
  setView,
}: {
  views: View[]
  view: View
  setView: (v: View) => void
}) {
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
      {views.map((opt) => (
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
          {opt === "supply" ? "Supply" : opt === "available" ? "Available" : "Borrows"}
        </button>
      ))}
    </div>
  )
}
