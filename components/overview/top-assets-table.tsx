"use client"

import { formatUSD, formatPercent } from "@/lib/utils"
import { ASSET_TYPE_LABEL, ASSET_TYPE_COLOR } from "@/lib/assets"
import type { RankedAssetRow } from "@/lib/overview"

interface Props {
  title: string
  rows: RankedAssetRow[]
  /** Column label for the USD column — e.g. "Supplied" or "Borrowed" */
  valueLabel?: string
}

export function TopAssetsTable({ title, rows, valueLabel = "USD" }: Props) {
  const top = rows[0]?.usd ?? 0

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
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Asset</th>
              <th>Type</th>
              <th className="text-right">{valueLabel}</th>
              <th className="text-right">Share</th>
              <th style={{ width: "30%", minWidth: "160px" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.symbol}>
                <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                <td>{r.symbol}</td>
                <td>
                  <span
                    className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.05em]"
                    style={{
                      backgroundColor: `${ASSET_TYPE_COLOR[r.type]}22`,
                      color: ASSET_TYPE_COLOR[r.type],
                      border: `1px solid ${ASSET_TYPE_COLOR[r.type]}44`,
                    }}
                  >
                    {ASSET_TYPE_LABEL[r.type]}
                  </span>
                </td>
                <td className="text-right tabular-nums">{formatUSD(r.usd)}</td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatPercent(r.sharePct, 1)}
                </td>
                <td>
                  <div
                    style={{
                      width: top > 0 ? `${(r.usd / top) * 100}%` : "0%",
                      height: "6px",
                      background: ASSET_TYPE_COLOR[r.type],
                      opacity: 0.6,
                      borderRadius: "2px",
                    }}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)" }}>
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
