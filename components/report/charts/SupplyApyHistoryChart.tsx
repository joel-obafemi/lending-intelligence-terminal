"use client"

/**
 * USDC / WETH supply APY across the four protocols, daily.
 * Used in the rsETH Reckoning theme essay to show the April rate spike.
 */
import { useMemo } from "react"
import { SharedTimeseriesChart } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"
import { PROTOCOLS } from "@/lib/protocols"

interface Datum {
  timestamp: number
  [protocolSlug: string]: number | null
}

interface Props {
  data: { history: Datum[]; asset: string; freezeMarker: number | null }
  params: ChartRegistryParams
}

const PROTOCOL_COLORS: Record<string, string> = {
  "aave-v3": "#1F3A5F",
  spark: "#C5511A",
  "morpho-blue": "#5B7FFF",
  fluid: "#10B981",
}

export function SupplyApyHistoryChart({ data, params }: Props) {
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
      type="lines"
      yFormatter={(v) => `${v.toFixed(1)}%`}
      tooltipFormatter={(v) => `${v.toFixed(2)}%`}
      freezeMarker={data.freezeMarker}
      height={380}
    />
  )
}
