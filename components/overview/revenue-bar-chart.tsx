"use client"

import { useMemo, useRef, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import { formatUSD } from "@/lib/utils"
import { useThemeColors } from "../theme-provider"
import { TimeToggle, type TimeRange } from "../time-toggle"
import { ChartActions } from "../chart-actions"
import { MethodologyTooltip } from "./methodology-tooltip"
import {
  bucketSeries,
  formatBucketLabel,
  formatBucketTooltipLabel,
  rangeToBucket,
  type BucketType,
} from "@/lib/time-bucketing"
import { useAnnotations } from "@/lib/annotations"
import { ChartAnnotations } from "./chart-annotations"
import type { OverviewTimeseriesPoint } from "@/lib/overview"

interface Props {
  title: string
  data: OverviewTimeseriesPoint[]
  defaultRange?: TimeRange
  methodologyKey?: string
  /** Optional override on the per-bucket display limit. Default month
   *  view shows 24 buckets — pass `{ month: 12 }` to render the trailing
   *  12 months instead. Only the keys listed are overridden; others keep
   *  the global default. */
  bucketLimits?: Partial<Record<BucketType, number>>
  /** When true, the chart header shows a Dollars ⇄ Share-of-sector toggle
   *  that renormalizes each bucket so protocol values sum to 100%. Useful
   *  on protocol-stacked charts dominated by one party (Aave V3 in fees).
   *  Defaults to dollars; the user picks Share when they want share
   *  dynamics. */
  enableShareToggle?: boolean
  /** Optional annotation channel — renders curated events from
   *  `content/annotations.json` whose `chartKeys` array contains this
   *  key. Used on the Risk page's liquidation-volume chart for the
   *  rsETH contagion overlay. */
  annotationKey?: string
}

function RevenueTooltip({ active, payload, bucket, shareMode, originals }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as OverviewTimeseriesPoint | undefined
  if (!point) return null

  // In share-mode the rendered bars are percentages, but the tooltip
  // should still show the underlying dollar values (looked up from the
  // pre-renormalization series).
  const orig = (originals as Map<number, OverviewTimeseriesPoint> | undefined)?.get(
    point.timestamp,
  )
  const source = orig ?? point
  const rows = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    value: (source[p.slug] as number) || 0,
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <div className="custom-tooltip min-w-[240px]">
      <p className="text-xs text-text-muted mb-2">
        {formatBucketTooltipLabel(point.timestamp, bucket)}
      </p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs text-text-secondary">{r.name}</span>
            </div>
            <span className="text-xs font-medium text-text-primary">
              {formatUSD(r.value)}
              {shareMode && total > 0 && (
                <span className="text-text-muted ml-1.5">
                  {((r.value / total) * 100).toFixed(0)}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-card-border mt-2 pt-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Total</span>
        <span className="text-sm font-semibold text-text-primary">{formatUSD(total)}</span>
      </div>
    </div>
  )
}

export function RevenueBarChart({
  title,
  data,
  defaultRange = 30,
  methodologyKey,
  bucketLimits,
  enableShareToggle = false,
  annotationKey,
}: Props) {
  const [range, setRange] = useState<TimeRange>(defaultRange)
  const [shareMode, setShareMode] = useState(false)
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const bucket = rangeToBucket(range)
  // Revenue is flow data — sum daily/weekly values within each bucket.
  // Pull the per-bucket display limit from caller overrides first; fall
  // back to the lib default when not specified for this bucket type.
  const limit = bucketLimits?.[bucket]
  const bucketedRaw = useMemo(
    () =>
      bucketSeries(
        data,
        bucket,
        "sum",
        PROTOCOLS.map((p) => p.slug),
        limit,
      ),
    [data, bucket, limit],
  )

  // In share mode each bucket is renormalized so the protocol values
  // sum to 100. The tooltip still shows dollars by looking the bucket
  // up in `originalsByTs` below.
  const bucketed = useMemo(() => {
    if (!shareMode) return bucketedRaw
    return bucketedRaw.map((pt) => {
      const total = PROTOCOLS.reduce(
        (s, p) => s + ((pt[p.slug] as number) ?? 0),
        0,
      )
      const next: OverviewTimeseriesPoint = { timestamp: pt.timestamp }
      for (const p of PROTOCOLS) {
        const v = (pt[p.slug] as number) ?? 0
        next[p.slug] = total > 0 ? (v / total) * 100 : 0
      }
      return next
    })
  }, [bucketedRaw, shareMode])

  const originalsByTs = useMemo(() => {
    const map = new Map<number, OverviewTimeseriesPoint>()
    for (const pt of bucketedRaw) map.set(pt.timestamp, pt)
    return map
  }, [bucketedRaw])

  // No-op when caller doesn't pass a key — the annotation channel
  // pulls zero events and ChartAnnotations renders nothing.
  const annotations = useAnnotations(annotationKey ?? "")

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
          {title}
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </span>
        <div className="flex items-center gap-2">
          {enableShareToggle && (
            <ShareToggle shareMode={shareMode} setShareMode={setShareMode} />
          )}
          <TimeToggle
            selected={range}
            onChange={setRange}
            options={[7, 30, 90]}
            labels={{ 7: "W", 30: "M", 90: "Q" }}
          />
          <ChartActions cardRef={cardRef} title={title} />
        </div>
      </div>
      <div className="relative p-4 h-[280px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bucketed} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <XAxis
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(ts) => formatBucketLabel(ts, bucket)}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) =>
                shareMode ? `${v.toFixed(0)}%` : formatUSD(v)
              }
              width={shareMode ? 42 : 70}
              domain={shareMode ? [0, 100] : undefined}
            />
            <Tooltip
              content={
                <RevenueTooltip
                  bucket={bucket}
                  shareMode={shareMode}
                  originals={originalsByTs}
                />
              }
              cursor={{ fill: "rgba(255, 255, 255, 0.03)" }}
            />
            <ChartAnnotations events={annotations} bucket={bucket} />
            {PROTOCOLS.map((p) => (
              <Bar
                key={p.slug}
                dataKey={p.slug}
                stackId="1"
                fill={p.color}
                fillOpacity={0.8}
              />
            ))}
          </BarChart>
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
  )
}

function ShareToggle({
  shareMode,
  setShareMode,
}: {
  shareMode: boolean
  setShareMode: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--card-border)",
        borderRadius: "4px",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {(
        [
          { value: false, label: "Dollars" },
          { value: true, label: "Share" },
        ] as const
      ).map((opt) => (
        <button
          key={String(opt.value)}
          onClick={() => setShareMode(opt.value)}
          style={{
            padding: "4px 10px",
            fontSize: "10px",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
            fontFamily: "inherit",
            backgroundColor:
              shareMode === opt.value ? "var(--card-border)" : "transparent",
            color:
              shareMode === opt.value
                ? "var(--text-primary)"
                : "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
          title={
            opt.value
              ? "Renormalize each bucket to 100% so the share dynamics across protocols are visible."
              : "Show absolute fee dollars per protocol per bucket."
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
