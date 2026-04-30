"use client"

/**
 * Composition Donuts — Zone 5 of the Sector Overview rebuild.
 *
 * Two donut charts side by side: latest-day collateral mix and borrow mix
 * across the four protocols. Top-7 individual assets plus an "Other" bucket
 * (the data layer already trimmed to that shape via `topCollateralAssets`
 * and `topBorrowedAssets`). Donut center prints the total USD.
 */

import { useMemo, useRef } from "react"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { RankedAssetRow } from "@/lib/overview"

interface DonutCardProps {
  title: string
  rows: RankedAssetRow[]
  methodologyKey?: string
}

const DONUT_COLORS = [
  "#FF6B35",
  "#5B7FFF",
  "#10B981",
  "#B44AFF",
  "#F59E0B",
  "#EC4899",
  "#0090B2",
  "#6B7280",
]

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const slice = payload[0]
  return (
    <div className="custom-tooltip min-w-[180px]">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: slice.payload.fill }} />
        <span className="text-xs font-semibold text-text-primary">{slice.name}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-text-secondary">USD</span>
        <span className="text-xs tabular-nums text-text-primary">
          {formatUSD(slice.value as number)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-text-secondary">Share</span>
        <span className="text-xs tabular-nums text-text-primary">
          {formatPercent(slice.payload.sharePct, 1)}
        </span>
      </div>
    </div>
  )
}

function DonutCard({ title, rows, methodologyKey }: DonutCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Group everything past the top-7 into a single "Other" wedge so the donut
  // doesn't end up with a long tail of slivers.
  const data = useMemo(() => {
    const top = rows.slice(0, 7)
    const tail = rows.slice(7)
    const tailSum = tail.reduce((s, r) => s + r.usd, 0)
    const tailShare = tail.reduce((s, r) => s + r.sharePct, 0)
    const out = top.map((r) => ({ name: r.symbol, value: r.usd, sharePct: r.sharePct }))
    if (tailSum > 0) out.push({ name: "Other", value: tailSum, sharePct: tailShare })
    return out
  }, [rows])

  const total = data.reduce((s, r) => s + r.value, 0)

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
        <ChartActions cardRef={cardRef} title={title} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3 p-4">
        <div className="relative h-[220px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={1}
                stroke="var(--card-bg)"
                strokeWidth={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              pointerEvents: "none",
            }}
          >
            <span className="text-[9px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              Total
            </span>
            <span className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatUSD(total)}
            </span>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-1.5 text-[11px]">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                  {d.name}
                </span>
              </div>
              <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                {formatPercent(d.sharePct, 1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface Props {
  collateral: RankedAssetRow[]
  borrowed: RankedAssetRow[]
}

export function CompositionDonuts({ collateral, borrowed }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <DonutCard
        title="Collateral Mix"
        rows={collateral}
        methodologyKey="sector-collateral-mix-donut"
      />
      <DonutCard
        title="Borrow Mix"
        rows={borrowed}
        methodologyKey="sector-borrow-mix-donut"
      />
    </div>
  )
}
