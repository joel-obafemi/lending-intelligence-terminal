"use client"

/**
 * Spark USDS Yield Panel — three-line chart that maps Spark's role as
 * Sky's on-chain distribution arm.
 *
 *   - Sky Savings Rate (SSR)         — depositor base rate (Sky's sUSDS)
 *   - Spark USDS Borrow APY          — what Spark borrowers pay
 *   - 4-week T-bill (FRED TB4WK)     — risk-free benchmark
 *
 * The wedge between Borrow and SSR is the captured spread that funds
 * Spark's protocol revenue. The wedge between SSR and T-bill is the
 * depositor's premium for taking on smart-contract exposure over
 * Treasuries. Auto insight beneath summarises both spreads in basis
 * points so the reader gets the captured-yield story without prose.
 */

import { useRef } from "react"
import {
  Area,
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
const BORROW_COLOR = "#FF6B35"       // Spark brand orange (= borrow side)

function tooltipFormatter(value: number, name: string): [string, string] {
  const label =
    name === "ssrPct"
      ? "Sky Savings Rate"
      : name === "sparkBorrowPct"
      ? "Spark USDS Borrow APY"
      : name === "tBillPct"
      ? "4-week T-bill"
      : name
  return [`${value.toFixed(2)}%`, label]
}

function buildInsight(d: SparkYieldPanelResponse): string {
  const { ssrPct, sparkBorrowPct, tBillPct, capturedSpreadPct, onchainPremiumPct } = d.current
  const parts: string[] = []
  if (ssrPct != null) {
    parts.push(`Sky Savings Rate: ${ssrPct.toFixed(2)}% — what USDS savers earn`)
  }
  if (sparkBorrowPct != null) {
    const tail =
      capturedSpreadPct != null
        ? ` (a ${Math.round(capturedSpreadPct * 100)}-bp spread Spark captures from borrowers)`
        : ""
    parts.push(`Spark USDS borrowers pay ${sparkBorrowPct.toFixed(2)}%${tail}`)
  }
  if (tBillPct != null && onchainPremiumPct != null) {
    const bps = Math.round(onchainPremiumPct * 100)
    const verb = bps >= 0 ? "over" : "under"
    parts.push(
      `T-bills are at ${tBillPct.toFixed(2)}% — savers earn ${Math.abs(bps)} bps ${verb} the risk-free rate`,
    )
  }
  return parts.join(". ") + (parts.length > 0 ? "." : "")
}

export function SparkYieldPanel({ data }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const insight = buildInsight(data)
  const hasSsr = data.history.some((p) => p.ssrPct != null)
  const hasBorrow = data.history.some((p) => p.sparkBorrowPct != null)
  const hasTbill = data.history.some((p) => p.tBillPct != null)

  if (!hasSsr && !hasBorrow) {
    // Nothing useful to render — degrade silently.
    return null
  }

  const title = "USDS Yield · Sky vs Spark vs T-bill"

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
              {hasBorrow && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: BORROW_COLOR }} />
                  <span>Spark USDS Borrow</span>
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
        {/* One-paragraph plain-English explainer so a reader who lands on
            this chart understands what each line is before they see numbers. */}
        <p
          className="text-[11px] leading-relaxed px-4 py-2"
          style={{
            color: "var(--text-muted)",
            background: "var(--panel-header)",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          What USDS savers earn (Sky), what Spark borrowers pay (lending market),
          and what Treasuries pay (FRED) — three rates that map Spark's role as
          Sky's on-chain distribution arm. The wedge between borrow and SSR is
          Spark's captured spread; the wedge between SSR and T-bill is the
          depositor's on-chain premium.
        </p>
        <div className="relative p-4 h-[280px] chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.history} margin={{ top: 10, right: 16, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="sparkSsrFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SSR_COLOR} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={SSR_COLOR} stopOpacity={0.02} />
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
              {/* SSR rendered as a soft area to anchor the reader's eye —
                  this is the headline depositor rate Spark surfaces on
                  app.spark.fi/savings. */}
              {hasSsr && (
                <Area
                  type="monotone"
                  dataKey="ssrPct"
                  stroke={SSR_COLOR}
                  strokeWidth={2}
                  fill="url(#sparkSsrFill)"
                  fillOpacity={1}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {hasBorrow && (
                <Line
                  type="monotone"
                  dataKey="sparkBorrowPct"
                  stroke={BORROW_COLOR}
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
      {insight && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {insight}
        </p>
      )}
    </div>
  )
}
