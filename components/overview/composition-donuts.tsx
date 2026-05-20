"use client"

/**
 * Composition Donuts — Zone 5 of the Sector Overview rebuild.
 *
 * Two donut charts side by side: collateral mix and borrow mix across the
 * four protocols, with a period picker that lets the reader pick Current
 * / Week / Month / Quarter. Each donut renders the top-7 individual assets
 * by USD plus an "Other" bucket; "Other" absorbs everything beyond top-7
 * (including the rounding gap below the loader's top-10) so the donut
 * total reconciles against the period's authoritative supply / borrow
 * totals.
 *
 * Each donut also gets an auto insight line beneath it stating the lead
 * asset's share.
 */

import { useMemo, useRef, useState } from "react"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { PeriodPicker, type PeriodSelection } from "./period-picker"
import { formatUSD, formatPercent } from "@/lib/utils"
import { type AssetType } from "@/lib/assets"
import type { RankedAssetRow } from "@/lib/overview"
import type {
  HistoricalBuckets,
  HistoricalRankedAsset,
  HistoricalBucket,
} from "@/lib/historical-buckets"

interface AssetRowLite {
  symbol: string
  usd: number
  type: AssetType
}

interface DonutCardProps {
  title: string
  rows: AssetRowLite[]
  /** Authoritative sector total — sum we make the donut reconcile to. */
  authoritativeTotal: number
  /** "borrow" / "collateral" — used for the auto insight line phrasing. */
  kind: "collateral" | "borrow"
  methodologyKey?: string
  /** Footnote shown beneath the legend when present (e.g. asset-tax notes). */
  footnote?: string
  /** "current" / "Apr 2026" / etc — surfaced under the title for context. */
  asOfLabel: string
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

interface Wedge {
  name: string
  value: number
  sharePct: number
}

function DonutCard({
  title,
  rows,
  authoritativeTotal,
  kind,
  methodologyKey,
  footnote,
  asOfLabel,
}: DonutCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const wedges: Wedge[] = useMemo(() => {
    const top = rows.slice(0, 7)
    const accountedTop = top.reduce((s, r) => s + r.usd, 0)
    const otherUsd = Math.max(0, authoritativeTotal - accountedTop)
    const out: Wedge[] = top.map((r) => ({
      name: r.symbol,
      value: r.usd,
      sharePct: authoritativeTotal > 0 ? (r.usd / authoritativeTotal) * 100 : 0,
    }))
    if (otherUsd > 0) {
      out.push({
        name: "Other",
        value: otherUsd,
        sharePct: authoritativeTotal > 0 ? (otherUsd / authoritativeTotal) * 100 : 0,
      })
    }
    return out
  }, [rows, authoritativeTotal])

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] uppercase tracking-[0.08em]"
            style={{ color: "var(--text-muted)" }}
          >
            {asOfLabel}
          </span>
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3 p-4">
        <div className="relative h-[220px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={wedges}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={1}
                stroke="var(--card-bg)"
                strokeWidth={2}
              >
                {wedges.map((_, i) => (
                  <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                content={<DonutTooltip />}
                wrapperStyle={{ zIndex: 5 }}
                position={{ x: 0, y: -6 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col justify-center gap-1.5 text-[11px]">
          <div
            className="flex items-baseline justify-between gap-3 pb-1.5 mb-1"
            style={{ borderBottom: "1px solid var(--card-border)" }}
          >
            <span
              className="text-[9px] uppercase tracking-[0.08em]"
              style={{ color: "var(--text-muted)" }}
            >
              Total
            </span>
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {formatUSD(authoritativeTotal)}
            </span>
          </div>
          {wedges.map((d, i) => (
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
      {footnote && (
        <div
          className="px-4 py-2 text-[10px]"
          style={{
            background: "var(--panel-header)",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          {footnote}
        </div>
      )}
    </div>
  )
}

interface Props {
  collateral: RankedAssetRow[]
  borrowed: RankedAssetRow[]
  /** Sector totals from `snapshot.totalSupplied` / `snapshot.totalBorrowed`,
   *  used to make the current-period donut totals reconcile with the
   *  Verdict cards. Historical periods compute their own totals from the
   *  shipped buckets. */
  totalSuppliedUsd: number
  totalBorrowedUsd: number
  /** Optional historical-bucket payload for the period picker. */
  historicalBuckets?: HistoricalBuckets
}

function findBucket(
  buckets: HistoricalBuckets | undefined,
  selection: PeriodSelection,
): HistoricalBucket | null {
  if (!buckets || selection.granularity === "current") return null
  const list =
    selection.granularity === "week"
      ? buckets.weeks
      : selection.granularity === "month"
      ? buckets.months
      : buckets.quarters
  return list.find((b) => b.id === selection.bucketId) ?? null
}

function rankedToLite(r: RankedAssetRow | HistoricalRankedAsset): AssetRowLite {
  return { symbol: r.symbol, usd: r.usd, type: r.type }
}

export function CompositionDonuts({
  collateral,
  borrowed,
  totalSuppliedUsd,
  totalBorrowedUsd,
  historicalBuckets,
}: Props) {
  const [selection, setSelection] = useState<PeriodSelection>({
    granularity: "current",
    bucketId: "",
  })

  const bucket = findBucket(historicalBuckets, selection)
  const isCurrent = selection.granularity === "current" || !bucket
  const collateralRows = isCurrent ? collateral.map(rankedToLite) : bucket!.topCollateral.map(rankedToLite)
  const borrowedRows = isCurrent ? borrowed.map(rankedToLite) : bucket!.topBorrowed.map(rankedToLite)
  const supplyTotal = isCurrent ? totalSuppliedUsd : bucket!.totalSuppliedUsd
  const borrowTotal = isCurrent ? totalBorrowedUsd : bucket!.totalBorrowedUsd
  const asOfLabel = isCurrent ? "Current" : bucket!.label

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <PeriodPicker
          buckets={historicalBuckets}
          value={selection}
          onChange={setSelection}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutCard
          title="Collateral Mix"
          rows={collateralRows}
          authoritativeTotal={supplyTotal}
          kind="collateral"
          methodologyKey="sector-collateral-mix-donut"
          asOfLabel={asOfLabel}
        />
        <DonutCard
          title="Borrow Mix"
          rows={borrowedRows}
          authoritativeTotal={borrowTotal}
          kind="borrow"
          methodologyKey="sector-borrow-mix-donut"
          asOfLabel={asOfLabel}
          footnote="DefiLlama returns USDS borrows under DAI for some Spark markets; that share is folded into the DAI wedge here."
        />
      </div>
    </div>
  )
}
