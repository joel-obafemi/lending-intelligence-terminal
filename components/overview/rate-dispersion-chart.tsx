"use client"

/**
 * Rate Dispersion chart — max minus min supply APY across the four
 * protocols for the selected asset, plotted over ~18 months.
 *
 * The signature long-term metric for the Rates page: when this widens,
 * arbitrage is appearing across protocols; when it narrows, the market
 * is converging. Rendered as a single area to keep visual focus on the
 * trend.
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
import { formatPercent } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
} from "@/lib/time-bucketing"

interface Props {
  assets: string[]
  /** Map of asset symbol → daily dispersion series ({timestamp, value}). */
  dispersionByAsset: Record<string, Array<{ timestamp: number; value: number }>>
}

const DEFAULT_ASSET = "USDC"

function CustomTooltip({ active, payload, bucket }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as { timestamp: number; value: number } | undefined
  if (!point) return null
  return (
    <div className="custom-tooltip min-w-[180px]">
      <p className="text-xs text-text-muted mb-1.5">
        {formatBucketTooltipLabel(point.timestamp, bucket)}
      </p>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span style={{ color: "var(--text-secondary)" }}>Dispersion</span>
        <span
          className="tabular-nums font-semibold"
          style={{ color: "var(--accent-blue)" }}
        >
          {formatPercent(point.value, 2)}
        </span>
      </div>
    </div>
  )
}

export function RateDispersionChart({ assets, dispersionByAsset }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  // Filter to assets with at least 30 days of data — sub-month series
  // produce noisy charts.
  const populated = assets.filter(
    (s) => (dispersionByAsset[s] ?? []).length >= 30,
  )
  const initial = populated.includes(DEFAULT_ASSET) ? DEFAULT_ASSET : populated[0]
  const [active, setActive] = useState<string>(initial ?? DEFAULT_ASSET)

  const series = dispersionByAsset[active] ?? []
  // Bucket to weekly so the visual trend reads cleanly across 18 months.
  const bucketed = useMemo(
    () => bucketSeries(series, "week", "avg", ["value"]),
    [series],
  )

  if (populated.length === 0) {
    return (
      <div
        className="tui-card bg-card-bg border border-card-border rounded p-6 text-[11px] text-center"
        style={{ color: "var(--text-muted)" }}
      >
        Cross-protocol rate dispersion accumulates as supply-APY history
        builds up across all four protocols.
      </div>
    )
  }

  const title = `${active} · Cross-protocol rate dispersion (max − min)`
  const latest = bucketed[bucketed.length - 1]
  const avg =
    bucketed.length > 0
      ? bucketed.reduce((s, p) => s + (p.value ?? 0), 0) / bucketed.length
      : 0

  return (
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
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {title}
          <MethodologyTooltip methodologyKey="rates-dispersion" />
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] uppercase tracking-[0.1em]"
              style={{ color: "var(--text-muted)" }}
            >
              Asset
            </span>
            {populated.map((sym) => {
              const isActive = sym === active
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setActive(sym)}
                  className="px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] rounded-full transition-colors"
                  style={{
                    color: isActive ? "var(--accent-blue)" : "var(--text-muted)",
                    background: isActive
                      ? "rgba(91, 127, 255, 0.10)"
                      : "transparent",
                    border: `1px solid ${isActive ? "var(--accent-blue)" : "var(--card-border)"}`,
                    cursor: "pointer",
                  }}
                  aria-pressed={isActive}
                >
                  {sym}
                </button>
              )
            })}
          </div>
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[200px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id={`disp-${active}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5B7FFF" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#5B7FFF" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(ts) => formatBucketLabel(ts, "week")}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${v.toFixed(1)}%`}
              width={42}
            />
            <Tooltip
              content={<CustomTooltip bucket="week" />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#5B7FFF"
              strokeWidth={1.75}
              fill={`url(#disp-${active})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div
        className="px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        Latest: {formatPercent(latest?.value ?? 0, 2)} · 18m average:{" "}
        {formatPercent(avg, 2)} · weekly buckets
      </div>
    </div>
  )
}
