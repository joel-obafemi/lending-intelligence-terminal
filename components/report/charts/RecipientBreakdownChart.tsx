"use client"

/**
 * Per-protocol revenue by recipient — stacked weekly bars showing
 * supply-side / protocol / holders shares of fees over time.
 */
import { useMemo } from "react"
import { SharedTimeseriesChart, fmtCompactUsd } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  timestamp: number
  supply: number
  protocol: number
  holders: number
}

interface Props {
  data: { history: Datum[]; protocol: string; freezeMarker: number | null }
  params: ChartRegistryParams
}

export function RecipientBreakdownChart({ data, params }: Props) {
  const series = useMemo(
    () => [
      { key: "supply", label: "Supply-side", color: "#10B981" },
      { key: "protocol", label: "Protocol treasury", color: "#C5511A" },
      { key: "holders", label: "Holders / buyback", color: "#B44AFF" },
    ],
    [],
  )
  return (
    <SharedTimeseriesChart
      data={data.history}
      series={series}
      type="stacked-bars"
      yFormatter={fmtCompactUsd}
      tooltipFormatter={(v) => fmtCompactUsd(v)}
      tooltipTotal
      freezeMarker={data.freezeMarker}
      height={340}
    />
  )
}
