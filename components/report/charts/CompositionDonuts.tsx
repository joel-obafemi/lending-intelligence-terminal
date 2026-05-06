"use client"

/**
 * Side-by-side donuts: collateral mix + borrow mix at the freeze date
 * (or current). Top-7 + Other per the dashboard convention.
 */
import { useMemo } from "react"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { SERIES_COLORS, MUTED, fmtCompactUsd } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface RankedAsset {
  symbol: string
  usd: number
}

interface Props {
  data: {
    collateral: RankedAsset[]
    borrowed: RankedAsset[]
    totalSuppliedUsd: number
    totalBorrowedUsd: number
  }
  params: ChartRegistryParams
}

interface Wedge {
  name: string
  value: number
  share: number
}

function buildWedges(rows: RankedAsset[], total: number): Wedge[] {
  const top = rows.slice(0, 7)
  const accountedTop = top.reduce((s, r) => s + r.usd, 0)
  const otherUsd = Math.max(0, total - accountedTop)
  const out: Wedge[] = top.map((r) => ({
    name: r.symbol,
    value: r.usd,
    share: total > 0 ? (r.usd / total) * 100 : 0,
  }))
  if (otherUsd > 0) {
    out.push({
      name: "Other",
      value: otherUsd,
      share: total > 0 ? (otherUsd / total) * 100 : 0,
    })
  }
  return out
}

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const slice = payload[0]
  return (
    <div
      style={{
        background: "#F7F4ED",
        border: "1px solid #D4CFC2",
        borderRadius: 4,
        padding: "10px 14px",
        fontFamily: "var(--report-font-sans, Inter, sans-serif)",
        fontSize: 12,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{slice.name}</div>
      <div style={{ fontFamily: "var(--report-font-mono)" }}>
        {fmtCompactUsd(slice.value)} · {(slice.payload.share as number).toFixed(1)}%
      </div>
    </div>
  )
}

function DonutHalf({ title, total, wedges }: { title: string; total: number; wedges: Wedge[] }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--report-font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: MUTED,
          marginBottom: 8,
        }}
      >
        {title} · {fmtCompactUsd(total)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={wedges}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={1}
                stroke="#F7F4ED"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {wedges.map((_, i) => (
                  <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 12 }}>
          {wedges.map((w, i) => (
            <li key={w.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: SERIES_COLORS[i % SERIES_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, fontFamily: "var(--report-font-serif)" }}>{w.name}</span>
              <span
                style={{
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {w.share.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function CompositionDonutsReport({ data, params }: Props) {
  const collateralWedges = useMemo(
    () => buildWedges(data.collateral, data.totalSuppliedUsd),
    [data.collateral, data.totalSuppliedUsd],
  )
  const borrowedWedges = useMemo(
    () => buildWedges(data.borrowed, data.totalBorrowedUsd),
    [data.borrowed, data.totalBorrowedUsd],
  )
  return (
    <div className="report-composition-donuts">
      <DonutHalf title="Collateral mix" total={data.totalSuppliedUsd} wedges={collateralWedges} />
      <DonutHalf title="Borrow mix" total={data.totalBorrowedUsd} wedges={borrowedWedges} />
      <style>{`
        .report-composition-donuts {
          display: grid;
          grid-template-columns: 1fr;
          gap: 32px;
        }
        @media (min-width: 720px) {
          .report-composition-donuts {
            grid-template-columns: 1fr 1fr;
            gap: 24px;
          }
        }
      `}</style>
    </div>
  )
}
