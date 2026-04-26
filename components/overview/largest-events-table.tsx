"use client"

import { PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { formatUSD, formatDate } from "@/lib/utils"
import type { LargestEvent } from "@/lib/liquidations"

interface Props {
  title: string
  events: LargestEvent[]
}

function shortAddr(addr: string): string {
  if (!addr) return "—"
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function etherscanTxUrl(txHash: string): string {
  return `https://etherscan.io/tx/${txHash}`
}

export function LargestEventsTable({ title, events }: Props) {
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
          Sorted by debt-USD · click tx for Etherscan
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Protocol</th>
              <th>Pair</th>
              <th>Borrower</th>
              <th>Liquidator</th>
              <th className="text-right">Debt</th>
              <th className="text-right">Gross Profit</th>
              <th className="text-right">Net Profit</th>
              <th>Tx</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const p = PROTOCOL_BY_SLUG[e.protocolSlug]
              return (
                <tr key={e.id}>
                  <td style={{ color: "var(--text-muted)" }}>
                    {formatDate(e.timestamp)}
                  </td>
                  <td>
                    <span
                      className="inline-flex items-center gap-1.5"
                      style={{ color: p?.color ?? "var(--text-primary)" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: p?.color ?? "var(--text-muted)" }}
                      />
                      {p?.name ?? e.protocolSlug}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: "var(--text-primary)" }}>
                      {e.collateralSymbol ?? "?"}
                    </span>
                    <span className="text-text-muted mx-1">→</span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {e.debtSymbol ?? "?"}
                    </span>
                    {e.isFlashLoan && (
                      <span
                        className="inline-block ml-1.5 px-1 py-0.5 rounded text-[9px] uppercase tracking-[0.05em]"
                        style={{
                          backgroundColor: "rgba(180, 74, 255, 0.15)",
                          color: "var(--accent-secondary)",
                          border: "1px solid rgba(180, 74, 255, 0.35)",
                        }}
                      >
                        Flash
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                    {shortAddr(e.borrower)}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                    {shortAddr(e.liquidator)}
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(e.debtUsd)}</td>
                  <td className="text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {formatUSD(e.grossProfitUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: e.netProfitUsd >= 0 ? "var(--success)" : "var(--danger)" }}
                  >
                    {formatUSD(e.netProfitUsd)}
                  </td>
                  <td>
                    <a
                      href={etherscanTxUrl(e.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--accent-orange)", fontSize: "11px" }}
                    >
                      ↗
                    </a>
                  </td>
                </tr>
              )
            })}
            {events.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No liquidations in the selected period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
