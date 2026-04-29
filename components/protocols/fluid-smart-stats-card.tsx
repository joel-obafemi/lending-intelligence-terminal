"use client"

/**
 * FluidSmartStatsCard — surface Smart Collateral / Smart Debt adoption.
 *
 * Single card with a hero "% of Fluid TVL in smart vaults" plus a small
 * breakdown table. Smart Collateral = collateral is a Fluid DEX position;
 * Smart Debt = debt is a Fluid DEX position. These are Fluid's headline
 * differentiator — tracking adoption in TVL terms gives a clean signal of
 * how much capital uses the feature vs. running plain vaults.
 */

import { useRef } from "react"
import { formatPercent, formatUSD } from "@/lib/utils"
import { ChartActions } from "../chart-actions"
import type { FluidSmartVaultStats } from "@/lib/fluid-stats"

interface Props {
  stats: FluidSmartVaultStats
}

const TITLE = "Smart Vault Adoption"

export function FluidSmartStatsCard({ stats }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const breakdown: Array<{ label: string; tvl: number; count: number; tone: string }> = [
    { label: "Smart Collateral + Smart Debt", tvl: stats.smartBothTvlUsd, count: stats.smartBothCount, tone: "var(--accent-orange)" },
    { label: "Smart Collateral only", tvl: stats.smartColTvlUsd, count: stats.smartColCount, tone: "var(--accent-purple)" },
    { label: "Smart Debt only", tvl: stats.smartDebtTvlUsd, count: stats.smartDebtCount, tone: "var(--accent-blue)" },
    { label: "Regular vaults", tvl: stats.regularTvlUsd, count: stats.regularCount, tone: "var(--text-muted)" },
  ]

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-accent"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {TITLE}
          </span>
          <span className="text-[9px] text-text-muted" style={{ letterSpacing: "0.05em" }}>
            · share of Fluid TVL using Smart Collateral / Smart Debt
          </span>
        </div>
        <ChartActions cardRef={cardRef} title={TITLE} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 p-4 items-center">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.1em]"
            style={{ color: "var(--text-muted)" }}
          >
            Smart-vault share of TVL
          </div>
          <div
            className="text-3xl font-semibold tabular-nums mt-1"
            style={{ color: "var(--accent-orange)" }}
          >
            {formatPercent(stats.smartAnyPct, 1)}
          </div>
          <div
            className="text-[10px] tabular-nums mt-1"
            style={{ color: "var(--text-muted)" }}
          >
            {formatUSD(stats.smartColTvlUsd + stats.smartDebtTvlUsd + stats.smartBothTvlUsd)} of {formatUSD(stats.totalTvlUsd)}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">TVL</th>
                <th className="text-right">Vaults</th>
                <th className="text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => {
                const share =
                  stats.totalTvlUsd > 0 ? (r.tvl / stats.totalTvlUsd) * 100 : 0
                return (
                  <tr key={r.label}>
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: r.tone }}
                        />
                        {r.label}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{formatUSD(r.tvl)}</td>
                    <td className="text-right tabular-nums">{r.count}</td>
                    <td className="text-right tabular-nums" style={{ color: r.tone }}>
                      {formatPercent(share, 1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
