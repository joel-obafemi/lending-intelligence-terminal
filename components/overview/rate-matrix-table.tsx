"use client"

import { PROTOCOLS, PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { MAJOR_ASSETS } from "@/lib/rates"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { RateMatrixCell } from "@/lib/rates"

interface Props {
  title: string
  cells: RateMatrixCell[]
}

function fmtPct(v: number | null) {
  return v == null || !Number.isFinite(v) ? (
    <span style={{ color: "var(--text-muted)" }}>—</span>
  ) : (
    <span className="tabular-nums">{formatPercent(v, 2)}</span>
  )
}

function fmtSpread(v: number | null) {
  if (v == null || !Number.isFinite(v)) return <span style={{ color: "var(--text-muted)" }}>—</span>
  const color = v >= 0 ? "var(--text-secondary)" : "var(--danger)"
  return (
    <span className="tabular-nums" style={{ color }}>
      {v >= 0 ? "+" : "\u2212"}
      {Math.abs(v).toFixed(2)}%
    </span>
  )
}

export function RateMatrixTable({ title, cells }: Props) {
  // Group cells by symbol so each row is one asset across protocols.
  const bySymbol = new Map<string, Map<string, RateMatrixCell>>()
  for (const c of cells) {
    const row = bySymbol.get(c.symbol) ?? new Map()
    row.set(c.protocolSlug, c)
    bySymbol.set(c.symbol, row)
  }

  const orderedAssets = MAJOR_ASSETS.filter((a) => bySymbol.has(a))

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
          Supply / Borrow APY · current with 30d-avg · DefiLlama Yields
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              {PROTOCOLS.map((p) => (
                <th key={p.slug} className="text-right">
                  <span style={{ color: p.color }}>{p.name}</span>
                </th>
              ))}
              <th className="text-right">Best Supply</th>
              <th className="text-right">Best Borrow</th>
            </tr>
          </thead>
          <tbody>
            {orderedAssets.map((sym) => {
              const row = bySymbol.get(sym)!
              const supplies = PROTOCOLS.map((p) => ({ slug: p.slug, v: row.get(p.slug)?.supplyApy ?? null })).filter(
                (x) => x.v != null,
              ) as Array<{ slug: string; v: number }>
              const borrows = PROTOCOLS.map((p) => ({ slug: p.slug, v: row.get(p.slug)?.borrowApy ?? null })).filter(
                (x) => x.v != null,
              ) as Array<{ slug: string; v: number }>
              const bestSupply = supplies.sort((a, b) => b.v - a.v)[0]
              const bestBorrow = borrows.sort((a, b) => a.v - b.v)[0]

              return (
                <tr key={sym}>
                  <td style={{ fontWeight: 600 }}>{sym}</td>
                  {PROTOCOLS.map((p) => {
                    const cell = row.get(p.slug)
                    return (
                      <td key={p.slug} className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span title="Supply APY (current / 30d avg)" className="flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: "var(--success)" }}
                            />
                            {fmtPct(cell?.supplyApy ?? null)}
                          </span>
                          <span className="text-text-muted">/</span>
                          <span title="Borrow APY (current / 30d avg)" className="flex items-center gap-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: "var(--danger)" }}
                            />
                            {fmtPct(cell?.borrowApy ?? null)}
                          </span>
                        </div>
                        <div className="text-[9px] text-text-muted tabular-nums">
                          {cell?.supplyApy30d != null || cell?.borrowApy30d != null ? (
                            <span title="Trailing 30-day average">
                              30d:{" "}
                              {cell.supplyApy30d != null ? formatPercent(cell.supplyApy30d, 2) : "—"}
                              {" / "}
                              {cell.borrowApy30d != null ? formatPercent(cell.borrowApy30d, 2) : "—"}
                            </span>
                          ) : null}
                          {cell?.spread != null && (
                            <span className="ml-2" title="Borrow APY minus Supply APY">
                              Spr {cell.spread >= 0 ? "+" : ""}
                              {cell.spread.toFixed(2)}%
                            </span>
                          )}
                        </div>
                        {cell?.utilization != null && (
                          <div className="text-[9px] text-text-muted tabular-nums">
                            {cell.utilization.toFixed(0)}% util
                            {cell.totalSupplyUsd
                              ? ` · ${formatUSD(cell.totalSupplyUsd)}`
                              : ""}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="text-right">
                    {bestSupply ? (
                      <span style={{ color: PROTOCOL_BY_SLUG[bestSupply.slug]?.color }} className="tabular-nums">
                        {formatPercent(bestSupply.v, 2)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {bestBorrow ? (
                      <span style={{ color: PROTOCOL_BY_SLUG[bestBorrow.slug]?.color }} className="tabular-nums">
                        {formatPercent(bestBorrow.v, 2)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {orderedAssets.length === 0 && (
              <tr>
                <td colSpan={PROTOCOLS.length + 3} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No rate data returned from DefiLlama Yields.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
