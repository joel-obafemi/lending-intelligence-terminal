"use client"

/**
 * Cross-protocol APY dispersion (max − min, in basis points) for a
 * single asset over time. Single-line area with zero floor.
 */
import { SharedTimeseriesChart } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  timestamp: number
  bps: number
}

interface Props {
  data: { history: Datum[]; asset: string; freezeMarker: number | null }
  params: ChartRegistryParams
}

export function DispersionChart({ data, params }: Props) {
  return (
    <SharedTimeseriesChart
      data={data.history}
      series={[{ key: "bps", label: `${data.asset} dispersion`, color: "#C5511A" }]}
      type="stacked-area"
      yFormatter={(v) => `${v.toFixed(0)} bps`}
      tooltipFormatter={(v) => `${v.toFixed(0)} bps`}
      hideLegend
      freezeMarker={data.freezeMarker}
      height={300}
    />
  )
}
