/**
 * Liquidator Leaderboard — Risk page module.
 *
 * Top 10 liquidator wallets by trailing-window gross profit. Each row
 * shows the wallet (ENS or truncated address), debt repaid, gross
 * profit, event count, and the protocols the wallet operated on.
 * The Etherscan link surfaces the full address tree for a deeper drill.
 */
import { ExternalLink } from "lucide-react"
import { formatUSD } from "@/lib/utils"
import { PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import type { LiquidatorLeaderboardRow } from "@/lib/liquidations"

interface Props {
  rows: LiquidatorLeaderboardRow[]
  periodDays: number
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function LiquidatorLeaderboard({ rows, periodDays }: Props) {
  if (rows.length === 0) {
    return (
      <div
        className="tui-card bg-card-bg border border-card-border rounded p-4 text-[11px]"
        style={{ color: "var(--text-muted)" }}
      >
        Liquidator-economy DB not configured. Set{" "}
        <code>LIQUIDATOR_DATABASE_URL</code> in .env to populate the leaderboard.
      </div>
    )
  }
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span className="flex items-center gap-3">
          <span
            className="text-accent flex items-center gap-1.5"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Liquidator Leaderboard · {periodDays}d
            <MethodologyTooltip methodologyKey="risk-liquidator-leaderboard" />
          </span>
          <span className="text-[10px] text-text-muted">
            Top {rows.length} wallets by gross profit · trailing 90 days
          </span>
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Liquidator</th>
              <th className="text-right">Debt repaid</th>
              <th className="text-right">Gross profit</th>
              <th className="text-right">Events</th>
              <th>Protocols</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const display = r.ensName ?? shortAddress(r.liquidator)
              return (
                <tr key={r.liquidator}>
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td>
                    <a
                      href={`https://etherscan.io/address/${r.liquidator}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5"
                      style={{
                        color: "var(--accent-orange)",
                        fontFamily: r.ensName ? undefined : "JetBrains Mono, monospace",
                        textDecoration: "none",
                      }}
                      title={r.liquidator}
                    >
                      {display}
                      <ExternalLink size={10} strokeWidth={1.75} />
                    </a>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatUSD(r.debtRepaidUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: "var(--success)", fontWeight: 600 }}
                  >
                    {formatUSD(r.grossProfitUsd)}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.eventCount.toLocaleString()}
                  </td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      {r.protocols.map((slug) => {
                        const cfg = PROTOCOL_BY_SLUG[slug]
                        return (
                          <span
                            key={slug}
                            className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded"
                            style={{
                              background: cfg ? `${cfg.color}1A` : "var(--card-hover)",
                              color: cfg?.color ?? "var(--text-muted)",
                              border: `1px solid ${cfg ? cfg.color + "44" : "var(--card-border)"}`,
                            }}
                          >
                            <span
                              className="w-1 h-1 rounded-full"
                              style={{ backgroundColor: cfg?.color }}
                            />
                            {cfg?.name ?? slug}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
