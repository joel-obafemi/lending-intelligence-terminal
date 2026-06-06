"use client"

/**
 * Loan-to-Deposit Ratio renderer for /reports.
 *
 * Pure presentation. Receives pre-loaded data from the chart registry:
 * a daily history where each point carries per-protocol LDR % values
 * (keyed by slug) plus a supplied-weighted sectorLdr field. Renders six
 * solid lines (one per protocol, report palette) and the sector LDR as
 * a dashed grey overlay. A horizontal reference line at 50% marks the
 * Fluid-vs-everyone-else divider that the §06.4 narrative leans on.
 *
 * Visual conventions match the rest of components/report/charts/* —
 * cream tooltip, JetBrains Mono axis labels, navy / burnt-orange brand,
 * thinner strokes than the dashboard variant. Sister to the dashboard
 * chart at components/overview/ldr-chart.tsx; both consume the same
 * loadOverview() series.
 */
import { useMemo } from "react"
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import { PROTOCOLS } from "@/lib/protocols"
import type { ChartRegistryParams } from "@/lib/reports/types"

const BRAND = "#1F3A5F"
const MUTED = "#595959"
const SUBTLE = "#B8C9DD"
const CREAM = "#F7F4ED"

/** Report-context palette for the six covered protocols. Same first four
 *  colors as the existing report charts (MarketShareChart, etc.) — keeps
 *  Aave navy, Spark burnt orange, Morpho soft blue, Fluid green; adds
 *  Compound purple and Euler amber for the 6-protocol scope. */
const PROTOCOL_COLORS: Record<string, string> = {
  "aave-v3": "#1F3A5F",     // navy
  spark: "#C5511A",          // burnt orange
  "morpho-blue": "#5B7FFF",  // soft blue
  fluid: "#10B981",          // green — emphasized; §06.4 leads with Fluid
  "compound-v3": "#B44AFF",  // purple
  "euler-v2": "#F59E0B",     // amber
}

const REFERENCE_LDR_PCT = 50
const SECTOR_KEY = "sectorLdr"

interface Datum {
  timestamp: number
  sectorLdr: number
  [protocolSlug: string]: number
}

interface Props {
  data: { history: Datum[]; freezeMarker: number | null }
  params: ChartRegistryParams
}

function fmtMonthYear(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  })
}

function fmtFullDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function ReportTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as Datum | undefined
  if (!point) return null
  const rows = PROTOCOLS.map((p) => ({
    key: p.slug,
    label: p.name,
    color: PROTOCOL_COLORS[p.slug] ?? MUTED,
    value: typeof point[p.slug] === "number" ? point[p.slug] : null,
  })).filter((r) => r.value != null)
  // Sort descending so Fluid (typically the leader) lands at the top.
  rows.sort((a, b) => (b.value as number) - (a.value as number))
  return (
    <div
      style={{
        background: CREAM,
        border: "1px solid #D4CFC2",
        borderRadius: 4,
        padding: "10px 14px",
        fontFamily: "var(--report-font-sans, Inter, sans-serif)",
        fontSize: 12,
        color: "#0E1B2C",
        boxShadow: "0 4px 12px rgba(15, 17, 21, 0.08)",
        minWidth: 220,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{fmtFullDate(point.timestamp)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 16px" }}>
        {rows.map((r) => (
          <span key={r.key} style={{ display: "contents" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: r.color,
                }}
              />
              {r.label}
            </span>
            <span
              style={{
                fontFamily: "var(--report-font-mono)",
                fontVariantNumeric: "tabular-nums",
                textAlign: "right",
              }}
            >
              {(r.value as number).toFixed(2)}%
            </span>
          </span>
        ))}
        <span
          style={{
            color: MUTED,
            paddingTop: 4,
            borderTop: "1px solid #D4CFC2",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 16,
              height: 0,
              borderTop: `1.5px dashed ${MUTED}`,
            }}
          />
          Sector
        </span>
        <span
          style={{
            fontFamily: "var(--report-font-mono)",
            fontVariantNumeric: "tabular-nums",
            textAlign: "right",
            paddingTop: 4,
            borderTop: "1px solid #D4CFC2",
            fontWeight: 600,
          }}
        >
          {point.sectorLdr.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

export function LdrChart({ data, params }: Props) {
  const height = 380
  const series = useMemo(() => data.history, [data.history])

  if (series.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED,
          fontFamily: "var(--report-font-mono)",
          fontSize: 12,
          background: "rgba(31, 58, 95, 0.04)",
          border: "1px dashed var(--report-border, #D4CFC2)",
          borderRadius: 4,
        }}
      >
        No data in window
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 12, right: 32, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={SUBTLE} strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tickFormatter={fmtMonthYear}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: SUBTLE }}
            tickLine={false}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            tick={{ fontFamily: "var(--report-font-mono)", fontSize: 11, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          {/* 50% reference line — the Fluid-vs-everyone-else divider §06.4 leans on. */}
          <ReferenceLine
            y={REFERENCE_LDR_PCT}
            stroke={BRAND}
            strokeDasharray="4 4"
            strokeOpacity={0.4}
            label={{
              value: `${REFERENCE_LDR_PCT}%`,
              position: "right",
              fontSize: 10,
              fontFamily: "var(--report-font-mono)",
              fill: BRAND,
              opacity: 0.6,
            }}
          />
          {data.freezeMarker != null && (
            <ReferenceLine
              x={data.freezeMarker}
              stroke={BRAND}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              opacity={0.5}
            />
          )}
          {PROTOCOLS.map((p) => (
            <Line
              key={p.slug}
              type="monotone"
              dataKey={p.slug}
              name={p.name}
              stroke={PROTOCOL_COLORS[p.slug] ?? MUTED}
              strokeWidth={p.slug === "fluid" ? 2.2 : 1.6}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          <Line
            type="monotone"
            dataKey={SECTOR_KEY}
            name="Sector"
            stroke={MUTED}
            strokeWidth={1.4}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Tooltip
            content={<ReportTooltip />}
            cursor={{ stroke: SUBTLE, strokeWidth: 1 }}
          />
          <Legend
            wrapperStyle={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              color: MUTED,
              paddingTop: 12,
            }}
            iconType="plainline"
            iconSize={14}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
