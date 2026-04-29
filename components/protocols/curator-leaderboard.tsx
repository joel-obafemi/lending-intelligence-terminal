"use client"

/**
 * CuratorLeaderboard — TVL-per-curator ranking for Morpho.
 *
 * Sourced from `loadMorphoCuratorLeaderboard()` (paginated `vaults` query
 * against blue-api.morpho.org), grouped by curator name. Renders a sortable
 * table with TVL, net APY weighted by vault TVL, vault count, and the top
 * vault under each curator.
 */

import { useRef, useState } from "react"
import { formatPercent, formatUSD } from "@/lib/utils"
import { ChartActions } from "../chart-actions"
import type { CuratorLeaderboardRow } from "@/lib/morpho-api"

interface Props {
  rows: CuratorLeaderboardRow[]
  /** How many rows to render initially. Rest are revealed by "Show all". */
  initial?: number
}

type SortKey = "totalAssetsUsd" | "weightedNetApyPct" | "vaultCount" | "uniqueAssets"

const TITLE = "Morpho Curator Leaderboard"

export function CuratorLeaderboard({ rows, initial = 15 }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [sortKey, setSortKey] = useState<SortKey>("totalAssetsUsd")
  const [showAll, setShowAll] = useState(false)

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity
    const bv = b[sortKey] ?? -Infinity
    return bv - av
  })
  const displayed = showAll ? sorted : sorted.slice(0, initial)
  const totalCuratedTvl = rows
    .filter((r) => r.name.toLowerCase() !== "uncurated")
    .reduce((s, r) => s + r.totalAssetsUsd, 0)
  const grandTotal = rows.reduce((s, r) => s + r.totalAssetsUsd, 0)

  function HeaderCell({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <th
        className="text-right cursor-pointer select-none"
        onClick={() => setSortKey(k)}
        style={{ color: active ? "var(--accent-orange)" : undefined }}
      >
        {label}
        {active && <span className="ml-1">↓</span>}
      </th>
    )
  }

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-accent"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {TITLE}
          </span>
          <span className="text-[9px] text-text-muted" style={{ letterSpacing: "0.05em" }}>
            · {rows.length} curators · {formatUSD(grandTotal)} aggregate · {formatUSD(totalCuratedTvl)} curated
          </span>
        </div>
        <ChartActions cardRef={cardRef} title={TITLE} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Curator</th>
              <HeaderCell k="totalAssetsUsd" label="TVL" />
              <HeaderCell k="vaultCount" label="Vaults" />
              <HeaderCell k="uniqueAssets" label="Assets" />
              <HeaderCell k="weightedNetApyPct" label="Wgtd Net APY" />
              <th>Top Vault</th>
              <th className="text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, i) => {
              const sharePct =
                grandTotal > 0 ? (row.totalAssetsUsd / grandTotal) * 100 : 0
              return (
                <tr key={row.name + ":" + i}>
                  <td className="text-text-muted tabular-nums">{i + 1}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      {row.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.imageUrl}
                          alt=""
                          width={14}
                          height={14}
                          className="rounded-full"
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: "var(--card-border)" }}
                        />
                      )}
                      <span style={{ fontWeight: 600 }}>{row.name}</span>
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(row.totalAssetsUsd)}</td>
                  <td className="text-right tabular-nums">{row.vaultCount}</td>
                  <td className="text-right tabular-nums">{row.uniqueAssets}</td>
                  <td className="text-right tabular-nums">
                    {row.weightedNetApyPct != null ? (
                      formatPercent(row.weightedNetApyPct, 2)
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {row.topVault ? (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-secondary)" }}
                        title={`${row.topVault.name} · ${formatUSD(row.topVault.totalAssetsUsd)}`}
                      >
                        {row.topVault.symbol}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="text-right text-[10px] tabular-nums">
                    {sharePct.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No curator data returned from Morpho.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > initial && (
        <div
          className="border-t border-card-border text-[10px]"
          style={{ padding: "8px 16px", textAlign: "center" }}
        >
          <button
            onClick={() => setShowAll((v) => !v)}
            className="hover:text-accent transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            {showAll ? "Show top " + initial : `Show all ${sorted.length}`} curators
          </button>
        </div>
      )}
    </div>
  )
}
