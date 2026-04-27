"use client"

/**
 * MarketSupplyBorrowChart — Moonwell-style "Supply / Borrow vs Caps".
 *
 * Two filled area lines (Supply green, Borrow orange) over time, with
 * optional dashed horizontal reference lines for the on-chain Supply Cap
 * and Borrow Cap. Renders meaningfully even when caps aren't loaded —
 * supply/borrow USD history comes from DefiLlama and is always available;
 * cap reference lines appear when the per-protocol on-chain enrichment
 * succeeded. The tooltip shows all four values (matching the Moonwell
 * dashboard's exact field labels).
 *
 * Y-axis is sized to the supply/borrow data — when a cap is far above
 * (typical for under-utilized reserves) the dashed line still renders if
 * within domain, otherwise the cap shows in the tooltip only.
 */

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
} from "@/lib/time-bucketing"

interface Props {
  supplyHistory: Array<{ timestamp: number; value: number }>
  borrowHistory: Array<{ timestamp: number; value: number }>
  /** Live on-chain supply cap in USD; null when not available. */
  supplyCapUsd: number | null
  /** Live on-chain borrow cap in USD; null when not available. */
  borrowCapUsd: number | null
}

const SUPPLY_COLOR = "#10B981"
const BORROW_COLOR = "#FF8A3D"
const SUPPLY_CAP_COLOR = "#D6322E"  // red dashed
const BORROW_CAP_COLOR = "#3B5FE0"  // blue dashed

function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

interface TooltipRowProps {
  color: string
  label: string
  value: number | null | undefined
  dashed?: boolean
}

function TooltipRow({ color, label, value, dashed }: TooltipRowProps) {
  if (value == null || !Number.isFinite(value)) return null
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex items-center gap-2">
        {dashed ? (
          <span
            className="inline-block w-3"
            style={{
              borderTop: `2px dashed ${color}`,
              height: 0,
              marginTop: "1px",
            }}
          />
        ) : (
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
      </div>
      <span className="text-xs font-medium tabular-nums" style={{ color: "var(--foreground)" }}>
        {fmtUsd(value)}
      </span>
    </div>
  )
}

interface CapTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { timestamp: number; supply?: number; borrow?: number } }>
  bucket: ReturnType<typeof rangeToBucket>
  supplyCapUsd: number | null
  borrowCapUsd: number | null
}

function CapTooltip({
  active,
  payload,
  bucket,
  supplyCapUsd,
  borrowCapUsd,
}: CapTooltipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="custom-tooltip min-w-[220px]">
      <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
        {formatBucketTooltipLabel(point.timestamp, bucket)}
      </p>
      <div className="space-y-1.5">
        <TooltipRow color={SUPPLY_COLOR} label="Supply" value={point.supply} />
        <TooltipRow color={BORROW_COLOR} label="Borrow" value={point.borrow} />
        <TooltipRow color={SUPPLY_CAP_COLOR} label="Supply Cap" value={supplyCapUsd} dashed />
        <TooltipRow color={BORROW_CAP_COLOR} label="Borrow Cap" value={borrowCapUsd} dashed />
      </div>
    </div>
  )
}

interface LegendItemProps {
  color: string
  label: string
  dashed?: boolean
}

function LegendItem({ color, label, dashed }: LegendItemProps) {
  return (
    <div className="flex items-center gap-1">
      {dashed ? (
        <span
          className="inline-block w-3"
          style={{ borderTop: `2px dashed ${color}`, height: 0 }}
        />
      ) : (
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  )
}

export function MarketSupplyBorrowChart({
  supplyHistory,
  borrowHistory,
  supplyCapUsd,
  borrowCapUsd,
}: Props) {
  const [range, setRange] = useState<TimeRange>(30)
  const colors = useThemeColors()
  const bucket = rangeToBucket(range)

  // Merge supply + borrow timestamps into one row per day so Recharts can
  // render two lines from a single dataset.
  const data = useMemo(() => {
    const supplyByTs = new Map<number, number>()
    for (const p of supplyHistory) supplyByTs.set(p.timestamp, p.value)
    const borrowByTs = new Map<number, number>()
    for (const p of borrowHistory) borrowByTs.set(p.timestamp, p.value)
    const allTs = new Set<number>([...supplyByTs.keys(), ...borrowByTs.keys()])
    const merged = [...allTs].sort((a, b) => a - b).map((ts) => ({
      timestamp: ts,
      supply: supplyByTs.get(ts) ?? 0,
      borrow: borrowByTs.get(ts) ?? 0,
    }))
    return bucketSeries(merged, bucket, "last", ["supply", "borrow"])
  }, [supplyHistory, borrowHistory, bucket])

  const isEmpty = data.length < 2

  // Y-domain sized to the supply/borrow values; caps may sit above the
  // visible top — they still appear in the tooltip and as a clipped marker
  // at the top edge if Recharts can render them within range.
  const yMax = useMemo(() => {
    const peak = data.reduce((m, p) => Math.max(m, p.supply ?? 0, p.borrow ?? 0), 0)
    return peak > 0 ? peak * 1.15 : undefined
  }, [data])

  return (
    <div className="tui-card bg-card border border-border rounded overflow-hidden flex flex-col">
      <div
        className="border-b border-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Supply / Borrow vs Caps
        </span>
        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          <LegendItem color={SUPPLY_COLOR} label="Supply" />
          <LegendItem color={BORROW_COLOR} label="Borrow" />
          {supplyCapUsd != null && (
            <LegendItem color={SUPPLY_CAP_COLOR} label="Supply Cap" dashed />
          )}
          {borrowCapUsd != null && (
            <LegendItem color={BORROW_CAP_COLOR} label="Borrow Cap" dashed />
          )}
        </div>
        <TimeToggle
          selected={range}
          onChange={setRange}
          options={[7, 30, 90, 0]}
          labels={{ 7: "W", 30: "M", 90: "Q", 0: "All" }}
        />
      </div>
      <div className="relative p-4 h-[260px]">
        {isEmpty ? (
          <div
            className="h-full flex items-center justify-center text-[11px] text-center px-6"
            style={{ color: "var(--text-muted)" }}
          >
            Supply / Borrow history not available for this pool yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-supply" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SUPPLY_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SUPPLY_COLOR} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="grad-borrow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BORROW_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BORROW_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(ts) => formatBucketLabel(ts, bucket)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => fmtUsd(v)}
                width={70}
                domain={yMax ? [0, yMax] : undefined}
              />
              <Tooltip
                content={
                  <CapTooltip
                    bucket={bucket}
                    supplyCapUsd={supplyCapUsd}
                    borrowCapUsd={borrowCapUsd}
                  />
                }
                cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
              />
              {/* Cap reference lines — only render when within visible domain.
                  Recharts auto-clips lines outside the y-domain, but the
                  tooltip still shows the cap value either way. */}
              {supplyCapUsd != null && yMax != null && supplyCapUsd <= yMax && (
                <ReferenceLine
                  y={supplyCapUsd}
                  stroke={SUPPLY_CAP_COLOR}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              {borrowCapUsd != null && yMax != null && borrowCapUsd <= yMax && (
                <ReferenceLine
                  y={borrowCapUsd}
                  stroke={BORROW_CAP_COLOR}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              <Area
                type="monotone"
                dataKey="supply"
                stroke={SUPPLY_COLOR}
                strokeWidth={1.75}
                fill="url(#grad-supply)"
                fillOpacity={1}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="borrow"
                stroke={BORROW_COLOR}
                strokeWidth={1.75}
                fill="url(#grad-borrow)"
                fillOpacity={1}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
