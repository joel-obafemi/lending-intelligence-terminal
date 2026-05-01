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
  /** Optional longer history series used to compute peak-to-current
   *  drawdown. Pass the same series the sparkline came from but extended
   *  back further (e.g. 365 days). When set and the current value is
   *  meaningfully below the peak, a small "↓ X% from peak (date)"
   *  sub-line renders beneath the headline number. */
  historyForDrawdown?: Array<{ timestamp: number; value: number }>
  /** Drawdown threshold — only show the sub-line when current value is
   *  this fraction or more below the peak. Default 0.10 (10%). */
  drawdownThreshold?: number
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
  historyForDrawdown,
  drawdownThreshold = 0.1,
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

  // Compute the peak-to-current drawdown sub-line. Only USD-formatted
  // metrics get this — drawdown on a percent (e.g. utilization) reads
  // weirdly and is usually better expressed as MoM/YoY.
  const drawdown =
    format === "usd" && historyForDrawdown && historyForDrawdown.length > 1
      ? computeDrawdown(value, historyForDrawdown, drawdownThreshold)
      : null

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
      {drawdown && (
        <div
          className="pl-2 text-[10px] leading-tight"
          style={{ color: "var(--text-muted)" }}
          title={`Peak: ${formatUSD(drawdown.peakValue)} on ${drawdown.peakDateLong}. Current: ${formatUSD(drawdown.currentValue)}.`}
        >
          <span style={{ color: "var(--accent-yellow)" }}>↓</span>{" "}
          {(drawdown.fromPeakPct * 100).toFixed(0)}% from {drawdown.peakDateShort} peak ({formatUSD(drawdown.peakValue)})
        </div>
      )}
    </div>
  )
}

interface DrawdownInfo {
  peakValue: number
  peakDateShort: string
  peakDateLong: string
  currentValue: number
  fromPeakPct: number
}

/**
 * Compute peak-to-current drawdown for a USD time series.
 *
 * `currentValue` is the live snapshot (already shown as the headline);
 * `series` is the history we walk to find the peak. Returns null if the
 * peak is recent (within 7 days of `currentValue`'s implied timestamp)
 * OR the drawdown is below `threshold` — both cases would just look like
 * normal volatility rather than a meaningful peak-to-current story.
 */
function computeDrawdown(
  currentValue: number,
  series: Array<{ timestamp: number; value: number }>,
  threshold: number,
): DrawdownInfo | null {
  if (currentValue <= 0 || series.length === 0) return null
  // Find the global peak.
  let peak = series[0]
  for (const p of series) {
    if (p.value > peak.value) peak = p
  }
  const fromPeakPct = (peak.value - currentValue) / peak.value
  if (!Number.isFinite(fromPeakPct) || fromPeakPct < threshold) return null
  // Skip when the peak is the most recent point in the series — that's
  // just "we're at the peak right now", no drawdown story.
  const lastTs = series[series.length - 1].timestamp
  if (lastTs - peak.timestamp < 7 * 86400) return null
  const dateShort = new Date(peak.timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
  const dateLong = new Date(peak.timestamp * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  return {
    peakValue: peak.value,
    peakDateShort: dateShort,
    peakDateLong: dateLong,
    currentValue,
    fromPeakPct,
  }
}
