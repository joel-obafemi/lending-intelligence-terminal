/**
 * Liquidation Intensity table — Risk page reference.
 *
 * Per-protocol 90-day liquidation volume normalized by current TVL. The
 * peak row is the headline number on the Verdict strip; this card shows
 * the rest in context. Sorted descending by intensity so the most
 * stress-prone protocol sits at the top.
 */
import Link from "next/link"
import { formatUSD, formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import type { LiquidationIntensityRow } from "@/lib/risk"

interface Props {
  title: string
  rows: LiquidationIntensityRow[]
  methodologyKey?: string
}

export function LiquidationIntensityTable({ title, rows, methodologyKey }: Props) {
  const sorted = [...rows].sort((a, b) => b.intensityPct - a.intensityPct)
  const maxPct = Math.max(...sorted.map((r) => r.intensityPct), 0.0001)
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </span>
        <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
          Trailing 90d
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Protocol</th>
              <th className="text-right">Liq Volume (90d)</th>
              <th className="text-right">TVL</th>
              <th className="text-right">Volume / TVL</th>
              <th style={{ width: "26%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.slug}>
                <td>
                  <Link
                    href={`/protocols?p=${r.slug}`}
                    className="inline-flex items-center gap-1.5"
                    style={{ color: r.color, textDecoration: "none" }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: r.color }}
                    />
                    {r.name}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{formatUSD(r.volumeUsd)}</td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatUSD(r.tvlUsd)}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                  {formatPercent(r.intensityPct, 2)}
                </td>
                <td>
                  <div
                    style={{
                      width: `${(r.intensityPct / maxPct) * 100}%`,
                      height: "6px",
                      background: r.color,
                      opacity: 0.65,
                      borderRadius: "2px",
                    }}
                    title={formatPercent(r.intensityPct, 2)}
                  />
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  Liquidator DB not configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
