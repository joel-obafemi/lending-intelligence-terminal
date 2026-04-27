"use client"

import { useRef } from "react"
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
import type { MarketRow } from "@/lib/protocol-detail"

interface Props {
  title: string
  color: string
  markets: MarketRow[]
  /** Number of markets to show in the bar chart (default 10). */
  topN?: number
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as MarketRow
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
        <span style={{ color: "var(--text-secondary)" }}>Total Supply</span>
        <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatUSD(row.totalSupplyUsd)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>TVL (unborrowed)</span>
        <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
          {formatUSD(row.tvlUsd)}
        </span>
      </div>
      {row.borrowedUsd != null && (
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

export function TopMarketsBarChart({ title, color, markets, topN = 10 }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const data = markets.slice(0, topN).slice().reverse() // reverse so biggest is at top of horizontal chart

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
          className="text-accent"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">
            Top {Math.min(topN, markets.length)} by Total Supply
          </span>
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="p-4 h-[340px] chart-body">
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
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="totalSupplyUsd" fill={color} fillOpacity={0.7} radius={[0, 2, 2, 0]}>
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
