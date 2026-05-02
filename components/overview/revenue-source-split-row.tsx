"use client"

/**
 * Revenue Source Split row — one of the Revenue page's most
 * differentiated panels. Each protocol gets a horizontal bar sized by
 * its 90d gross fees and segmented by Interest vs Liquidation revenue.
 *
 * Promotes the per-card source-split bars (which were buried at the
 * bottom of each protocol card) to a full-page-width comparative row.
 * The Fluid liquidation-driven slice is the visual fingerprint we want
 * legible in the first scroll.
 */

import { useRef } from "react"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { ProtocolRevenueBreakdown } from "@/lib/revenue-decomp"

interface Props {
  rows: ProtocolRevenueBreakdown[]
  windowDays: number
}

const COLOR_INTEREST = "#5B7FFF"
const COLOR_LIQUIDATION = "#FF4444"

export function RevenueSourceSplitRow({ rows, windowDays }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const TITLE = `Revenue Source Split · ${windowDays}d`
  const maxFees = Math.max(...rows.map((r) => r.totalFees), 0)
  if (maxFees <= 0) return null

  // Sort largest revenue first — Aave V3 sets the visual scale, the
  // smaller protocols' liquidation-share fingerprints stand out
  // because the bars are width-proportional.
  const sorted = [...rows].sort((a, b) => b.totalFees - a.totalFees)

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden"
    >
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span className="flex items-center gap-3">
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
            <MethodologyTooltip methodologyKey="revenue-source-split-row" />
          </span>
          <span className="text-[10px] text-text-muted">
            Bar width = gross fees · split = interest (residual) vs liquidation (est.)
          </span>
        </span>
        <ChartActions cardRef={cardRef} title={TITLE} />
      </div>
      <div className="px-5 py-4 space-y-3">
        {sorted.map((r) => {
          const widthPct = maxFees > 0 ? (r.totalFees / maxFees) * 100 : 0
          const liqShare = r.liquidationShare
          return (
            <div key={r.slug} className="grid grid-cols-[110px_1fr_140px] items-center gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span
                  className="text-[11px] uppercase tracking-[0.08em] truncate"
                  style={{ color: r.color }}
                >
                  {r.name}
                </span>
              </div>
              <div className="relative h-[22px]" title={`${r.name} · ${formatUSD(r.totalFees)} gross fees`}>
                <div
                  className="absolute inset-y-0 left-0 flex overflow-hidden rounded"
                  style={{ width: `${widthPct}%`, minWidth: "12px" }}
                >
                  <div
                    style={{
                      width: `${(1 - liqShare) * 100}%`,
                      background: COLOR_INTEREST,
                      opacity: 0.85,
                    }}
                    title={`Interest + other ${formatPercent((1 - liqShare) * 100, 1)} (${formatUSD(r.totalFees - r.estLiquidationFees)})`}
                  />
                  <div
                    style={{
                      width: `${liqShare * 100}%`,
                      background: COLOR_LIQUIDATION,
                      opacity: 0.85,
                    }}
                    title={`Liquidation-driven (est.) ${formatPercent(liqShare * 100, 1)} (${formatUSD(r.estLiquidationFees)})`}
                  />
                </div>
              </div>
              <div className="flex items-baseline justify-end gap-2 text-[11px] tabular-nums">
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {formatUSD(r.totalFees)}
                </span>
                <span
                  style={{
                    color: liqShare > 0.2 ? "var(--danger)" : "var(--text-muted)",
                  }}
                  title="Liquidation-driven fees as a share of gross"
                >
                  {formatPercent(liqShare * 100, 0)} liq
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-5 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_INTEREST }} />
          <span>Interest + other (residual)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: COLOR_LIQUIDATION }} />
          <span>Liquidation-driven (est.)</span>
        </div>
      </div>
    </div>
  )
}
