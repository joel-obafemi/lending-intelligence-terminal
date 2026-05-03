"use client"

import { formatUSD, formatPercent } from "@/lib/utils"
import { ASSET_TYPE_LABEL, ASSET_TYPE_COLOR } from "@/lib/assets"
import { PROTOCOLS } from "@/lib/protocols"
import type { RankedAssetRow } from "@/lib/overview"

interface Props {
  title: string
  rows: RankedAssetRow[]
  /** Column label for the USD column — e.g. "Supplied" or "Borrowed" */
  valueLabel?: string
}

/** Per-row tooltips for assets that read confusingly without context.
 *  AAVE-as-collateral is the canonical case: the protocol's own
 *  governance token is acceptable collateral on Aave V3, which
 *  introduces price-correlation risk during stress events. */
const ROW_TOOLTIPS: Record<string, string> = {
  AAVE:
    "Price-correlation risk: AAVE is acceptable collateral on Aave V3 mainnet. A protocol-stress event would drag the token price and the collateral value at the same time, amplifying liquidation cascades during exactly the moments the system is least equipped to absorb them.",
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
              <th style={{ width: "20%" }}>By Protocol</th>
              <th style={{ width: "18%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const tip = ROW_TOOLTIPS[r.symbol.toUpperCase()]
              const protocolTotal =
                Object.values(r.byProtocol).reduce((s, v) => s + v, 0) || 1
              return (
                <tr key={r.symbol}>
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td>
                    <span
                      className="inline-flex items-center gap-1.5"
                      title={tip}
                      style={{
                        cursor: tip ? "help" : undefined,
                        textDecoration: tip ? "underline dotted var(--text-muted)" : undefined,
                        textUnderlineOffset: 2,
                      }}
                    >
                      {r.symbol}
                      {tip && (
                        <span
                          className="text-[9px] uppercase tracking-[0.05em] px-1 py-0.5 rounded"
                          style={{
                            background: "rgba(217, 119, 6, 0.12)",
                            color: "var(--accent-yellow)",
                            border: "1px solid rgba(217, 119, 6, 0.30)",
                          }}
                        >
                          ⚠
                        </span>
                      )}
                    </span>
                  </td>
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
                    {/* Protocol-stacked breakdown bar. Same visual pattern
                        as Liquidation Concentration on Risk. */}
                    {Object.keys(r.byProtocol).length === 0 ? (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        —
                      </span>
                    ) : (
                      <div style={{ display: "flex", height: "10px", borderRadius: "2px", overflow: "hidden" }}>
                        {PROTOCOLS.map((p) => {
                          const v = r.byProtocol[p.slug] ?? 0
                          if (v <= 0) return null
                          return (
                            <div
                              key={p.slug}
                              title={`${p.name}: ${formatUSD(v)} · ${(
                                (v / protocolTotal) * 100
                              ).toFixed(0)}%`}
                              style={{
                                flex: v / protocolTotal,
                                backgroundColor: p.color,
                                opacity: 0.85,
                              }}
                            />
                          )
                        })}
                      </div>
                    )}
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
