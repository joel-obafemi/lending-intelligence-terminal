"use client"

/**
 * Yield Comparator — Zone 2 of the Compare page.
 *
 * Three stacked components for the selected asset:
 *   (a) Current-snapshot row — four protocol cards with supply / borrow
 *       APY, effective APY, spread, utilization. Best supply gets a green
 *       ring; lowest borrow gets an orange ring; auto-picked from the
 *       loader's `best` callouts.
 *   (b) 90-day history chart — supply APY per protocol with a dashed DFF
 *       overlay for stables.
 *   (c) Spread sub-chart — cross-protocol max − min APY over time, plus
 *       an auto insight line beneath.
 */

import { useMemo, useRef } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts"
import { useThemeColors } from "@/components/theme-provider"
import { ChartActions } from "@/components/chart-actions"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { ChartAnnotations } from "@/components/overview/chart-annotations"
import { useAnnotations } from "@/lib/annotations"
import { formatPercent, formatUSD, formatDate } from "@/lib/utils"
import { PROTOCOL_BY_SLUG } from "@/lib/protocols"
import type {
  CompareCell,
  CompareSupplyHistoryPoint,
  CompareSpreadPoint,
  CompareResponse,
  CompareHistoryResponse,
} from "@/lib/compare"

const STABLE_SYMBOLS = new Set([
  "USDC", "USDT", "DAI", "USDS", "GHO", "PYUSD", "USDE", "FRAX",
])

