import { formatUSD } from "@/lib/utils"
import type { MorphoVaultActivity } from "@/lib/morpho-api"

interface Props {
  activity: MorphoVaultActivity[]
  /** Underlying-asset symbol — appears next to the token amount. */
  assetSymbol: string
}

function shortAddr(a: string | null): string {
  if (!a) return "—"
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function shortTx(h: string): string {
  return `${h.slice(0, 6)}…${h.slice(-4)}`
}

function formatDateTime(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  // "Apr 26, 2026  10:27 AM"
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  })
}

function formatTokenAmount(qty: number, symbol: string): string {
  if (!Number.isFinite(qty)) return `0 ${symbol}`
  const abs = Math.abs(qty)
  let v: string
  if (abs >= 1) v = qty.toFixed(qty >= 1000 ? 2 : 4)
  else v = qty.toFixed(6)
  return `${v} ${symbol}`
}

const TYPE_COLOR: Record<MorphoVaultActivity["type"], string> = {
  Deposit: "var(--success)",
  Withdraw: "var(--danger)",
  Transfer: "var(--text-muted)",
}

export function VaultActivityTable({ activity, assetSymbol }: Props) {
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Vault Activity
        </span>
        <span className="text-[10px] text-text-muted">
          Most recent {activity.length} deposits and withdrawals
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date &amp; Time</th>
              <th>Wallet</th>
              <th>Event</th>
              <th className="text-right">Amount</th>
              <th>Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a) => (
              <tr key={`${a.txHash}-${a.type}-${a.walletAddress ?? ""}`}>
                <td style={{ color: "var(--text-muted)" }}>{formatDateTime(a.timestamp)}</td>
                <td>
                  {a.walletAddress ? (
                    <a
                      href={`https://etherscan.io/address/${a.walletAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "var(--accent-orange)",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "11px",
                      }}
                      title={a.walletAddress}
                    >
                      {shortAddr(a.walletAddress)}
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
                <td>
                  <span style={{ color: TYPE_COLOR[a.type], fontWeight: 600 }}>{a.type}</span>
                </td>
                <td className="text-right">
                  <div className="flex flex-col items-end">
                    <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {formatTokenAmount(a.amountToken, assetSymbol)}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatUSD(a.amountUsd)}
                    </span>
                  </div>
                </td>
                <td>
                  <a
                    href={`https://etherscan.io/tx/${a.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent-orange)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "11px",
                    }}
                    title={a.txHash}
                  >
                    {shortTx(a.txHash)}
                  </a>
                </td>
              </tr>
            ))}
            {activity.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No deposits or withdrawals on this vault yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
