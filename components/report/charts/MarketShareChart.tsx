"use client"

/**
 * Market share by borrows / supply / available — stacked area %.
 * Source: loadOverview() marketShareSeries (per-protocol % over time, sums to 100).
 */
import { useMemo } from "react"
import { SharedTimeseriesChart, fmtPctTick } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"
import { PROTOCOLS } from "@/lib/protocols"

interface Datum {
  timestamp: number
  [protocolSlug: string]: number
}

interface Props {
  data: { history: Datum[]; freezeMarker: number | null }
  params: ChartRegistryParams
}

const PROTOCOL_COLORS: Record<string, string> = {
  "aave-v3": "#1F3A5F",
  spark: "#C5511A",
  "morpho-blue": "#5B7FFF",
  fluid: "#10B981",
}

export function MarketShareChart({ data, params }: Props) {
  const series = useMemo(
    () =>
      PROTOCOLS.map((p) => ({
        key: p.slug,
        label: p.name,
        color: PROTOCOL_COLORS[p.slug],
      })),
    [],
  )
  return (
    <SharedTimeseriesChart
      data={data.history}
      series={series}
      type="stacked-area"
      yFormatter={fmtPctTick}
      tooltipFormatter={(v) => `${v.toFixed(1)}%`}
      yDomain={[0, 100]}
      freezeMarker={data.freezeMarker}
      tooltipTotal={false}
      height={400}
    />
  )
}
