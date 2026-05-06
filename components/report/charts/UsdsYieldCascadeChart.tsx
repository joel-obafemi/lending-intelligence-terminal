"use client"

/**
 * Sky → Spark → T-bill yield cascade. Three lines across 90 days:
 * Sky Savings Rate, Spark USDS Borrow APY, 4-week T-bill.
 */
import { useMemo } from "react"
import { SharedTimeseriesChart } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  timestamp: number
  ssr: number | null
  sparkUsdsBorrow: number | null
  tBill: number | null
}

interface Props {
  data: { history: Datum[]; freezeMarker: number | null }
  params: ChartRegistryParams
}

export function UsdsYieldCascadeChart({ data, params }: Props) {
  const series = useMemo(
    () => [
      { key: "ssr", label: "Sky Savings Rate", color: "#1F3A5F" },
      { key: "sparkUsdsBorrow", label: "Spark USDS Borrow APY", color: "#C5511A" },
      { key: "tBill", label: "4-week T-bill", color: "#6B7280" },
    ],
    [],
  )
  return (
    <SharedTimeseriesChart
      data={data.history}
      series={series}
      type="lines"
      yFormatter={(v) => `${v.toFixed(1)}%`}
      tooltipFormatter={(v) => `${v.toFixed(2)}%`}
      freezeMarker={data.freezeMarker}
      height={340}
    />
  )
}
