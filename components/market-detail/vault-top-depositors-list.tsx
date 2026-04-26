import { formatPercent, formatUSD } from "@/lib/utils"
import type { VaultTopDepositor } from "@/lib/market-detail"

interface Props {
  depositors: VaultTopDepositor[]
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function VaultTopDepositorsList({ depositors }: Props) {
  // Largest position drives the relative bar widths so the visual scale
  // reads correctly even when the top holder dominates.
  const top = depositors[0]?.assetsUsd ?? 0

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
