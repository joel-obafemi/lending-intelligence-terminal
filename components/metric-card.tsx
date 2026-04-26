"use client"

import { LineChart, Line, ResponsiveContainer } from "recharts"
import { formatUSD, formatPercent } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: number
  /** Optional 24h change in absolute USD */
  change24h?: number
  /** Optional 30-day (month-over-month) change in absolute USD */
  changeMoM?: number
  /** Optional 365-day (year-over-year) change in absolute USD */
  changeYoY?: number
  /** Optional sparkline series — last ~30 days of the metric */
  sparkline?: Array<{ timestamp: number; value: number }>
  icon?: React.ReactNode
  accentColor?: string
  /** Display format for `value`. Defaults to USD. */
  format?: "usd" | "count" | "percent"
  /** Optional caption shown beside the headline number (e.g. "of cross-protocol borrows"). */
  caption?: string
}

interface DeltaPillProps {
  label: string
  value: number | undefined
  accent?: string
}

function DeltaPill({ label, value, accent }: DeltaPillProps) {
  if (value === undefined || value === 0) return null
  const positive = value >= 0
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-medium"
      style={{ color: positive ? "var(--success)" : "var(--danger)" }}
    >
      <span>{positive ? "\u25B2" : "\u25BC"}</span>
      <span>{formatUSD(Math.abs(value))}</span>
      <span className="text-text-muted ml-0.5" style={accent ? { color: accent } : undefined}>
        {label}
      </span>
    </span>
  )
}

export function MetricCard({
  label,
  value,
  change24h,
  changeMoM,
  changeYoY,
  sparkline,
  icon,
  accentColor,
  format = "usd",
  caption,
}: MetricCardProps) {
  const display =
    format === "count"
      ? value.toLocaleString()
      : format === "percent"
      ? formatPercent(value, 1)
      : formatUSD(value)
  const accent = accentColor || "var(--accent)"
  const hasSpark = sparkline && sparkline.length > 1

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded-lg p-4 flex flex-col gap-1.5 relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-center justify-between gap-2 pl-2">
        <div className="flex items-center gap-2">
          {icon && <span style={{ color: accent }}>{icon}</span>}
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: accent }}
          >
            {label}
          </span>
        </div>
        {hasSpark && (
          <div className="w-[80px] h-[24px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={accent}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="pl-2">
        <span className="text-xl font-semibold text-text-primary tabular-nums">
          {display}
        </span>
        {caption && (
          <span className="text-[10px] text-text-muted ml-2">{caption}</span>
        )}
      </div>
      <div className="pl-2 flex flex-wrap gap-x-3 gap-y-0.5">
        <DeltaPill label="24h" value={change24h} />
        <DeltaPill label="MoM" value={changeMoM} />
        <DeltaPill label="YoY" value={changeYoY} />
      </div>
    </div>
  )
}
