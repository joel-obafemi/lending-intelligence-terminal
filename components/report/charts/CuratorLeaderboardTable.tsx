"use client"

/**
 * Top-N Morpho curators by TVL — table form. Used in the Curator
 * Concentration theme essay.
 */
import { useMemo } from "react"
import { fmtCompactUsd, MUTED } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Row {
  name: string
  totalAssetsUsd: number
  vaultCount: number
  weightedNetApyPct: number | null
  uniqueAssets: number
}

interface Props {
  data: { rows: Row[]; topN: number }
  params: ChartRegistryParams
}

export function CuratorLeaderboardTable({ data, params }: Props) {
  const rows = useMemo(
    () =>
      data.rows
        .filter((r) => r.name.toLowerCase() !== "uncurated")
        .slice(0, data.topN ?? 15),
    [data.rows, data.topN],
  )

  const total = rows.reduce((s, r) => s + r.totalAssetsUsd, 0)

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderTop: "2px solid #C5511A",
          borderBottom: "2px solid #C5511A",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            {[
              { l: "#", a: "left" },
              { l: "Curator", a: "left" },
              { l: "TVL", a: "right" },
              { l: "Share", a: "right" },
              { l: "Vaults", a: "right" },
              { l: "Assets", a: "right" },
              { l: "Net APY", a: "right" },
            ].map((c) => (
              <th
                key={c.l}
                style={{
                  textAlign: c.a as "left" | "right",
                  padding: "10px 12px",
                  fontFamily: "var(--report-font-sans)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: MUTED,
                  fontWeight: 600,
                  borderBottom: "1px solid #D4CFC2",
                }}
              >
                {c.l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name} style={{ background: i % 2 === 1 ? "rgba(31, 58, 95, 0.025)" : undefined }}>
              <td
                style={{
                  padding: "10px 12px",
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: MUTED,
                  fontSize: 12,
                }}
              >
                {i + 1}
              </td>
              <td style={{ padding: "10px 12px", fontFamily: "var(--report-font-serif)", fontSize: 14 }}>
                {r.name}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                }}
              >
                {fmtCompactUsd(r.totalAssetsUsd)}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                  color: MUTED,
                }}
              >
                {total > 0 ? `${((r.totalAssetsUsd / total) * 100).toFixed(1)}%` : "—"}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                }}
              >
                {r.vaultCount}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                }}
              >
                {r.uniqueAssets}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  fontFamily: "var(--report-font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                  color: r.weightedNetApyPct != null ? "#0E1B2C" : MUTED,
                }}
              >
                {r.weightedNetApyPct != null ? `${r.weightedNetApyPct.toFixed(2)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
