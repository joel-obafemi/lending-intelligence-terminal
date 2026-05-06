"use client"

/**
 * Fluid smart-vault adoption — horizontal stacked bar showing share of
 * vault TVL by category (smart collateral & smart debt, smart collateral
 * only, neither, lending pools).
 */
import { MUTED, SERIES_COLORS } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Category {
  key: string
  label: string
  usd: number
}

interface Props {
  data: { categories: Category[]; totalUsd: number }
  params: ChartRegistryParams
}

export function SmartVaultAdoptionBars({ data, params }: Props) {
  const total = data.totalUsd > 0 ? data.totalUsd : data.categories.reduce((s, c) => s + c.usd, 0)
  return (
    <div>
      <div
        style={{
          display: "flex",
          width: "100%",
          height: 28,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        {data.categories.map((c, i) => {
          const pct = total > 0 ? (c.usd / total) * 100 : 0
          if (pct <= 0) return null
          return (
            <div
              key={c.key}
              title={`${c.label} — ${pct.toFixed(1)}%`}
              style={{
                width: `${pct}%`,
                background: SERIES_COLORS[i % SERIES_COLORS.length],
                opacity: 0.9,
              }}
            />
          )
        })}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {data.categories.map((c, i) => {
          const pct = total > 0 ? (c.usd / total) * 100 : 0
          return (
            <li
              key={c.key}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: SERIES_COLORS[i % SERIES_COLORS.length],
                }}
              />
              <span style={{ fontFamily: "var(--report-font-serif)", flex: 1 }}>{c.label}</span>
              <span
                style={{
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: MUTED,
                }}
              >
                {pct.toFixed(1)}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
