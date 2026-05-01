/**
 * Parameter Comparator — Zone 3 of the Compare page.
 *
 * One side-by-side table for the selected asset. Four columns (one per
 * protocol). Rows are the configurable risk + listing parameters: LTV,
 * Liquidation Threshold, Liquidation Bonus, Reserve Factor, Debt Ceiling,
 * Supply Cap, Borrow Cap, Oracle, status flags.
 *
 * Visual cues:
 *   - "↑" badge on the cell with the highest LTV
 *   - "✓" badge on the cell with the lowest liquidation bonus
 *   - "FROZEN" / "PAUSED" yellow tag where applicable
 *   - "varies by market" text on Morpho rows (see lib/compare.ts notes)
 *
 * Server component — pure shape, no client state.
 */
import Link from "next/link"
import { ORACLE_COLOR } from "@/lib/oracles"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { formatPercent, formatUSD } from "@/lib/utils"
import { PROTOCOL_BY_SLUG } from "@/lib/protocols"
import type { CompareCell } from "@/lib/compare"

interface Props {
  symbol: string
  cells: CompareCell[]
}

const PARAMS_VARY_BY_MARKET_NOTE =
  "Morpho parameters vary per market. Where a single value is shown for Morpho, it's the largest vault matching the asset; ranges across all matching vaults are flagged."

interface RowDef {
  label: string
  /** Returns the raw value for the cell — used for badge logic. */
  raw: (c: CompareCell) => number | null
  /** Renders the cell text. */
  render: (c: CompareCell) => React.ReactNode
  /** "highest" / "lowest" / null. Determines which cell gets the badge. */
  badge: "highest" | "lowest" | null
  badgeLabel?: string
  badgeTone?: "good" | "warn"
  methodologyKey?: string
}

const ROWS: RowDef[] = [
  {
    label: "Max LTV",
    raw: (c) => c.ltv,
    render: (c) => (c.ltv != null ? formatPercent(c.ltv * 100, 0) : "—"),
    badge: "highest",
    badgeLabel: "↑",
    badgeTone: "good",
    methodologyKey: "compare-ltv",
  },
  {
    label: "Liquidation Threshold",
    raw: (c) => c.liquidationThreshold,
    render: (c) =>
      c.liquidationThreshold != null
        ? formatPercent(c.liquidationThreshold * 100, 0)
        : c.protocolSlug === "morpho-blue"
        ? "varies by market"
        : "—",
    badge: null,
    methodologyKey: "compare-liq-threshold",
  },
  {
    label: "Liquidation Bonus",
    raw: (c) => c.liquidationBonus,
    render: (c) =>
      c.liquidationBonus != null
        ? formatPercent(c.liquidationBonus * 100, 1)
        : c.protocolSlug === "morpho-blue"
        ? "varies by market"
        : "—",
    badge: "lowest",
    badgeLabel: "✓",
    badgeTone: "good",
    methodologyKey: "compare-liq-bonus",
  },
  {
    label: "Reserve Factor",
    raw: (c) => c.reserveFactor,
    render: (c) =>
      c.reserveFactor != null
        ? formatPercent(c.reserveFactor * 100, 0)
        : c.protocolSlug === "morpho-blue"
        ? "varies by market"
        : "—",
    badge: null,
  },
  {
    label: "Debt Ceiling",
    raw: (c) => c.debtCeilingUsd,
    render: (c) => {
      if (c.debtCeilingUsd == null) {
        return c.protocolSlug === "morpho-blue" ? "—" : "—"
      }
      if (c.debtCeilingUsd === 0) return "Not isolated"
      return formatUSD(c.debtCeilingUsd)
    },
    badge: null,
  },
  {
    label: "Supply Cap",
    raw: (c) => c.supplyCapUsd,
    render: (c) => {
      if (c.supplyCapUsd == null) {
        return c.protocolSlug === "morpho-blue"
          ? "Not applicable"
          : c.protocolSlug === "fluid"
          ? "On-chain only"
          : "No cap"
      }
      return formatUSD(c.supplyCapUsd)
    },
    badge: null,
  },
  {
    label: "Borrow Cap",
    raw: (c) => c.borrowCapUsd,
    render: (c) => {
      if (c.borrowCapUsd == null) {
        return c.protocolSlug === "morpho-blue"
          ? "Not applicable"
          : c.protocolSlug === "fluid"
          ? "On-chain only"
          : "No cap"
      }
      return formatUSD(c.borrowCapUsd)
    },
    badge: null,
  },
]

function pickBadge(
  row: RowDef,
  cells: CompareCell[],
): string | null {
  if (!row.badge) return null
  let target: { slug: string; v: number } | null = null
  for (const c of cells) {
    const v = row.raw(c)
    if (v == null || !Number.isFinite(v)) continue
    if (
      !target ||
      (row.badge === "highest" ? v > target.v : v < target.v)
    ) {
      target = { slug: c.protocolSlug, v }
    }
  }
  return target?.slug ?? null
}

