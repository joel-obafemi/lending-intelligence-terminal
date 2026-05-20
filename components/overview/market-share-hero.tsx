"use client"

/**
 * Market Share Hero — Zone 2 of the Sector Overview rebuild.
 *
 * 24-month monthly stacked area, sums to 100% per bucket. The reader can
 * toggle between three lenses with the same chassis:
 *   - Borrows (default; the "true" market share signal)
 *   - Total Supply
 *   - Available Liquidity (DefiLlama net-liquidity TVL)
 *
 * Annotations from `content/annotations.json` (chartKey "sector-borrows-share")
 * render as dashed reference lines on the Borrows lens. Insight line
 * beneath the chart auto-states the dominant protocol's share + 12-month
 * point change.
 */

import { useMemo, useRef, useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import { formatPercent } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { ChartAnnotations } from "./chart-annotations"
import { useAnnotations } from "@/lib/annotations"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  type BucketType,
} from "@/lib/time-bucketing"
import type { OverviewTimeseriesPoint } from "@/lib/overview"

type Lens = "borrows" | "supply" | "available"

const LENS_LABEL: Record<Lens, string> = {
  borrows: "Borrows",
  supply: "Total Supply",
  available: "Available Liquidity",
}

const LENS_NOUN: Record<Lens, string> = {
  borrows: "active borrows",
  supply: "total supply",
  available: "available liquidity",
}

const BUCKET: BucketType = "month"
const MONTHS = 24

interface Props {
  borrowsShare: OverviewTimeseriesPoint[]
  supplyShare: OverviewTimeseriesPoint[]
  availableShare: OverviewTimeseriesPoint[]
  /** Same timestamps as the share series but values are absolute USD per
   *  slug. Bucketed alongside the share series so the tooltip can show
   *  the dollar amount that produced each share %. */
  borrowsUsd: OverviewTimeseriesPoint[]
  supplyUsd: OverviewTimeseriesPoint[]
  availableUsd: OverviewTimeseriesPoint[]
}

const METHODOLOGY_KEY_BY_LENS: Record<Lens, string> = {
  borrows: "sector-share-borrows",
  supply: "sector-share-supply",
  available: "sector-share-available",
}

function ShareTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as
    | (OverviewTimeseriesPoint & Record<string, number>)
    | undefined
  if (!point) return null
  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    pct: (point[p.slug] as number) || 0,
    usd: (point[`${p.slug}__usd`] as number) || 0,
  }))
    .filter((r) => r.pct > 0.01)
    .sort((a, b) => b.pct - a.pct)
  return (
    <div className="custom-tooltip min-w-[260px]">
      <p className="text-xs text-text-muted mb-2">
        {formatBucketTooltipLabel(point.timestamp, BUCKET)}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {formatUsdCompact(r.usd)} <span style={{ color: "var(--text-muted)" }}>·</span> {formatPercent(r.pct, 1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatUsdCompact(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "$0"
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

export function MarketShareHero({
  borrowsShare,
  supplyShare,
  availableShare,
  borrowsUsd,
  supplyUsd,
  availableUsd,
}: Props) {
  const [lens, setLens] = useState<Lens>("borrows")
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  // Annotations are still keyed under "sector-borrows-share" (the data
  // file written before we added lens toggles). They only render on the
  // Borrows view because the events curated there — depegs, liquidation
  // cascades, parameter changes — read against the borrow stack.
  const annotations = useAnnotations("sector-borrows-share")
  const showAnnotations = lens === "borrows"
  const methodologyKey = METHODOLOGY_KEY_BY_LENS[lens]

  const data = lens === "borrows" ? borrowsShare : lens === "supply" ? supplyShare : availableShare
  const usdData =
    lens === "borrows" ? borrowsUsd : lens === "supply" ? supplyUsd : availableUsd
  const bucketed = useMemo(() => {
    const slugs = PROTOCOLS.map((p) => p.slug)
    const shareBucketed = bucketSeries(data, BUCKET, "last", slugs, MONTHS)
    const usdBucketed = bucketSeries(usdData, BUCKET, "last", slugs, MONTHS)
    // Index USD by timestamp so a missing alignment (e.g. asymmetric tail
    // trim) does not desync the tooltip from the visible bar.
    const usdByTs = new Map<number, OverviewTimeseriesPoint>()
    for (const pt of usdBucketed) usdByTs.set(pt.timestamp, pt)
    return shareBucketed.map((sharePt) => {
      const usdPt = usdByTs.get(sharePt.timestamp) ?? null
      const merged: Record<string, number> & { timestamp: number } = {
        timestamp: sharePt.timestamp,
      }
      for (const p of PROTOCOLS) {
        merged[p.slug] = (sharePt[p.slug] as number) ?? 0
        merged[`${p.slug}__usd`] = (usdPt?.[p.slug] as number) ?? 0
      }
      return merged
    })
  }, [data, usdData])

  return (
    <div className="space-y-2">
      <div
        ref={cardRef}
        className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
      >
        <div
          className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Market Share by {LENS_LABEL[lens]}
            <MethodologyTooltip methodologyKey={methodologyKey} />
          </span>
          <div className="flex items-center gap-2">
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--card-border)",
                borderRadius: "4px",
                overflow: "hidden",
                background: "var(--background)",
              }}
            >
              {(Object.keys(LENS_LABEL) as Lens[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLens(l)}
                  style={{
                    padding: "4px 10px",
                    fontSize: "10px",
                    fontWeight: 500,
                    cursor: "pointer",
                    border: "none",
                    fontFamily: "inherit",
                    backgroundColor: lens === l ? "var(--card-border)" : "transparent",
                    color: lens === l ? "var(--text-primary)" : "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {LENS_LABEL[l]}
                </button>
              ))}
            </div>
            <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              24-month
            </span>
            <ChartActions cardRef={cardRef} title={`Market share by ${LENS_LABEL[lens]}`} />
          </div>
        </div>
        <div className="relative p-4 h-[360px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bucketed} margin={{ top: 18, right: 5, left: 5, bottom: 0 }}>
              <defs>
                {PROTOCOLS.map((p) => (
                  <linearGradient key={p.slug} id={`msh-${p.slug}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.color} stopOpacity={0.65} />
                    <stop offset="100%" stopColor={p.color} stopOpacity={0.35} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(ts) => formatBucketLabel(ts, BUCKET)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                domain={[0, 100]}
                width={40}
              />
              <Tooltip
                content={<ShareTooltip />}
                cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              {showAnnotations && <ChartAnnotations events={annotations} bucket={BUCKET} />}
              {PROTOCOLS.map((p) => (
                <Area
                  key={p.slug}
                  type="monotone"
                  dataKey={p.slug}
                  stackId="1"
                  stroke={p.color}
                  strokeWidth={1}
                  fill={`url(#msh-${p.slug})`}
                  fillOpacity={1}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          {PROTOCOLS.map((p) => (
            <div key={p.slug} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
