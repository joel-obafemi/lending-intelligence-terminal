"use client"

/**
 * Loan-to-Deposit Ratio (LDR) chart — per-protocol LDR over time, with a
 * dashed sector-average overlay. W / M / Q period toggle that buckets
 * the underlying daily series for cleaner visual trends at each
 * resolution.
 *
 * Reuses the existing `utilizationSeries` payload from loadOverview()
 * (per-protocol borrows / supplied, computed daily) because LDR is the
 * same numerator over the same denominator — the chart just relabels it
 * as a depositor-efficiency metric to match Issue 002's §06.4 framing.
 */
import { useMemo, useRef, useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import { formatPercent } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import { TimeToggle, type TimeRange } from "../time-toggle"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
} from "@/lib/time-bucketing"
import type { OverviewTimeseriesPoint } from "@/lib/overview"

interface Props {
  /** Per-protocol utilization (= LDR) over time, one series per slug. */
  utilizationSeries: OverviewTimeseriesPoint[]
  /** Per-protocol total supplied over time. Used to compute the
   *  supplied-weighted sector LDR per timestamp. */
  supplySeries: OverviewTimeseriesPoint[]
  /** Per-protocol total borrowed over time. */
  borrowedSeries: OverviewTimeseriesPoint[]
}

type Datum = OverviewTimeseriesPoint & { sectorLdr: number }

function CustomTooltip({ active, payload, label, bucket }: any) {
  if (!active || !payload?.length) return null
  const sorted = [...payload].sort((a: any, b: any) => (b?.value ?? 0) - (a?.value ?? 0))
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs text-text-muted mb-1.5">
        {formatBucketTooltipLabel(Number(label), bucket)}
      </p>
      <div className="space-y-1">
        {sorted.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3 text-xs">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatPercent(entry.value, 2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LdrChart({
  utilizationSeries,
  supplySeries,
  borrowedSeries,
}: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<TimeRange>(30)
  const bucket = rangeToBucket(range)

  // Compute sector LDR per day = Σ borrowed / Σ supplied across all
  // protocols on that timestamp, then bucket the joined series at the
  // selected resolution. LDR is a percentage — average within each
  // bucket (sum would be meaningless).
  const data = useMemo<Datum[]>(() => {
    const supplyByTs = new Map<number, OverviewTimeseriesPoint>()
    for (const pt of supplySeries) supplyByTs.set(pt.timestamp, pt)
    const borrowByTs = new Map<number, OverviewTimeseriesPoint>()
    for (const pt of borrowedSeries) borrowByTs.set(pt.timestamp, pt)
    const daily = utilizationSeries.map((pt) => {
      const sup = supplyByTs.get(pt.timestamp)
      const bor = borrowByTs.get(pt.timestamp)
      let sectorSup = 0
      let sectorBor = 0
      if (sup) for (const p of PROTOCOLS) sectorSup += (sup[p.slug] as number) || 0
      if (bor) for (const p of PROTOCOLS) sectorBor += (bor[p.slug] as number) || 0
      const sectorLdr = sectorSup > 0 ? (sectorBor / sectorSup) * 100 : 0
      return { ...pt, sectorLdr }
    })
    const keysToBucket = [...PROTOCOLS.map((p) => p.slug), "sectorLdr"]
    return bucketSeries<Datum>(daily as Datum[], bucket, "avg", keysToBucket)
  }, [utilizationSeries, supplySeries, borrowedSeries, bucket])

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span className="flex items-center gap-3">
          <span
            className="text-accent flex items-center gap-1.5"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Loan-to-Deposit Ratio
            <MethodologyTooltip methodologyKey="sector-ldr" />
          </span>
          <span className="text-[10px] text-text-muted">
            Per-protocol LDR over time. Sector average dashed.
          </span>
        </span>
        <div className="flex items-center gap-2">
          <TimeToggle
            selected={range}
            onChange={setRange}
            options={[7, 30, 90]}
            labels={{ 7: "W", 30: "M", 90: "Q" }}
          />
          <ChartActions cardRef={cardRef} title="Loan-to-Deposit Ratio" />
        </div>
      </div>
      <div style={{ padding: "12px 16px 16px", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts) => formatBucketLabel(Number(ts), bucket)}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              stroke={colors.cardBorder}
            />
            <YAxis
              tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              stroke={colors.cardBorder}
            />
            <Tooltip content={<CustomTooltip bucket={bucket} />} />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              iconType="line"
            />
            {PROTOCOLS.map((p) => (
              <Line
                key={p.slug}
                type="monotone"
                dataKey={p.slug}
                name={p.name}
                stroke={p.color}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="sectorLdr"
              name="Sector"
              stroke={colors.textMuted}
              strokeWidth={1.4}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
