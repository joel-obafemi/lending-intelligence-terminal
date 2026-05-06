"use client"

/**
 * Net supply flows by protocol — stacked bars per period (positive in,
 * negative out). Uses the report palette + the shared chart renderer.
 */
import { useMemo } from "react"
import {
  SharedTimeseriesChart,
  fmtCompactUsd,
} from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"
import { PROTOCOLS } from "@/lib/protocols"

interface Datum {
  timestamp: number
  [protocolSlug: string]: number
}

interface Props {
  data: {
    history: Datum[]
    freezeMarker: number | null
  }
  params: ChartRegistryParams
}

const PROTOCOL_COLORS: Record<string, string> = {
  "aave-v3": "#1F3A5F",
  spark: "#C5511A",
  "morpho-blue": "#5B7FFF",
  fluid: "#10B981",
}

export function NetSupplyFlowsChart({ data, params }: Props) {
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
      type="stacked-bars"
      yFormatter={fmtCompactUsd}
      tooltipFormatter={(v) => fmtCompactUsd(v)}
      showZeroLine
      freezeMarker={data.freezeMarker}
      tooltipTotal
      height={340}
    />
  )
}
