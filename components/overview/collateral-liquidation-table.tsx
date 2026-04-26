"use client"

import { PROTOCOLS, PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { CollateralRankRow } from "@/lib/liquidations"

interface Props {
  title: string
  rows: CollateralRankRow[]
}

export function CollateralLiquidationTable({ title, rows }: Props) {
  const top = rows[0]?.volumeUsd ?? 0

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
          {title}
        </span>
        <span className="ml-3 text-[10px] text-text-muted">
          Top collateral assets by liquidated-debt volume
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Collateral</th>
              <th className="text-right">Volume</th>
              <th className="text-right">Events</th>
              <th className="text-right">Share</th>
              <th style={{ width: "26%" }}>By Protocol</th>
              <th style={{ width: "18%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const total = Object.values(r.byProtocol).reduce((s, v) => s + v, 0) || 1
              return (
                <tr key={r.symbol}>
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.symbol}</td>
                  <td className="text-right tabular-nums">{formatUSD(r.volumeUsd)}</td>
                  <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.count.toLocaleString()}
                  </td>
                  <td className="text-right tabular-nums">{formatPercent(r.sharePct, 1)}</td>
                  <td>
                    <div style={{ display: "flex", height: "10px", borderRadius: "2px", overflow: "hidden" }}>
                      {PROTOCOLS.map((p) => {
                        const v = r.byProtocol[p.slug] ?? 0
                        if (v <= 0) return null
                        return (
                          <div
                            key={p.slug}
                            title={`${p.name}: ${formatUSD(v)}`}
                            style={{
                              flex: v / total,
                              backgroundColor: p.color,
                              opacity: 0.85,
                            }}
                          />
                        )
                      })}
                    </div>
                  </td>
                  <td>
                    <div
                      style={{
                        width: top > 0 ? `${(r.volumeUsd / top) * 100}%` : "0%",
                        height: "6px",
                        background: PROTOCOL_BY_SLUG[Object.entries(r.byProtocol).sort(([, a], [, b]) => b - a)[0]?.[0] ?? ""]
                          ?.color ?? "#6B7280",
                        opacity: 0.6,
                        borderRadius: "2px",
                      }}
                    />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>
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