// ─── (a) Current-snapshot row ───────────────────────────────────────────
function YieldSnapshotCards({
  symbol,
  cells,
  best,
}: {
  symbol: string
  cells: CompareCell[]
  best: CompareResponse["best"]
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cells.map((c) => {
        const isBestSupply = best.supplyApySlug === c.protocolSlug
        const isBestBorrow = best.borrowApySlug === c.protocolSlug
        const ring = isBestSupply
          ? "0 0 0 2px var(--success)"
          : isBestBorrow
          ? "0 0 0 2px var(--accent-orange)"
          : "none"
        return (
          <div
            key={c.protocolSlug}
            className="tui-card bg-card-bg border border-card-border rounded p-3 flex flex-col gap-2"
            style={{
              borderLeft: `2px solid ${c.protocolColor}`,
              boxShadow: ring,
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{ color: c.protocolColor }}
              >
                {c.protocolName}
              </span>
              {(isBestSupply || isBestBorrow) && (
                <span
                  className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
                  style={{
                    background: isBestSupply
                      ? "rgba(15, 157, 88, 0.12)"
                      : "rgba(255, 107, 53, 0.12)",
                    color: isBestSupply ? "var(--success)" : "var(--accent-orange)",
                  }}
                >
                  {isBestSupply ? "Best Supply" : "Lowest Borrow"}
                </span>
              )}
            </div>
            {!c.available ? (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Not listed for {symbol} on this protocol.
              </p>
            ) : (
              <>
                <YieldRow
                  label="Supply APY"
                  base={c.supplyApy}
                  reward={c.supplyApyReward}
                  effective={c.supplyApyEffective}
                  tone="success"
                />
                <YieldRow
                  label="Borrow APY"
                  base={c.borrowApy}
                  reward={c.borrowApyReward}
                  effective={c.borrowApyEffective}
                  tone="danger"
                  rewardSign="−"
                />
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--text-muted)" }}>Spread</span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.spread != null ? formatPercent(c.spread, 2) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--text-muted)" }}>Utilization</span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.utilization != null ? formatPercent(c.utilization, 1) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-card-border">
                  <span style={{ color: "var(--text-muted)" }}>Total Supply</span>
                  <span
                    className="tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {c.totalSupplyUsd != null ? formatUSD(c.totalSupplyUsd) : "—"}
                  </span>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface YieldRowProps {
  label: string
  base: number | null
  reward: number | null
  effective: number | null
  tone: "success" | "danger"
  rewardSign?: "+" | "−"
}

function YieldRow({ label, base, reward, effective, tone, rewardSign = "+" }: YieldRowProps) {
  const baseColor = tone === "success" ? "var(--success)" : "var(--danger)"
  return (
    <div className="flex items-baseline justify-between gap-2 text-[12px]">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="text-right">
        <span className="font-semibold tabular-nums" style={{ color: baseColor }}>
          {base != null ? formatPercent(base, 2) : "—"}
        </span>
        {reward != null && reward > 0 && (
          <span
            className="ml-1 text-[10px] tabular-nums"
            style={{ color: "var(--accent-secondary)" }}
          >
            {rewardSign}
            {formatPercent(reward, 2)}
          </span>
        )}
        {effective != null && reward != null && reward > 0 && (
          <div className="text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            eff. {formatPercent(effective, 2)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── (b) 90-day supply APY history ──────────────────────────────────────
function SupplyHistoryChart({
  symbol,
  history,
  fedFunds,
  cells,
}: {
  symbol: string
  history: CompareSupplyHistoryPoint[]
  fedFunds: Array<{ timestamp: number; rate: number }>
  cells: CompareCell[]
}) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const showFed = STABLE_SYMBOLS.has(symbol.toUpperCase()) && fedFunds.length > 0

  // Merge fed funds into the history rows by snapping to the closest day
  // (FRED is business-day; DefiLlama is calendar-day). We just carry the
  // last-known rate forward across weekends.
  const merged = useMemo(() => {
    if (!showFed) return history
    const sortedFed = [...fedFunds].sort((a, b) => a.timestamp - b.timestamp)
    let lastRate: number | null = null
    let i = 0
    return history.map((row) => {
      while (i < sortedFed.length && sortedFed[i].timestamp <= row.timestamp) {
        lastRate = sortedFed[i].rate
        i++
      }
      return { ...row, dff: lastRate }
    })
  }, [history, fedFunds, showFed])

  const protocolKeys = cells
    .filter((c) => c.available && c.poolId)
    .map((c) => c.protocolSlug)

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {symbol} · Supply APY · 12 months
          <MethodologyTooltip methodologyKey="compare-supply-history" />
        </span>
        <ChartActions cardRef={cardRef} title={`${symbol} supply APY 90d`} />
      </div>
      <div className="relative p-4 h-[280px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
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
              formatter={(v: number, name: string) => {
                const cfg = PROTOCOL_BY_SLUG[name]
                const label = name === "dff" ? "Fed Funds" : cfg?.name ?? name
                return [`${v.toFixed(2)}%`, label]
              }}
            />
            {protocolKeys.map((slug) => {
              const cfg = PROTOCOL_BY_SLUG[slug]
              return (
                <Line
                  key={slug}
                  type="monotone"
                  dataKey={slug}
                  stroke={cfg?.color ?? "#6B7280"}
                  strokeWidth={1.75}
                  dot={false}
                  connectNulls
                />
              )
            })}
            {showFed && (
              <Line
                type="monotone"
                dataKey="dff"
                stroke={colors.textMuted}
                strokeDasharray="4 4"
                strokeWidth={1.25}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        {protocolKeys.map((slug) => {
          const cfg = PROTOCOL_BY_SLUG[slug]
          return (
            <div key={slug} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: cfg?.color ?? "#6B7280" }}
              />
              <span>{cfg?.name ?? slug}</span>
            </div>
          )
        })}
        {showFed && (
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-[2px] rounded-sm"
              style={{ background: colors.textMuted, opacity: 0.7 }}
            />
            <span>Fed Funds (DFF)</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── (c) Spread sub-chart ───────────────────────────────────────────────
function SpreadSubChart({
  spread,
  current,
  avg90d,
  symbol,
}: {
  spread: CompareSpreadPoint[]
  current: number | null
  avg90d: number | null
  symbol: string
}) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  // Curated annotations for the dispersion chart — keyed
  // "compare-cross-protocol-dispersion". Currently carries the
  // Apr 17-21 USDC spike. Annotation timestamps land at day-bucket
  // boundaries so a single dashed line + label renders.
  const annotations = useAnnotations("compare-cross-protocol-dispersion")
  // Verb carries its own preposition so the sentence stays grammatical
  // for every branch ("tighter than the …", "in line with the …").
  const verb =
    current != null && avg90d != null
      ? current < avg90d
        ? "tighter than"
        : current > avg90d
        ? "wider than"
        : "in line with"
      : "n/a vs"
  const insight =
    current != null && avg90d != null
      ? `Current dispersion across protocols on ${symbol} supply APY is ${(current * 100).toFixed(0)} bps, ${verb} the 12-month average of ${(avg90d * 100).toFixed(0)} bps.`
      : `Insufficient data to compute cross-protocol dispersion for ${symbol}.`

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          Cross-protocol Supply APY Dispersion
          <MethodologyTooltip methodologyKey="compare-supply-spread" />
        </span>
        <ChartActions cardRef={cardRef} title={`${symbol} dispersion`} />
      </div>
      <div className="relative p-4 h-[180px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spread} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="spreadFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-orange)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--accent-orange)" stopOpacity={0.05} />
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
              tickFormatter={(v) => `${v.toFixed(1)}pp`}
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
              formatter={(v: number) => [`${v.toFixed(2)}pp`, "Spread"]}
            />
            <Area
              type="monotone"
              dataKey="spreadPct"
              stroke="var(--accent-orange)"
              strokeWidth={1.5}
              fill="url(#spreadFill)"
              fillOpacity={1}
            />
            <ChartAnnotations events={annotations} bucket="day" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p
        className="text-[11px] leading-relaxed px-4 pb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        {insight}
      </p>
    </div>
  )
}

interface Props {
  response: CompareResponse
  history: CompareHistoryResponse
}

export function YieldComparator({ response, history }: Props) {
  return (
    <div className="space-y-4">
      <YieldSnapshotCards
        symbol={response.symbol}
        cells={response.cells}
        best={response.best}
      />
      <SupplyHistoryChart
        symbol={response.symbol}
        history={history.supplyHistory}
        fedFunds={history.fedFundsHistory}
        cells={response.cells}
      />
      <SpreadSubChart
        spread={history.spreadHistory}
        current={history.spreadCurrentPct}
        avg90d={history.spread90dAvgPct}
        symbol={response.symbol}
      />
    </div>
  )
}
