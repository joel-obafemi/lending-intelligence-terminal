"use client"

import { formatUSD, formatPercent } from "@/lib/utils"
import type { ProtocolRevenueBreakdown } from "@/lib/revenue-decomp"

interface Props {
  rows: ProtocolRevenueBreakdown[]
  windowDays: number
}

/**
 * Per-protocol revenue decomposition card. Shows:
 *   - Total gross fees over the window
 *   - Capture rate (how much the protocol+holders keep vs. suppliers)
 *   - Liquidation-source share (est.) — volatility exposure
 * Each card uses the protocol's palette color as its accent.
 */
export function RevenueDecompCards({ rows, windowDays }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {rows.map((r) => {
        const supplyShare = r.totalFees > 0 ? r.supplySideRevenue / r.totalFees : 0
        const protocolShare = r.totalFees > 0 ? r.protocolRevenue / r.totalFees : 0
        const holdersShare = r.totalFees > 0 ? r.holdersRevenue / r.totalFees : 0
        return (
          <div
            key={r.slug}
            className="tui-card bg-card-bg border border-card-border rounded-lg p-4 flex flex-col gap-3 relative overflow-hidden"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-[2px]"
              style={{ backgroundColor: r.color }}
            />
            <div className="pl-2">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: r.color }}
                >
                  {r.name}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatUSD(r.totalFees)}
                </span>
                <span className="text-[10px] text-text-muted">gross fees, {windowDays}d</span>
              </div>
            </div>

            {/* Split stacked bar — who gets what */}
            <div className="pl-2">
              <div className="text-[10px] uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-muted)" }}>
                By recipient
              </div>
              <div
                style={{ display: "flex", height: "8px", borderRadius: "2px", overflow: "hidden" }}
              >
                <div
                  style={{
                    width: `${Math.max(supplyShare * 100, 0)}%`,
                    background: "#10B981",
                    opacity: 0.8,
                  }}
                  title={`Supply-side ${formatPercent(supplyShare * 100, 1)}`}
                />
                <div
                  style={{
                    width: `${Math.max(protocolShare * 100, 0)}%`,
                    background: "#FF6B35",
                    opacity: 0.85,
                  }}
                  title={`Protocol ${formatPercent(protocolShare * 100, 1)}`}
                />
                <div
                  style={{
                    width: `${Math.max(holdersShare * 100, 0)}%`,
                    background: "#B44AFF",
                    opacity: 0.85,
                  }}
                  title={`Holders ${formatPercent(holdersShare * 100, 1)}`}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span>Capture rate</span>
                <span
                  className="tabular-nums"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatPercent(r.captureRate * 100, 1)}
                </span>
              </div>
            </div>

            {/* Source split estimate */}
            <div className="pl-2">
              <div className="text-[10px] uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-muted)" }}>
                Est. source split
              </div>
              <div
                style={{ display: "flex", height: "8px", borderRadius: "2px", overflow: "hidden" }}
              >
                <div
                  style={{
                    width: `${Math.max(r.liquidationShare * 100, 0)}%`,
                    background: "#FF4444",
                    opacity: 0.8,
                  }}
                  title={`Liquidation-driven ${formatPercent(r.liquidationShare * 100, 1)}`}
                />
                <div
                  style={{
                    width: `${Math.max((1 - r.liquidationShare) * 100, 0)}%`,
                    background: "#5B7FFF",
                    opacity: 0.7,
                  }}
                  title={`Interest + other ${formatPercent((1 - r.liquidationShare) * 100, 1)}`}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                <span>Liquidation share</span>
                <span
                  className="tabular-nums"
                  style={{ color: r.liquidationShare > 0.2 ? "var(--danger)" : "var(--text-secondary)" }}
                >
                  {formatPercent(r.liquidationShare * 100, 1)} est.
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
