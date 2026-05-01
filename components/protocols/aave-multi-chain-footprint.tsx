"use client"

/**
 * Multi-Chain Footprint — Aave V3 protocol-specific lens, Module E.
 *
 * Single horizontal bar chart showing Aave V3's Available Liquidity
 * across every chain it's deployed on, ranked descending. Each bar is
 * the chain's `chainTvls.<Chain>.tvl` from DefiLlama; the long tail
 * past the top 8 is rolled into an "Other chains" bucket so the
 * dominant deployment story stays legible.
 *
 * Ethereum's share is called out beneath the chart in plain English —
 * the recurring narrative material of "is Aave's center of gravity
 * moving off mainnet" lives in that single sentence.
 */

import { useMemo, useRef } from "react"
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

interface Props {
  /** Per-chain Available Liquidity in USD; key is the DefiLlama chain name. */
  multiChainTvl: Record<string, number>
  /** Protocol brand color used for the bars. */
  color: string
  /** Protocol display name for the methodology copy. */
  protocolName: string
}

interface Row {
  chain: string
  tvlUsd: number
  sharePct: number
}

const TOP_N = 8

function buildRows(multi: Record<string, number>): { rows: Row[]; total: number } {
  const total = Object.values(multi).reduce((s, v) => s + (v > 0 ? v : 0), 0)
  if (total <= 0) return { rows: [], total: 0 }
  const sorted = Object.entries(multi)
    .filter(([, v]) => v > 0)
    .map(([chain, tvlUsd]) => ({
      chain,
      tvlUsd,
      sharePct: (tvlUsd / total) * 100,
    }))
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
  if (sorted.length <= TOP_N) return { rows: sorted, total }
  const head = sorted.slice(0, TOP_N - 1)
  const tail = sorted.slice(TOP_N - 1)
  const tailUsd = tail.reduce((s, r) => s + r.tvlUsd, 0)
  const tailShare = tail.reduce((s, r) => s + r.sharePct, 0)
  return {
    rows: [
      ...head,
      { chain: `Other (${tail.length} chains)`, tvlUsd: tailUsd, sharePct: tailShare },
    ],
    total,
  }
}

function FootprintTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const r = payload[0]?.payload as Row
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
        {r.chain}
      </p>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>Available Liquidity</span>
        <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatUSD(r.tvlUsd)}
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

export function AaveMultiChainFootprint({ multiChainTvl, color, protocolName }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const { rows, total } = useMemo(() => buildRows(multiChainTvl), [multiChainTvl])
  const ethRow = rows.find((r) => r.chain === "Ethereum")
  const ethShare = ethRow?.sharePct ?? 0
  // Reverse so the largest chain renders at the top of the horizontal chart.
  const data = [...rows].reverse()
  // Dynamic chart height — same trick as the top-markets bar chart so we
  // don't crush labels when there are 8 chains.
  const chartHeight = Math.max(220, data.length * 32 + 40)

  const insight =
    rows.length === 0
      ? null
      : rows.length === 1
      ? `${protocolName} is currently deployed on a single chain (${rows[0].chain}) with ${formatUSD(rows[0].tvlUsd)} in Available Liquidity.`
      : `${protocolName} runs across ${rows.length} chain${
          rows.length === 1 ? "" : "s"
        } with ${formatUSD(total)} of Available Liquidity. ${
          ethRow ? `Ethereum holds ${formatPercent(ethShare, 0)} of that footprint.` : ""
        }`

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
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
            {protocolName} · Multi-Chain Footprint
            <MethodologyTooltip methodologyKey="aave-multi-chain-footprint" />
          </span>
          <ChartActions cardRef={cardRef} title={`${protocolName} multi-chain footprint`} />
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
              <Tooltip content={<FootprintTooltip />} cursor={{ fill: "rgba(15, 17, 21, 0.04)" }} />
              <Bar dataKey="tvlUsd" radius={[0, 2, 2, 0]}>
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
      {insight && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {insight}
        </p>
      )}
    </div>
  )
}
