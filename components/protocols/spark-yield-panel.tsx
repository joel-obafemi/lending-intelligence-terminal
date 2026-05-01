"use client"

/**
 * Spark Stablecoin Yield Panel — Spark protocol-specific lens, Module B.
 *
 * Three lines on one chart over the available DefiLlama window:
 *   - Sky Savings Rate (SSR)         — green
 *   - sUSDS APY on Spark             — Spark orange (brand)
 *   - 4-week T-bill (FRED TB4WK)     — muted dashed grey
 *
 * The wedge between SSR and "sUSDS on Spark" is the captured-yield
 * story: it's how much Sky retains for the SSR-to-Spark passthrough.
 * The wedge between Spark and T-bill is the depositor's risk premium
 * for taking on smart-contract exposure instead of T-bills.
 *
 * Auto insight beneath summarises the latest values in plain English.
 */

import { useRef } from "react"
import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import { formatDate } from "@/lib/utils"
import type { SparkYieldPanelResponse } from "@/lib/spark-yield-panel"

interface Props {
  data: SparkYieldPanelResponse
}

const SSR_COLOR = "#0F9D58"          // Sky / savings green
const SPARK_COLOR = "#FF6B35"        // Spark brand orange
const TBILL_COLOR = "var(--text-muted)"

function tooltipFormatter(value: number, name: string): [string, string] {
  const label =
    name === "ssrPct"
      ? "Sky Savings Rate"
      : name === "susdsSparkPct"
      ? "sUSDS APY on Spark"
      : name === "tBillPct"
      ? "4-week T-bill"
      : name
  return [`${value.toFixed(2)}%`, label]
}

function buildInsight(d: SparkYieldPanelResponse): string {
  const { ssrPct, susdsSparkPct, tBillPct, sparkSpreadPct, skyToSparkLossPct } = d.current
  if (susdsSparkPct == null) {
    return "DefiLlama hasn't indexed sUSDS on Spark yet."
  }
  const parts: string[] = [
    `Spark depositors are earning ${susdsSparkPct.toFixed(2)}% on sUSDS`,
  ]
  if (sparkSpreadPct != null && tBillPct != null) {
    const bps = Math.round(sparkSpreadPct * 100)
    const verb = bps >= 0 ? "over" : "under"
    parts.push(
      `${Math.abs(bps)} bps ${verb} the 4-week T-bill (${tBillPct.toFixed(2)}%)`,
    )
  }
  let line = parts.join(", ") + "."
  if (skyToSparkLossPct != null && ssrPct != null) {
    const lossBps = Math.round(skyToSparkLossPct * 100)
    line += lossBps > 0
      ? ` The Sky Savings Rate is ${ssrPct.toFixed(2)}% — Spark passes through ${(susdsSparkPct / ssrPct * 100).toFixed(0)}% of that, retaining ${lossBps} bps for the protocol.`
      : ` Spark depositors are earning at par with the Sky Savings Rate (${ssrPct.toFixed(2)}%).`
  }
  return line
}

export function SparkYieldPanel({ data }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const insight = buildInsight(data)
  const hasSsr = data.history.some((p) => p.ssrPct != null)
  const hasSpark = data.history.some((p) => p.susdsSparkPct != null)
  const hasTbill = data.history.some((p) => p.tBillPct != null)

  if (!hasSpark && !hasSsr) {
    // Shouldn't happen often — DefiLlama indexes at least one of these
    // — but degrade cleanly when neither is available.
    return null
  }

  const title = "Stablecoin Yield Cascade · Sky → Spark → T-bills"

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
            {title}
            <MethodologyTooltip methodologyKey="spark-yield-panel" />
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {hasSsr && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: SSR_COLOR }} />
                  <span>Sky Savings Rate</span>
                </div>
              )}
              {hasSpark && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: SPARK_COLOR }} />
                  <span>sUSDS on Spark</span>
                </div>
              )}
              {hasTbill && (
                <div className="flex items-center gap-1">
                  <span
                    className="inline-block w-3"
                    style={{ borderTop: `2px dashed ${colors.textMuted}`, height: 0 }}
                  />
                  <span>4-week T-bill</span>
                </div>
              )}
            </div>
            <ChartActions cardRef={cardRef} title={title} />
          </div>
        </div>
        <div className="relative p-4 h-[280px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.history} margin={{ top: 10, right: 16, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="sparkSusds" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SPARK_COLOR} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={SPARK_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="timestamp"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(ts) => formatDate(ts)}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: colors.textMuted }}
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}
                labelFormatter={(ts) => formatDate(ts as number)}
                formatter={tooltipFormatter}
              />
              {/* Spark deposit APY rendered as a soft area to anchor the eye —
                  this is the metric on the page-protocol's own yield. */}
              {hasSpark && (
                <Area
                  type="monotone"
                  dataKey="susdsSparkPct"
                  stroke={SPARK_COLOR}
                  strokeWidth={2}
                  fill="url(#sparkSusds)"
                  fillOpacity={1}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {hasSsr && (
                <Line
                  type="monotone"
                  dataKey="ssrPct"
                  stroke={SSR_COLOR}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {hasTbill && (
                <Line
                  type="monotone"
                  dataKey="tBillPct"
                  stroke={colors.textMuted}
                  strokeDasharray="4 4"
                  strokeWidth={1.25}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p
        className="text-[12px] leading-relaxed px-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {insight}
      </p>
    </div>
  )
}
