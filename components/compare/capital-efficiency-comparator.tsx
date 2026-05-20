"use client"

/**
 * Capital Efficiency Comparator — Zone 4 of the Compare page.
 *
 * Horizontal bar chart, four bars, showing the borrowing power per $1 of
 * the selected asset as collateral on each protocol — i.e. the max LTV
 * surfaced as `$borrow_supported / $collateral`. Below the chart, a
 * companion row shows two leverage numbers per protocol:
 *
 *   1. Standard leverage  = 1 / (1 − base LTV)
 *   2. Max-mode leverage  = 1 / (1 − liftedLtv)  where the lift comes
 *      from the curated lib/emode-registry.ts (E-Mode for Aave / Spark,
 *      Smart Collateral for Fluid, highest-LLTV market for Morpho).
 *
 * The max-mode number is the headline "max theoretical" leverage the
 * audit asked for. When an asset isn't eligible for any lift on a
 * protocol, the max-mode column reads "—".
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
} from "recharts"
import { useThemeColors } from "@/components/theme-provider"
import { ChartActions } from "@/components/chart-actions"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { formatPercent } from "@/lib/utils"
import { eModeFor } from "@/lib/emode-registry"
import type { CompareCell } from "@/lib/compare"

interface Props {
  symbol: string
  cells: CompareCell[]
}

interface BarRow {
  slug: string
  name: string
  color: string
  ltv: number
  leverage: number
  /** Curated max-mode lift label (E-Mode / Smart Col / Per-market). */
  maxModeLabel: string
  /** Max-mode LTV from the emode registry, null when not eligible. */
  maxModeLtv: number | null
  /** Leverage at max-mode LTV. Null when no lift available. */
  maxModeLeverage: number | null
}

function leverageFor(ltv: number): number {
  if (ltv <= 0) return 1
  if (ltv >= 0.999) return Infinity
  return 1 / (1 - ltv)
}

function CapitalEfficiencyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as BarRow
  return (
    <div className="custom-tooltip min-w-[200px]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: row.color }} />
        <span className="text-xs font-semibold text-text-primary">{row.name}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-text-secondary">Borrowing power</span>
        <span className="tabular-nums text-text-primary">
          ${(row.ltv * 1).toFixed(3)} per $1
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-text-secondary">Max leverage</span>
        <span className="tabular-nums text-text-primary">
          {Number.isFinite(row.leverage) ? `${row.leverage.toFixed(2)}×` : "∞"}
        </span>
      </div>
    </div>
  )
}

export function CapitalEfficiencyComparator({ symbol, cells }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)

  const rows: BarRow[] = cells
    .filter((c) => c.available && c.ltv != null)
    .map((c) => {
      const e = eModeFor(symbol, c.protocolSlug)
      // Effective max-mode LTV is the larger of the lifted value and
      // the base LTV — protects against a curated lift accidentally
      // being lower than the live reserve config.
      const maxLtv =
        e.liftedLtv != null && e.liftedLtv > (c.ltv ?? 0) ? e.liftedLtv : null
      return {
        slug: c.protocolSlug,
        name: c.protocolName,
        color: c.protocolColor,
        ltv: c.ltv!,
        leverage: leverageFor(c.ltv!),
        maxModeLabel: e.label,
        maxModeLtv: maxLtv,
        maxModeLeverage: maxLtv != null ? leverageFor(maxLtv) : null,
      }
    })
    .sort((a, b) => b.ltv - a.ltv)

  return (
    <div className="space-y-3">
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
            Borrowing power per $1 of {symbol} collateral
            <MethodologyTooltip methodologyKey="compare-capital-efficiency" />
          </span>
          <ChartActions cardRef={cardRef} title={`Capital efficiency · ${symbol}`} />
        </div>
        <div className="relative p-4 h-[260px] chart-body">
          {rows.length === 0 ? (
            <div
              className="flex items-center justify-center h-full text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              {symbol} isn't listed as collateral on any tracked protocol.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 5, right: 24, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: colors.textMuted }}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                  domain={[0, 1]}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: colors.textPrimary }}
                  width={88}
                />
                <Tooltip
                  content={<CapitalEfficiencyTooltip />}
                  cursor={{ fill: "rgba(15, 17, 21, 0.04)" }}
                />
                <Bar dataKey="ltv" radius={[0, 2, 2, 0]}>
                  {rows.map((r) => (
                    <Cell key={r.slug} fill={r.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div
          className="px-4 pb-3 pt-3"
          style={{ borderTop: "1px solid var(--card-border)" }}
        >
          <div
            className="text-[10px] uppercase tracking-[0.08em] mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Max theoretical leverage · base / max-mode (E-Mode · Smart Col · highest LLTV)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {rows.map((r) => (
              <div
                key={r.slug}
                className="flex flex-col gap-0.5 px-2 py-1.5 rounded"
                style={{ background: "var(--card-hover)" }}
              >
                <span
                  className="text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: r.color, fontWeight: 600 }}
                >
                  {r.name}
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-[12px] tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                    title="Standard LTV leverage"
                  >
                    {Number.isFinite(r.leverage) ? `${r.leverage.toFixed(2)}×` : "∞"}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    /
                  </span>
                  <span
                    className="text-[12px] tabular-nums"
                    style={{
                      color:
                        r.maxModeLeverage != null
                          ? "var(--success)"
                          : "var(--text-muted)",
                      fontWeight: r.maxModeLeverage != null ? 700 : 400,
                    }}
                    title={`Max-mode leverage (${r.maxModeLabel})`}
                  >
                    {r.maxModeLeverage == null
                      ? "—"
                      : Number.isFinite(r.maxModeLeverage)
                      ? `${r.maxModeLeverage.toFixed(2)}×`
                      : "∞"}
                  </span>
                </div>
                <span
                  className="text-[9px] truncate"
                  style={{ color: "var(--text-muted)" }}
                  title={r.maxModeLabel}
                >
                  {r.maxModeLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
