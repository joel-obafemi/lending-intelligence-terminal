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

type Mode = "supply" | "borrow" | "utilization" | "supplyApy" | "borrowApy" | "tvl"
type Diversity = "all" | "perProtocol"

const MODE_LABEL: Record<Mode, string> = {
  supply: "Supply",
  borrow: "Borrows",
  utilization: "Utilization",
  supplyApy: "Supply APY",
  borrowApy: "Borrow APY",
  tvl: "Available Liquidity",
}

/**
 * Asset / protocol pairs that earn an asterisk + footnote in the table:
 * known-good outliers that read like data errors at first glance. Keep
 * this list short — it's "facts a careful reader needs", not a glossary.
 */
const FOOTNOTE_FOR: Record<string, string> = {
  "USDS|Spark": "SPK farming pool · 0% util by design (incentive program, not a borrow market).",
  "WEETH|Aave V3": "E-Mode collateral · borrowing disabled for most users by design.",
  "RSETH|Aave V3": "E-Mode collateral · borrowing disabled for most users by design.",
  "EZETH|Aave V3": "E-Mode collateral · borrowing disabled for most users by design.",
}

function footnoteFor(m: CrossProtocolMarket): string | undefined {
  return FOOTNOTE_FOR[`${m.asset.toUpperCase()}|${m.protocolName}`]
}

function valueFor(m: CrossProtocolMarket, mode: Mode): number {
  switch (mode) {
    case "supply":
      return m.totalSupplyUsd
    case "borrow":
      return m.totalBorrowUsd
    case "utilization":
      return m.utilizationPct ?? -Infinity
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
  const [diversity, setDiversity] = useState<Diversity>("all")
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
        : mode === "utilization"
        ? sorted.filter((m) => m.utilizationPct != null)
        : sorted
    if (diversity === "perProtocol") {
      // Cap at 5 markets per protocol so a single dominant protocol doesn't
      // crowd the table. Preserves the sort order within each protocol.
      const perProto: Record<string, number> = {}
      const out: CrossProtocolMarket[] = []
      for (const m of filtered) {
        const slug = m.protocolSlug
        if ((perProto[slug] ?? 0) >= 5) continue
        perProto[slug] = (perProto[slug] ?? 0) + 1
        out.push(m)
        if (out.length >= topN) break
      }
      return out
    }
    return filtered.slice(0, topN)
  }, [markets, mode, topN, diversity])

  const top = rows[0] ? valueFor(rows[0], mode) : 0
  const isApyMode = mode === "supplyApy" || mode === "borrowApy"
  const isUtilMode = mode === "utilization"
  const visibleFootnotes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of rows) {
      const note = footnoteFor(m)
      if (note) seen.set(`${m.asset.toUpperCase()}|${m.protocolName}`, note)
    }
    return [...seen.entries()].map(([k, note]) => ({ key: k, note }))
  }, [rows])

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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              View
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
              <button
                onClick={() => setDiversity("all")}
                style={pillStyle(diversity === "all")}
              >
                Top 10 sector
              </button>
              <button
                onClick={() => setDiversity("perProtocol")}
                style={pillStyle(diversity === "perProtocol")}
              >
                Max 5 / protocol
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              Sort by
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
                  style={pillStyle(mode === m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
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
              <th className="text-right">Available Liquidity</th>
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
                    {footnoteFor(m) && (
                      <span
                        className="ml-1 text-[10px]"
                        style={{ color: "var(--accent-yellow)" }}
                        title={footnoteFor(m)}
                      >
                        *
                      </span>
                    )}
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
                  <td
                    className="text-right tabular-nums"
                    style={{
                      color: mode === "utilization" ? "var(--text-primary)" : undefined,
                      fontWeight: mode === "utilization" ? 600 : 400,
                    }}
                  >
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
                        isApyMode || isUtilMode
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
      {visibleFootnotes.length > 0 && (
        <div
          className="px-4 py-2 text-[10px] space-y-0.5"
          style={{
            background: "var(--panel-header)",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          {visibleFootnotes.map(({ key, note }) => (
            <div key={key}>
              <span style={{ color: "var(--accent-yellow)", marginRight: 4 }}>*</span>
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    fontFamily: "inherit",
    backgroundColor: active ? "var(--card-border)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  }
}
