"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { MarketRow, ProtocolDetail } from "@/lib/protocol-detail"

const ROWS_PER_PAGE = 20

interface Props {
  architecture: ProtocolDetail["architecture"]
  color: string
  markets: MarketRow[]
}

/** Pool-based: "LTV" — Aave V3/Spark. Isolated/vault: "LLTV" — Morpho, etc. */
function ltvLabel(arch: ProtocolDetail["architecture"]): string {
  return arch === "isolated" ? "LLTV" : "LTV"
}

/**
 * Build a compact list of page numbers to render in the pager. For ≤7 pages
 * show all of them; otherwise show first, last, current ±1, and ellipses.
 * Examples (current page in *), totalPages = 12:
 *   1: 1* 2 3 4 5 … 12
 *   6: 1 … 5 6* 7 … 12
 *  12: 1 … 8 9 10 11 12*
 */
function pageList(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: Array<number | "…"> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) out.push("…")
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push("…")
  out.push(total)
  return out
}

export function MarketsTable({ architecture, color, markets }: Props) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const topSupply = markets[0]?.totalSupplyUsd ?? 0
  const totalPages = Math.max(1, Math.ceil(markets.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * ROWS_PER_PAGE
  const end = Math.min(start + ROWS_PER_PAGE, markets.length)
  const pageRows = useMemo(() => markets.slice(start, end), [markets, start, end])
  const pages = pageList(safePage, totalPages)

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
          Markets
        </span>
        <span className="text-[10px] text-text-muted">
          {markets.length === 0
            ? "No markets above the threshold"
            : `${start + 1}–${end} of ${markets.length}, sorted by Total Supply · click a row for details`}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Market</th>
              <th className="text-right">Total Supply</th>
              <th className="text-right">Borrowed</th>
              <th className="text-right">Util</th>
              <th className="text-right">Supply APY</th>
              <th className="text-right">Borrow APY</th>
              <th className="text-right">{ltvLabel(architecture)}</th>
              <th style={{ width: "16%" }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m, i) => (
              <tr
                key={m.poolId}
                onClick={() => router.push(`/markets/${m.poolId}`)}
                style={{ cursor: "pointer" }}
              >
                <td style={{ color: "var(--text-muted)" }}>{start + i + 1}</td>
                <td>
                  <div className="flex flex-col">
                    <span style={{ fontWeight: 600 }}>{m.asset}</span>
                    {m.subLabel && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {m.subLabel}
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right tabular-nums">{formatUSD(m.totalSupplyUsd)}</td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {m.borrowedUsd != null ? formatUSD(m.borrowedUsd) : "—"}
                </td>
                <td className="text-right tabular-nums">
                  {m.utilizationPct != null ? formatPercent(m.utilizationPct, 1) : "—"}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--success)" }}>
                  {m.supplyApy != null ? (
                    <>
                      {formatPercent(m.supplyApy, 2)}
                      {m.hasRewards && m.supplyApyReward != null && (
                        <span className="text-[10px] ml-1" style={{ color: "var(--accent-secondary)" }}>
                          +{formatPercent(m.supplyApyReward, 2)}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--danger)" }}>
                  {m.borrowApy != null ? formatPercent(m.borrowApy, 2) : "—"}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {m.ltv == null ? (
                    "—"
                  ) : m.ltv === 0 ? (
                    // Aave-style protocols set baseLTVasCollateral to 0 when an
                    // asset is only usable as collateral inside E-Mode. Render a
                    // badge instead of "0%" so the page doesn't read as a bug.
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-[0.05em]"
                      style={{
                        background: "rgba(91, 127, 255, 0.10)",
                        color: "var(--accent-blue)",
                        border: "1px solid rgba(91, 127, 255, 0.25)",
                      }}
                      title="Base LTV is 0 — this asset can only be used as collateral via E-Mode"
                    >
                      E-Mode
                    </span>
                  ) : (
                    formatPercent(m.ltv * 100, 0)
                  )}
                </td>
                <td>
                  <div
                    style={{
                      width: topSupply > 0 ? `${(m.totalSupplyUsd / topSupply) * 100}%` : "0%",
                      height: "6px",
                      background: color,
                      opacity: 0.55,
                      borderRadius: "2px",
                    }}
                  />
                </td>
              </tr>
            ))}
            {markets.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No markets above the threshold.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div
          className="border-t border-card-border flex items-center justify-between flex-wrap gap-2"
          style={{ padding: "8px 16px" }}
        >
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <PagerButton
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              label="‹ Prev"
            />
            {pages.map((p, idx) =>
              p === "…" ? (
                <span
                  key={`gap-${idx}`}
                  className="text-[10px] px-1.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  …
                </span>
              ) : (
                <PagerButton
                  key={p}
                  active={p === safePage}
                  onClick={() => setPage(p)}
                  label={String(p)}
                />
              ),
            )}
            <PagerButton
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              label="Next ›"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function PagerButton({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "3px 8px",
        fontSize: "10px",
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        background: active ? "var(--card-border)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        border: "1px solid var(--card-border)",
        borderRadius: "3px",
        minWidth: "26px",
      }}
    >
      {label}
    </button>
  )
}
