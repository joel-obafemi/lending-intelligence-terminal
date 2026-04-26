"use client"

import { useMemo, useState } from "react"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { CrossProtocolMarket } from "@/lib/cross-protocol-markets"

interface Props {
  title: string
  /** Universe of markets pulled from the server (sorted by total supply). */
  markets: CrossProtocolMarket[]
  /** How many rows to show after sorting by selected mode. Default 10. */
  topN?: number
}

type Mode = "supply" | "borrow" | "tvl" | "supplyApy" | "borrowApy"

const MODE_LABEL: Record<Mode, string> = {
  supply: "By Supply",
  borrow: "By Borrow",
  tvl: "By TVL",
  supplyApy: "By Supply APY",
  borrowApy: "By Borrow APY",
}

function valueFor(m: CrossProtocolMarket, mode: Mode): number {
  switch (mode) {
    case "supply":
      return m.totalSupplyUsd
    case "borrow":
      return m.totalBorrowUsd
    case "tvl":
      return m.tvlUsd
    case "supplyApy":
      return m.supplyApy ?? -Infinity
    case "borrowApy":
      return m.borrowApy ?? -Infinity
  }
}

export function TopMarketsCrossProtocolTable({ title, markets, topN = 10 }: Props) {
  const [mode, setMode] = useState<Mode>("supply")
  // Sort the universe by selected mode; APY modes naturally exclude null rows
  // by ranking them at the bottom.
  const rows = useMemo(() => {
    const sorted = [...markets].sort((a, b) => valueFor(b, mode) - valueFor(a, mode))
    // For APY modes, exclude rows with null APY entirely.
    const filtered =
      mode === "supplyApy"
        ? sorted.filter((m) => m.supplyApy != null)
        : mode === "borrowApy"
        ? sorted.filter((m) => m.borrowApy != null)
        : sorted
    return filtered.slice(0, topN)
  }, [markets, mode, topN])

  const top = rows[0] ? valueFor(rows[0], mode) : 0
  const isApyMode = mode === "supplyApy" || mode === "borrowApy"

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
        </span>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--card-border)",
            borderRadius: "4px",
            overflow: "hidden",
            background: "var(--background)",
          }}
        >
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 500,
                cursor: "pointer",
                border: "none",
                fontFamily: "inherit",
                backgroundColor: mode === m ? "var(--card-border)" : "transparent",
                color: mode === m ? "var(--text-primary)" : "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Asset</th>
              <th>Protocol</th>
              <th className="text-right">Total Supply</th>
              <th className="text-right">TVL</th>
              <th className="text-right">Borrowed</th>
              <th className="text-right">Util</th>
              <th className="text-right">Supply APY</th>
              <th className="text-right">Borrow APY</th>
              <th style={{ width: "16%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const v = valueFor(m, mode)
              const barWidth = top > 0 ? `${(v / top) * 100}%` : "0%"
              return (
                <tr key={m.poolId}>
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    {m.asset}
                    {m.poolMeta && (
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {m.poolMeta}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5" style={{ color: m.protocolColor }}>
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: m.protocolColor }}
                      />
                      {m.protocolName}
                    </span>
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: mode === "supply" ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {formatUSD(m.totalSupplyUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: mode === "tvl" ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {formatUSD(m.tvlUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: mode === "borrow" ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {formatUSD(m.totalBorrowUsd)}
                  </td>
                  <td className="text-right tabular-nums">
                    {m.utilizationPct != null ? formatPercent(m.utilizationPct, 1) : "—"}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{
                      color:
                        mode === "supplyApy" ? "var(--text-primary)" : "var(--success)",
                      fontWeight: mode === "supplyApy" ? 600 : 400,
                    }}
                  >
                    {m.supplyApy != null ? formatPercent(m.supplyApy, 2) : "—"}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{
                      color:
                        mode === "borrowApy" ? "var(--text-primary)" : "var(--danger)",
                      fontWeight: mode === "borrowApy" ? 600 : 400,
                    }}
                  >
                    {m.borrowApy != null ? formatPercent(m.borrowApy, 2) : "—"}
                  </td>
                  <td>
                    <div
                      style={{
                        width: barWidth,
                        height: "6px",
                        background: m.protocolColor,
                        opacity: 0.6,
                        borderRadius: "2px",
                      }}
                      title={
                        isApyMode
                          ? formatPercent(v as number, 2)
                          : formatUSD(v as number)
                      }
                    />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
