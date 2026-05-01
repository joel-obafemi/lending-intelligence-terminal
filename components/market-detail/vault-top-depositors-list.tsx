import { AlertTriangle } from "lucide-react"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { VaultTopDepositor } from "@/lib/market-detail"

interface Props {
  depositors: VaultTopDepositor[]
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

/** Detect concentration patterns worth flagging at the top of the list:
 *   - "single-depositor": one wallet holds ≥99.5% of TVL → custom mandate,
 *     not a public liquidity pool.
 *   - "highly-concentrated": top wallet ≥75% — public vault but with one
 *     dominant allocator. */
type ConcentrationFlag =
  | { kind: "single-depositor"; addr: string; usd: number }
  | { kind: "highly-concentrated"; addr: string; sharePct: number; usd: number }
  | null

function detectConcentration(depositors: VaultTopDepositor[]): ConcentrationFlag {
  const top = depositors[0]
  if (!top) return null
  if (top.sharePct >= 99.5) {
    return { kind: "single-depositor", addr: top.walletAddress, usd: top.assetsUsd }
  }
  if (top.sharePct >= 75) {
    return {
      kind: "highly-concentrated",
      addr: top.walletAddress,
      sharePct: top.sharePct,
      usd: top.assetsUsd,
    }
  }
  return null
}

export function VaultTopDepositorsList({ depositors }: Props) {
  // Largest position drives the relative bar widths so the visual scale
  // reads correctly even when the top holder dominates.
  const top = depositors[0]?.assetsUsd ?? 0
  const concentration = detectConcentration(depositors)

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
          Top Depositors
        </span>
        <span className="text-[10px] text-text-muted">
          Top {depositors.length} holders by share
        </span>
      </div>
      {concentration && (
        <div
          className="flex items-start gap-2 px-4 py-2.5"
          style={{
            background:
              concentration.kind === "single-depositor"
                ? "rgba(217, 119, 6, 0.08)"
                : "rgba(91, 127, 255, 0.06)",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <span
            style={{
              color:
                concentration.kind === "single-depositor"
                  ? "var(--accent-yellow)"
                  : "var(--accent-blue)",
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            <AlertTriangle size={12} strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-0.5">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{
                color:
                  concentration.kind === "single-depositor"
                    ? "var(--accent-yellow)"
                    : "var(--accent-blue)",
              }}
            >
              {concentration.kind === "single-depositor"
                ? "Single-depositor vault"
                : "Highly concentrated"}
            </span>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {concentration.kind === "single-depositor" ? (
                <>
                  100% of TVL ({formatUSD(concentration.usd)}) is held by one
                  wallet ({shortAddr(concentration.addr)}). This vault is
                  operating as a custom mandate, not a public liquidity pool —
                  read APY and allocation behaviour as one allocator's choices,
                  not market-clearing.
                </>
              ) : (
                <>
                  {formatPercent(concentration.sharePct, 1)} of TVL (
                  {formatUSD(concentration.usd)}) sits with one wallet (
                  {shortAddr(concentration.addr)}). The vault is public, but
                  the dominant allocator's behaviour drives most of the
                  observable activity.
                </>
              )}
            </p>
          </div>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "40px" }}>Rank</th>
              <th>Wallet Address</th>
              <th className="text-right">Amount</th>
              <th style={{ width: "30%" }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {depositors.map((d, i) => {
              const barWidth = top > 0 ? `${Math.max(2, (d.assetsUsd / top) * 100)}%` : "0%"
              return (
                <tr key={d.walletAddress}>
                  <td style={{ color: "var(--text-muted)" }}>#{i + 1}</td>
                  <td>
                    <a
                      href={`https://etherscan.io/address/${d.walletAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "var(--accent-orange)",
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: "11px",
                      }}
                      title={d.walletAddress}
                    >
                      {shortAddr(d.walletAddress)}
                    </a>
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(d.assetsUsd)}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        className="flex-1 overflow-hidden rounded"
                        style={{ height: "6px", background: "var(--card-border)" }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: barWidth,
                            background: "#EC4899",
                            opacity: 0.85,
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--text-muted)", minWidth: "40px", textAlign: "right" }}
                      >
                        {formatPercent(d.sharePct, 1)}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {depositors.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No depositors indexed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
