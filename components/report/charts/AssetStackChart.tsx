"use client"

/**
 * Per-protocol Total Supply by asset — stacked area, top 7 + Other.
 * Source: loadProtocolDetail(slug).supplyByAssetSeries.
 */
import { useMemo } from "react"
import {
  SharedTimeseriesChart,
  fmtCompactUsd,
  SERIES_COLORS,
} from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Datum {
  timestamp: number
  [assetSymbol: string]: number
}

interface Props {
  data: {
    history: Datum[]
    topAssets: string[]
    freezeMarker: number | null
  }
  params: ChartRegistryParams
}

export function AssetStackChartReport({ data, params }: Props) {
  const series = useMemo(() => {
    const keys = [...data.topAssets]
    // Add "Other" bucket if any data point has it.
    if (data.history.some((p) => (p["Other"] as number) > 0)) {
      keys.push("Other")
    }
    return keys.map((k, i) => ({
      key: k,
      label: k,
      color: k === "Other" ? "#6B7280" : SERIES_COLORS[i % SERIES_COLORS.length],
    }))
  }, [data.topAssets, data.history])

  return (
    <SharedTimeseriesChart
      data={data.history}
      series={series}
      type="stacked-area"
      yFormatter={fmtCompactUsd}
      tooltipFormatter={(v) => fmtCompactUsd(v)}
      tooltipTotal
      freezeMarker={data.freezeMarker}
      height={380}
    />
  )
}
