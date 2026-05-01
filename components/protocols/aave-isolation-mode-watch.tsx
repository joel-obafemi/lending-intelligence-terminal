/**
 * Isolation Mode Watch — Aave V3 protocol-specific lens, Module B.
 *
 * Lists every reserve currently in isolation mode with its on-chain
 * debt ceiling, current isolation-mode debt, and % of ceiling used.
 * Sorted by % used descending so the reserves closest to a ceiling
 * surface first — those are the early-stress signals the module
 * exists to catch.
 *
 * Server component. No interactivity beyond a small "show frozen" toggle
 * the table doesn't need yet.
 */
import { formatUSD, formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import type { IsolationReserveRow } from "@/lib/protocol-detail"

interface Props {
  rows: IsolationReserveRow[]
  /** Protocol brand color used for the progress bars. */
  color: string
}

function rowTone(pct: number): { bar: string; label: string } {
  if (pct >= 80) return { bar: "var(--danger)", label: "var(--danger)" }
  if (pct >= 50) return { bar: "var(--accent-yellow)", label: "var(--accent-yellow)" }
  return { bar: "var(--text-muted)", label: "var(--text-secondary)" }
}

export function AaveIsolationModeWatch({ rows, color }: Props) {
  if (rows.length === 0) return null
  // Auto insight: name the reserve nearest its ceiling, surface a stress
  // count when there's more than one row above 80%.
  const peak = rows[0]
  const stressed = rows.filter((r) => r.ceilingUsedPct >= 80 && !r.inactive).length
  const insight = peak
    ? stressed > 1
      ? `${peak.symbol} is at ${formatPercent(peak.ceilingUsedPct, 1)} of its $${formatUSD(peak.debtCeilingUsd).slice(1)} debt ceiling — one of ${stressed} isolation reserves above 80% utilized.`
      : `${peak.symbol} is at ${formatPercent(peak.ceilingUsedPct, 1)} of its $${formatUSD(peak.debtCeilingUsd).slice(1)} debt ceiling.`
    : null

  return (
    <div className="space-y-2">
      <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
        <div
          className="border-b border-card-border flex items-center justify-between"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Isolation Mode Watch
            <MethodologyTooltip methodologyKey="aave-isolation-mode-watch" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            {rows.length} isolated reserve{rows.length === 1 ? "" : "s"} · live on-chain
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="text-right">Debt Ceiling</th>
                <th className="text-right">Isolation Debt</th>
                <th className="text-right">Used</th>
                <th style={{ width: "30%" }}>Ceiling Pressure</th>
                <th className="text-right">Total Supply</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = rowTone(r.ceilingUsedPct)
                return (
                  <tr key={r.underlyingAsset}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span style={{ fontWeight: 600 }}>{r.symbol}</span>
                        {r.inactive && (
                          <span
                            className="text-[9px] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded"
                            style={{
                              background: "rgba(217, 119, 6, 0.12)",
                              color: "var(--accent-yellow)",
                              border: "1px solid rgba(217, 119, 6, 0.25)",
                            }}
                          >
                            Frozen
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatUSD(r.debtCeilingUsd)}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {formatUSD(r.isolationDebtUsd)}
                    </td>
                    <td
                      className="text-right tabular-nums"
                      style={{ color: tone.label, fontWeight: 600 }}
                    >
                      {formatPercent(r.ceilingUsedPct, 1)}
                    </td>
                    <td>
                      <div
                        className="w-full rounded overflow-hidden"
                        style={{ height: 6, background: "var(--card-border)" }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.min(100, r.ceilingUsedPct)}%`,
                            background: tone.bar,
                            opacity: 0.85,
                          }}
                          title={`${formatPercent(r.ceilingUsedPct, 1)} of debt ceiling used`}
                        />
                      </div>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatUSD(r.totalSupplyUsd)}
                    </td>
                  </tr>
                )
              })}
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
          Isolation mode caps how much an asset can be borrowed against on its
          own — the early-warning lens for new long-tail listings.
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
    </div>
  )
}
