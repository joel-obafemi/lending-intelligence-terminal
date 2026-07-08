"use client"

/**
 * Inline data-driven chart for report bodies — driven straight from MDX
 * with plain data, no registry entry or loader needed. Ported from the
 * datumlab.xyz blog's report chart component so both surfaces render the
 * same body-embedded charts; colors follow the dashboard report palette
 * (see _shared.tsx) so the embeds sit naturally in the report column.
 *
 * Usage in MDX:
 *   <InlineChart type="bar" title="Net flow by protocol" x="protocol"
 *     unit="usdm" series={["Net flow"]}
 *     data={[{ protocol: "Aave V3", "Net flow": 845 }, …]} />
 *
 *   type: "line" | "area" | "bar"   (default "line")
 *   unit: "usdm" | "percent" | "bps" — drives the tooltip formatter
 *
 * We measure the container width ourselves (ResizeObserver) and pass
 * recharts an explicit pixel width instead of <ResponsiveContainer>,
 * which measured a 0-width plot area in the report column layout and
 * rendered blank charts on the blog surface.
 */
import { useEffect, useRef, useState } from "react"
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"
import { SERIES_COLORS } from "./_shared"
import {
  formatChartValue,
  detectUnitFromKey,
  cleanSeriesName,
  type ChartUnit,
} from "@/lib/format-usd"

type InlineChartProps = {
  type?: "line" | "area" | "bar"
  data: Record<string, string | number>[]
  x: string
  series: string[]
  title?: string
  height?: number
  unit?: ChartUnit
}

const axis = {
  stroke: "#8F9AA8",
  fontSize: 11,
  fontFamily: "var(--report-font-mono, monospace)",
}
const grid = "rgba(31, 58, 95, 0.12)"

export function InlineChart({
  type = "line",
  data = [],
  x,
  series = [],
  title,
  height = 300,
  unit,
}: InlineChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  // width 0 until measured on the client → renders a placeholder during
  // SSR / before first measure, so prerender is safe with no layout jump.
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const common = { data, width, height, margin: { top: 4, right: 8, left: -8, bottom: 0 } }
  const showLegend = series.length > 1

  const tooltipProps = {
    contentStyle: {
      borderRadius: 4,
      border: "1px solid var(--report-border, #D4CFC2)",
      background: "var(--report-surface, #F7F4ED)",
      fontSize: 12,
      fontFamily: "var(--report-font-mono, monospace)",
    },
    formatter: (value: number | string, name: string | number): [string, string] => [
      formatChartValue(Number(value), unit ?? detectUnitFromKey(String(name))),
      cleanSeriesName(String(name)),
    ],
  }

  const seriesEls = (kind: "bar" | "area" | "line") =>
    series.map((s, i) => {
      const color = SERIES_COLORS[i % SERIES_COLORS.length]
      if (kind === "bar") return <Bar key={s} dataKey={s} fill={color} radius={[3, 3, 0, 0]} />
      if (kind === "area")
        return (
          <Area key={s} dataKey={s} stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
        )
      return <Line key={s} type="monotone" dataKey={s} stroke={color} strokeWidth={2} dot={false} />
    })

  const axes = (
    <>
      <CartesianGrid stroke={grid} vertical={false} />
      <XAxis dataKey={x} tickLine={false} axisLine={{ stroke: grid }} tick={axis} minTickGap={24} />
      <YAxis tickLine={false} axisLine={false} tick={axis} width={44} />
      <Tooltip {...tooltipProps} />
      {showLegend ? (
        <Legend wrapperStyle={{ fontSize: 12, fontFamily: "var(--report-font-mono, monospace)" }} />
      ) : null}
    </>
  )

  return (
    <figure style={{ margin: "24px 0" }}>
      <div
        style={{
          border: "1px solid var(--report-border, #D4CFC2)",
          borderRadius: "4px",
          background: "var(--report-surface, transparent)",
          padding: "20px 16px 12px",
        }}
      >
        {title ? (
          <div
            style={{
              fontFamily: "var(--report-font-mono, monospace)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--report-text-muted, #595959)",
              margin: "0 8px 12px",
            }}
          >
            {title}
          </div>
        ) : null}
        <div ref={ref} style={{ width: "100%" }}>
          {width > 0 ? (
            type === "bar" ? (
              <BarChart {...common}>
                {axes}
                {seriesEls("bar")}
              </BarChart>
            ) : type === "area" ? (
              <AreaChart {...common}>
                {axes}
                {seriesEls("area")}
              </AreaChart>
            ) : (
              <LineChart {...common}>
                {axes}
                {seriesEls("line")}
              </LineChart>
            )
          ) : (
            <div style={{ height }} aria-hidden="true" />
          )}
        </div>
      </div>
    </figure>
  )
}