export function ParameterComparator({ symbol, cells }: Props) {
  // Generate the auto insight line beneath the table.
  const ltvWinner = pickBadge(ROWS[0], cells)
  const bonusLowest = pickBadge(ROWS[2], cells)
  const ltvWinnerCell = cells.find((c) => c.protocolSlug === ltvWinner)
  const bonusLowestCell = cells.find((c) => c.protocolSlug === bonusLowest)
  const insight =
    ltvWinnerCell?.ltv != null && bonusLowestCell?.liquidationBonus != null
      ? `For ${symbol}, ${ltvWinnerCell.protocolName} currently allows the highest LTV at ${formatPercent(ltvWinnerCell.ltv * 100, 0)} and ${bonusLowestCell.protocolName} charges the smallest liquidation bonus at ${formatPercent(bonusLowestCell.liquidationBonus * 100, 1)}.`
      : null

  return (
    <div className="space-y-3">
      <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
        <div
          className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {symbol} · Risk Parameters
            <MethodologyTooltip methodologyKey="compare-parameters" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Live · on-chain reads + Yields
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Parameter</th>
                {cells.map((c) => (
                  <th key={c.protocolSlug} className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: c.protocolColor }}
                      />
                      <span style={{ color: c.protocolColor }}>{c.protocolName}</span>
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th></th>
                {cells.map((c) => (
                  <th
                    key={c.protocolSlug + "-status"}
                    className="text-right"
                    style={{ paddingTop: 0 }}
                  >
                    <div className="flex items-center justify-end gap-1 text-[9px] uppercase tracking-[0.08em]" style={{ fontWeight: 500 }}>
                      {c.isFrozen && (
                        <span
                          style={{
                            background: "rgba(217, 119, 6, 0.12)",
                            color: "var(--accent-yellow)",
                            padding: "2px 5px",
                            borderRadius: 3,
                            border: "1px solid rgba(217, 119, 6, 0.3)",
                          }}
                        >
                          Frozen
                        </span>
                      )}
                      {c.isPaused && (
                        <span
                          style={{
                            background: "rgba(214, 50, 46, 0.12)",
                            color: "var(--danger)",
                            padding: "2px 5px",
                            borderRadius: 3,
                            border: "1px solid rgba(214, 50, 46, 0.3)",
                          }}
                        >
                          Paused
                        </span>
                      )}
                      {c.note && !c.isFrozen && !c.isPaused && (
                        <span style={{ color: "var(--text-muted)", fontStyle: "italic", textTransform: "none", letterSpacing: 0 }}>
                          {c.note}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const winnerSlug = pickBadge(row, cells)
                return (
                  <tr key={row.label}>
                    <td style={{ color: "var(--text-secondary)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        {row.label}
                        {row.methodologyKey && (
                          <MethodologyTooltip methodologyKey={row.methodologyKey} />
                        )}
                      </span>
                    </td>
                    {cells.map((c) => {
                      const isWinner = winnerSlug === c.protocolSlug
                      const valueText = c.available ? row.render(c) : "—"
                      return (
                        <td
                          key={c.protocolSlug + row.label}
                          className="text-right tabular-nums"
                          style={{
                            color: c.available ? "var(--text-primary)" : "var(--text-muted)",
                            fontWeight: isWinner ? 600 : 400,
                          }}
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            {valueText}
                            {isWinner && row.badgeLabel && (
                              <span
                                style={{
                                  fontSize: "9px",
                                  color:
                                    row.badgeTone === "good"
                                      ? "var(--success)"
                                      : "var(--accent-yellow)",
                                }}
                              >
                                {row.badgeLabel}
                              </span>
                            )}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {/* Oracle row gets a custom render with vendor color + Etherscan link. */}
              <tr>
                <td style={{ color: "var(--text-secondary)" }}>
                  <span className="inline-flex items-center gap-1.5">
                    Oracle
                    <MethodologyTooltip methodologyKey="compare-oracle" />
                  </span>
                </td>
                {cells.map((c) => {
                  const vendorColor = ORACLE_COLOR[c.oracleVendor]
                  const inner = (
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{ color: vendorColor, fontWeight: 500 }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: vendorColor }}
                      />
                      {c.available ? c.oracleVendor : "—"}
                    </span>
                  )
                  return (
                    <td
                      key={c.protocolSlug + "-oracle"}
                      className="text-right"
                    >
                      {c.oracleAddress ? (
                        <Link
                          href={`https://etherscan.io/address/${c.oracleAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "none" }}
                        >
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {insight && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {insight}
        </p>
      )}
      <p className="text-[10px] px-1" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
        {PARAMS_VARY_BY_MARKET_NOTE}
      </p>
    </div>
  )
}
