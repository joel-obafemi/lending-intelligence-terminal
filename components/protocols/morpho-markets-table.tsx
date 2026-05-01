"use client"

/**
 * Morpho Markets Table — the isolated underlying markets, NOT the
 * MetaMorpho vault aggregators (those are in the Vaults table above).
 * Each row is a single (loan, collateral, LLTV, oracle, IRM) tuple —
 * Morpho's lending primitive.
 *
 * Sortable by supply, borrow, utilization, supply APY, borrow APY,
 * LLTV. The Markets are linked through to per-market detail pages by
 * `uniqueKey`. Caps at top 50 by default since the universe is ~545
 * and most readers care about the head, not the long tail.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { formatUSD, formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import type { MorphoMarketRow } from "@/lib/morpho-api"

interface Props {
  markets: MorphoMarketRow[]
}

type SortKey =
  | "supplyUsd"
  | "borrowUsd"
  | "utilizationPct"
  | "supplyApy"
  | "borrowApy"
  | "lltv"

const HEADERS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "supplyUsd", label: "Supply", align: "right" },
  { key: "borrowUsd", label: "Borrow", align: "right" },
  { key: "utilizationPct", label: "Util", align: "right" },
  { key: "supplyApy", label: "Supply APY", align: "right" },
  { key: "borrowApy", label: "Borrow APY", align: "right" },
  { key: "lltv", label: "LLTV", align: "right" },
]

export function MorphoMarketsTable({ markets }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("supplyUsd")
  const sorted = useMemo(
    () => [...markets].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number)),
    [markets, sortKey],
  )

  if (markets.length === 0) return null

  const totalSupply = markets.reduce((s, m) => s + m.supplyUsd, 0)
  const topSupply = sorted[0]?.supplyUsd ?? 0

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
          Markets
          <MethodologyTooltip methodologyKey="morpho-markets-table" />
        </span>
        <span className="text-[10px] text-text-muted">
          Top {sorted.length} of {markets.length} isolated markets ·{" "}
          {formatUSD(totalSupply)} total supply · click a row for details
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Market</th>
              {HEADERS.map((h) => (
                <th
                  key={h.key}
                  className={h.align === "right" ? "text-right" : ""}
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => setSortKey(h.key)}
                >
                  <span style={{ color: sortKey === h.key ? "var(--accent-orange)" : undefined }}>
                    {h.label}
                    {sortKey === h.key && " ▼"}
                  </span>
                </th>
              ))}
              <th style={{ width: "16%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr key={m.uniqueKey}>
                <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                <td>
                  <Link
                    href={`/markets/${m.uniqueKey}`}
                    style={{ textDecoration: "none", color: "var(--text-primary)" }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {m.collateralSymbol} / {m.loanSymbol}
                    </span>
                  </Link>
                </td>
                <td className="text-right tabular-nums">{formatUSD(m.supplyUsd)}</td>
                <td
                  className="text-right tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatUSD(m.borrowUsd)}
                </td>
                <td className="text-right tabular-nums">
                  {formatPercent(m.utilizationPct, 1)}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--success)" }}>
                  {formatPercent(m.supplyApy, 2)}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--danger)" }}>
                  {formatPercent(m.borrowApy, 2)}
                </td>
                <td
                  className="text-right tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {formatPercent(m.lltv * 100, 0)}
                </td>
                <td>
                  <div
                    style={{
                      width: topSupply > 0 ? `${(m.supplyUsd / topSupply) * 100}%` : "0%",
                      height: 6,
                      background: "#5B7FFF",
                      opacity: 0.55,
                      borderRadius: 2,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="px-4 py-2 text-[10px]"
        style={{
          background: "var(--panel-header)",
          color: "var(--text-muted)",
          borderTop: "1px solid var(--card-border)",
        }}
      >
        Each market is a single (loan, collateral, LLTV, oracle, IRM) tuple —
        Morpho's lending primitive. Vaults aggregate across these markets;
        the Vaults table above ranks the aggregator pools.
      </div>
    </div>
  )
}
