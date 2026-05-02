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
  /** Optional symbol → display-name lookup. Used on the Morpho page to
   *  swap bare DefiLlama symbols (STEAKUSDC) for human-readable vault
   *  names ("Steakhouse USDC") + a curator sub-label. */
  vaultIndex?: Map<
    string,
    { name: string; curatorName: string | null }
  >
}

/** Per-row footnotes for known-good outliers that read like data errors at
 *  first glance (incentive pools, collateral-only assets, etc.). Keyed by
 *  asset symbol so the same row identity (`USDS · SPK Farming Pool`) is
 *  detectable across protocols. */
const ROW_FOOTNOTES: Record<string, { label: string; tooltip: string; tone: "info" | "warn" }> = {
  // Spark's SPK farming pool — incentive program, no rates by design.
  "USDS|spk farming pool": {
    label: "Farming",
    tooltip:
      "Not a standard lending market. Spark's SPK token farming pool issues SPK incentives to USDS depositors. No supply/borrow APY because it's reward-based.",
    tone: "info",
  },
}

/** Per-row inline tags. Render next to the asset symbol where applicable.
 *  Currently used to flag collateral-only assets that read confusingly
 *  with a 0% utilization. */
function inlineTagFor(m: MarketRow): { label: string; tooltip: string } | null {
  // Heuristic: large supply (>= $500M) with effectively-zero utilization
  // and zero borrow → almost certainly a collateral-only asset. Matches
  // wstETH on Spark, weETH/rsETH/ezETH on Aave V3 (E-Mode collateral),
  // and similar markets across deployments.
  const util = m.utilizationPct ?? 0
  const supply = m.totalSupplyUsd ?? 0
  const borrowed = m.borrowedUsd ?? 0
  if (supply >= 500_000_000 && util < 0.5 && borrowed < 1_000_000) {
    return {
      label: "Collateral-only",
      tooltip:
        "Used almost exclusively as collateral. Borrow demand is near zero, which is by design for this asset on this protocol.",
    }
  }
  return null
}

function footnoteFor(m: MarketRow): { label: string; tooltip: string; tone: "info" | "warn" } | null {
  // Match by asset + sub-label combination so we don't double-tag normal
  // USDS markets that happen to share a symbol with the farming pool.
  const sub = (m.subLabel ?? "").toLowerCase()
  const key = `${m.asset.toUpperCase()}|${sub}`
  return ROW_FOOTNOTES[key] ?? null
}

/** Pool-based: "LTV" — Aave V3/Spark. Isolated/vault: "LLTV" — Morpho, etc. */
function ltvLabel(arch: ProtocolDetail["architecture"]): string {
  return arch === "isolated" ? "LLTV" : "LTV"
}

/** Fluid lending-pool rows have no per-pool borrow data — borrowing happens
 *  at the vault layer that draws from these pools. The protocol-detail
 *  loader tags them with a "Lending pool" sub-label; we use that as the
 *  signal to substitute "Lending only" for the otherwise-blank borrow
 *  columns so a reader doesn't read missing data as a bug. */
