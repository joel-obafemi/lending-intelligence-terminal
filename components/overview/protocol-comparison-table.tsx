"use client"

import { useState } from "react"
import Link from "next/link"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { OverviewProtocolRow } from "@/lib/overview"

type SortKey = "tvl" | "borrowed" | "utilizationPct" | "fees24h" | "fees7d" | "tvlShare"

interface Props {
  rows: OverviewProtocolRow[]
}

export function ProtocolComparisonTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("tvl")
  const [asc, setAsc] = useState(false)

  const sorted = [...rows].sort((a, b) => {
    const diff = (a[sortKey] as number) - (b[sortKey] as number)
    return asc ? diff : -diff
  })

  function header(key: SortKey, label: string, align: "left" | "right" = "right") {
    const active = sortKey === key
    return (
      <th
        className={align === "right" ? "text-right" : "text-left"}
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => {
          if (active) setAsc(!asc)
          else {
            setSortKey(key)
            setAsc(false)
          }
        }}
      >
        <span style={{ color: active ? "var(--accent-orange)" : undefined }}>
          {label}
          {active ? (asc ? " \u25B2" : " \u25BC") : ""}
        </span>
      </th>
    )
  }

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border"
        style={{ display: "flex", alignItems: "center", padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          Protocol Comparison
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Protocol</th>
              {header("tvl", "TVL")}
              {header("tvlShare", "Share")}
              {header("borrowed", "Borrowed")}
              {header("utilizationPct", "Utilization")}
              {header("fees24h", "Fees (24h)")}
              {header("fees7d", "Fees (7d)")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.slug}>
                <td>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    <Link
                      href={`/protocols?p=${r.slug}`}
                      style={{ color: "var(--text-primary)", textDecoration: "none" }}
                    >
                      {r.name}
                    </Link>
                  </div>
                </td>
                <td className="text-right tabular-nums">{formatUSD(r.tvl)}</td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatPercent(r.tvlShare, 1)}
                </td>
                <td className="text-right tabular-nums">{formatUSD(r.borrowed)}</td>
                <td className="text-right tabular-nums">{formatPercent(r.utilizationPct, 1)}</td>
                <td className="text-right tabular-nums">{formatUSD(r.fees24h)}</td>
                <td className="text-right tabular-nums">{formatUSD(r.fees7d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
