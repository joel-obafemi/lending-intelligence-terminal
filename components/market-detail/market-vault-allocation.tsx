"use client"

import { useRef } from "react"
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { formatPercent, formatUSD } from "@/lib/utils"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import type { VaultAllocationRow } from "@/lib/market-detail"

interface Props {
  allocation: VaultAllocationRow[]
  /** Asset symbol the vault accepts deposits in — appears in the section title. */
  asset: string
}

/** Distinct colors for the donut slices. Cycles when there are >7 markets. */
const SLICE_COLORS = [
  "#5B7FFF",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#B44AFF",
  "#06B6D4",
  "#FF6B35",
]

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as VaultAllocationRow & { color: string }
  return (
    <div className="custom-tooltip min-w-[180px]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
        <span className="text-xs text-text-secondary">{row.marketLabel}</span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-text-muted">Vault deposit</span>
          <span className="text-xs font-medium text-text-primary tabular-nums">
            {formatUSD(row.vaultSupplyUsd)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-text-muted">Share</span>
          <span className="text-xs font-medium text-text-primary tabular-nums">
            {formatPercent(row.sharePct, 1)}
          </span>
        </div>
        {row.marketSupplyApy != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-text-muted">Market supply APY</span>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {formatPercent(row.marketSupplyApy, 2)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MarketVaultAllocation({ allocation, asset }: Props) {
  // Pre-color the rows so the legend, donut, and table all match.
  const colored = allocation.map((a, i) => ({ ...a, color: SLICE_COLORS[i % SLICE_COLORS.length] }))
  const total = colored.reduce((s, r) => s + r.vaultSupplyUsd, 0)
  const cardRef = useRef<HTMLDivElement>(null)

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
          Vault Allocation
          <MethodologyTooltip methodologyKey="market-vault-allocation" />
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-muted">
            Where this vault deploys {asset} deposits across underlying Morpho markets
          </span>
          <ChartActions cardRef={cardRef} title="Vault Allocation" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 p-4 items-center">
        <div className="h-[200px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={colored}
                dataKey="vaultSupplyUsd"
                nameKey="marketLabel"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={1}
                strokeWidth={0}
              >
                {colored.map((row) => (
                  <Cell key={row.marketUniqueKey} fill={row.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Centered total inside the donut */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          >
            <span className="text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
              Allocated
            </span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatUSD(total)}
            </span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Market</th>
                <th className="text-right">Deposit</th>
                <th className="text-right">Share</th>
                <th className="text-right">Mkt APY</th>
                <th className="text-right">Mkt Util</th>
              </tr>
            </thead>
            <tbody>
              {colored.map((r) => (
                <tr key={r.marketUniqueKey}>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.marketLabel}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(r.vaultSupplyUsd)}</td>
                  <td className="text-right tabular-nums">
                    {formatPercent(r.sharePct, 1)}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {r.marketSupplyApy != null ? formatPercent(r.marketSupplyApy, 2) : "—"}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.marketUtilization != null
                      ? formatPercent(r.marketUtilization * 100, 1)
                      : "—"}
                  </td>
                </tr>
              ))}
              {colored.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                    Vault is currently 100% in idle liquidity.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
