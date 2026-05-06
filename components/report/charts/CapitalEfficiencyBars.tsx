"use client"

/**
 * Borrowing power per $1 of collateral — horizontal bars per protocol.
 */
import { useMemo } from "react"
import { MUTED, SERIES_COLORS } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Row {
  protocolSlug: string
  protocolName: string
  ltvPct: number | null
  /** Whether the asset is unsupported as collateral on this protocol. */
  unsupported?: boolean
}

interface Props {
  data: { rows: Row[]; asset: string }
  params: ChartRegistryParams
}

const PROTOCOL_COLORS: Record<string, string> = {
  "aave-v3": "#1F3A5F",
  spark: "#C5511A",
  "morpho-blue": "#5B7FFF",
  fluid: "#10B981",
}

export function CapitalEfficiencyBars({ data, params }: Props) {
  const max = useMemo(() => {
    const ltvs = data.rows
      .filter((r) => r.ltvPct != null && !r.unsupported)
      .map((r) => r.ltvPct as number)
    return ltvs.length ? Math.max(...ltvs, 100) : 100
  }, [data.rows])

  return (
    <div>
      <div
        style={{
          fontFamily: "var(--report-font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: MUTED,
          marginBottom: 12,
        }}
      >
        Asset · {data.asset}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
        {data.rows.map((r) => {
          const color = PROTOCOL_COLORS[r.protocolSlug] ?? SERIES_COLORS[0]
          const ltv = r.ltvPct
          const widthPct = ltv != null ? Math.min(100, (ltv / max) * 100) : 0
          return (
            <li key={r.protocolSlug} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "var(--report-font-serif)", fontSize: 14 }}>{r.protocolName}</span>
              <div
                style={{
                  height: 18,
                  background: "rgba(31, 58, 95, 0.06)",
                  borderRadius: 2,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {ltv != null && !r.unsupported && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${widthPct}%`,
                      background: color,
                      opacity: 0.85,
                    }}
                  />
                )}
                {r.unsupported && (
                  <span
                    style={{
                      position: "absolute",
                      left: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontFamily: "var(--report-font-mono)",
                      fontSize: 10,
                      color: MUTED,
                      letterSpacing: "0.06em",
                    }}
                  >
                    Not supported as standalone collateral
                  </span>
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                  textAlign: "right",
                }}
              >
                {ltv != null ? `${ltv.toFixed(0)}%` : "—"}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