function isFluidLendingOnly(m: MarketRow): boolean {
  return m.subLabel === "Lending pool"
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

export function MarketsTable({ architecture, color, markets, vaultIndex }: Props) {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const topSupply = markets[0]?.totalSupplyUsd ?? 0
  const totalPages = Math.max(1, Math.ceil(markets.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * ROWS_PER_PAGE
  const end = Math.min(start + ROWS_PER_PAGE, markets.length)
  const pageRows = useMemo(() => markets.slice(start, end), [markets, start, end])
  const pages = pageList(safePage, totalPages)

  // Morpho is a vault-aggregator architecture (isolated): vault rows
  // aggregate across underlying markets, no per-row borrow / util / LLTV.
  // Fluid is a vault-pair architecture (vault): rows are (collateral,
  // loan) pairs and DO expose borrow + util + LLTV. Both should read as
  // "Vaults" in the table title — only the column shape differs.
  const isVaultLabel = architecture === "isolated" || architecture === "vault"
  // Column layout still keys off `isolated` since that's the only one
  // where the borrow-side columns are empty by design.
  const isVaultLayout = architecture === "isolated"
  const tableTitle = isVaultLabel ? "Vaults" : "Markets"
  const noun = isVaultLabel ? "vaults" : "markets"
  const tableSummary =
    markets.length === 0
      ? `No ${noun} above the threshold`
      : `${start + 1}–${end} of ${markets.length}, sorted by Total Supply · click a row for details`

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
          {tableTitle}
        </span>
        <span className="text-[10px] text-text-muted">{tableSummary}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>{isVaultLabel ? "Vault" : "Market"}</th>
              <th className="text-right">Total Supply</th>
              {!isVaultLayout && <th className="text-right">Borrowed</th>}
              {!isVaultLayout && <th className="text-right">Util</th>}
              <th className="text-right">{isVaultLayout ? "Net APY" : "Supply APY"}</th>
              {!isVaultLayout && <th className="text-right">Borrow APY</th>}
              {!isVaultLayout && <th className="text-right">{ltvLabel(architecture)}</th>}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      {(() => {
                        // Vault rows on the Morpho page show DefiLlama's
                        // bare symbol (STEAKUSDC) by default. When the
                        // vault index is available, swap in the readable
                        // name ("Steakhouse USDC") and surface the
                        // curator on a sub-label below.
                        const idxEntry =
                          isVaultLayout && vaultIndex
                            ? vaultIndex.get(m.asset.toUpperCase())
                            : null
                        const primary =
                          idxEntry?.name && idxEntry.name.trim().length > 0
                            ? idxEntry.name
                            : m.asset
                        return (
                          <>
                            <span style={{ fontWeight: 600 }}>{primary}</span>
                            {idxEntry?.name && idxEntry.name !== m.asset && (
                              <span
                                className="text-[9px] uppercase tracking-[0.05em]"
                                style={{
                                  color: "var(--text-muted)",
                                  fontFamily: "JetBrains Mono, monospace",
                                }}
                                title={`Vault token symbol: ${m.asset}`}
                              >
                                {m.asset}
                              </span>
                            )}
                          </>
                        )
                      })()}
                      {(() => {
                        const fn = footnoteFor(m)
                        if (fn) {
                          return (
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-[0.05em]"
                              style={{
                                background:
                                  fn.tone === "warn"
                                    ? "rgba(217, 119, 6, 0.10)"
                                    : "rgba(91, 127, 255, 0.10)",
                                color:
                                  fn.tone === "warn"
                                    ? "var(--accent-yellow)"
                                    : "var(--accent-blue)",
                                border:
                                  fn.tone === "warn"
                                    ? "1px solid rgba(217, 119, 6, 0.25)"
                                    : "1px solid rgba(91, 127, 255, 0.25)",
                              }}
                              title={fn.tooltip}
                            >
                              {fn.label}
                            </span>
                          )
                        }
                        const tag = inlineTagFor(m)
                        if (tag) {
                          return (
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-[0.05em]"
                              style={{
                                background: "rgba(91, 127, 255, 0.08)",
                                color: "var(--accent-blue)",
                                border: "1px solid rgba(91, 127, 255, 0.20)",
                              }}
                              title={tag.tooltip}
                            >
                              {tag.label}
                            </span>
                          )
                        }
                        return null
                      })()}
                    </div>
                    {(() => {
                      // Prefer the canonical curator name from the Morpho
                      // index when available (vault-mode only). Falls back
                      // to whatever the loader already inferred from the
                      // vault ticker prefix (subLabel).
                      const idxEntry =
                        isVaultLayout && vaultIndex
                          ? vaultIndex.get(m.asset.toUpperCase())
                          : null
                      const curatorLabel = idxEntry?.curatorName?.trim() || m.subLabel
                      if (!curatorLabel) return null
                      return (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {idxEntry?.curatorName ? `Curator · ${curatorLabel}` : curatorLabel}
                        </span>
                      )
                    })()}
                  </div>
                </td>
                <td className="text-right tabular-nums">{formatUSD(m.totalSupplyUsd)}</td>
                {!isVaultLayout && (
                  <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {m.borrowedUsd != null ? formatUSD(m.borrowedUsd) : "—"}
                  </td>
                )}
                {!isVaultLayout && (
                  <td className="text-right tabular-nums">
                    {m.utilizationPct != null ? formatPercent(m.utilizationPct, 1) : "—"}
                  </td>
                )}
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
                {!isVaultLayout && (
                  <td className="text-right tabular-nums" style={{ color: "var(--danger)" }}>
                    {m.borrowApy != null ? (
                      formatPercent(m.borrowApy, 2)
                    ) : isFluidLendingOnly(m) ? (
                      <span
                        className="text-[10px] uppercase tracking-[0.05em]"
                        style={{ color: "var(--text-muted)" }}
                        title="Borrowing happens at the vault layer that draws from this pool, not at this row."
                      >
                        Lending only
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                {!isVaultLayout && (
                  <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {m.ltv == null ? (
                      "—"
                    ) : m.ltv === 0 ? (
                      // Aave-style protocols set baseLTVasCollateral to 0 when
                      // an asset is only usable as collateral inside E-Mode.
                      // Render a badge instead of "0%" so the page doesn't read
                      // as a bug.
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
                )}
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
                <td
                  colSpan={isVaultLayout ? 5 : 9}
                  style={{ textAlign: "center", color: "var(--text-muted)" }}
                >
                  No {isVaultLayout ? "vaults" : "markets"} above the threshold.
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
