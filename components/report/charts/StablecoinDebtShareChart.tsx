"use client"

/**
 * Stablecoin debt share — % of cross-protocol borrows held in stablecoins.
 * Single-line area with a 50% reference line.
 */
import { SharedTimeseriesChart, fmtPctTick } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  timestamp: number
  pct: number
}

interface Props {
  data: { history: Datum[]; freezeMarker: number | null }
  params: ChartRegistryParams
}

export function StablecoinDebtShareChart({ data, params }: Props) {
  return (
    <SharedTimeseriesChart
      data={data.history}
      series={[{ key: "pct", label: "Stablecoin debt share", color: "#C5511A" }]}
      type="stacked-area"
      yFormatter={fmtPctTick}
      tooltipFormatter={(v) => `${v.toFixed(1)}%`}
      hideLegend
      yDomain={[0, 100]}
      freezeMarker={data.freezeMarker}
      height={300}
    />
  )
}
