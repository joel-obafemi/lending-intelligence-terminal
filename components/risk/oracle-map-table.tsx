"use client"

/**
 * Oracle Map table — Risk page reference card.
 *
 * One row per (protocol, asset) pair. Surfaces who prices what across the
 * four protocols so a reader can spot single-vendor risk at a glance. The
 * data is the curated config in `lib/oracles.ts` — when a market gets
 * relisted with a different oracle, edit that file and redeploy.
 *
 * Keeps the rendering simple: a sticky table with a Filter-by-vendor
 * pill row and a small concentration legend at the top.
 */

import { useMemo, useState } from "react"
import { ORACLE_COLOR, type OracleVendor } from "@/lib/oracles"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import type { OracleMapRow, OracleConcentration } from "@/lib/risk"
import { formatPercent, formatUSD } from "@/lib/utils"

interface Props {
  title: string
  rows: OracleMapRow[]
  concentration: OracleConcentration
  methodologyKey?: string
}

export function OracleMapTable({ title, rows, concentration, methodologyKey }: Props) {
  const allVendors = useMemo(() => {
    const set = new Set<OracleVendor>()
    for (const r of rows) set.add(r.vendor)
    return [...set].sort()
  }, [rows])
  const [filter, setFilter] = useState<OracleVendor | "all">("all")
  const filtered = filter === "all" ? rows : rows.filter((r) => r.vendor === filter)

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Filter
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
              onClick={() => setFilter("all")}
              style={pillStyle(filter === "all")}
            >
              All
            </button>
            {allVendors.map((v) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                style={{
                  ...pillStyle(filter === v),
                  color: filter === v ? ORACLE_COLOR[v] : "var(--text-muted)",
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Concentration legend */}
      <div
        className="flex flex-wrap gap-3 text-[11px] px-4 py-2"
        style={{ background: "var(--panel-header)", borderBottom: "1px solid var(--card-border)" }}
      >
        {concentration.byVendor.slice(0, 6).map((v) => (
          <div key={v.vendor} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: ORACLE_COLOR[v.vendor] }}
            />
            <span style={{ color: "var(--text-secondary)" }}>{v.vendor}</span>
            <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
              {formatPercent(v.sharePct, 1)}
            </span>
          </div>
        ))}
        {concentration.unclassifiedPct > 0.5 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              {formatPercent(concentration.unclassifiedPct, 1)} of collateral not yet classified
            </span>
          </div>
        )}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Asset</th>
              <th>Oracle</th>
              <th className="text-right">Asset USD (sector)</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.protocolSlug}-${r.asset}-${i}`}>
                <td>
                  <span className="inline-flex items-center gap-1.5" style={{ color: r.protocolColor }}>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: r.protocolColor }}
                    />
                    {r.protocolName}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{r.asset}</td>
                <td>
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{
                      color: ORACLE_COLOR[r.vendor],
                      fontWeight: 500,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: ORACLE_COLOR[r.vendor] }}
                    />
                    {r.vendor}
                  </span>
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.usd != null ? formatUSD(r.usd) : "—"}
                </td>
                <td style={{ color: "var(--text-muted)", fontSize: "11px", whiteSpace: "normal" }}>
                  {r.notes ?? ""}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No rows match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        className="px-4 py-2 text-[10px]"
        style={{ background: "var(--panel-header)", color: "var(--text-muted)", borderTop: "1px solid var(--card-border)" }}
      >
        Curated map · edit <code style={{ fontFamily: "JetBrains Mono, monospace" }}>lib/oracles.ts</code> when a
        market relists with a different oracle.
      </div>
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
