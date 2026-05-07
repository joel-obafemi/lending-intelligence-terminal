/**
 * Aave V3 Umbrella — protocol-specific lens, sister card to Safety Module.
 *
 * Shows per-asset coverage from the four UmbrellaStakeToken contracts on
 * Ethereum mainnet (waUSDC / waUSDT / waWETH / GHO). Coverage USD is the
 * underlying-asset balance × current USD price. Reconciles within
 * snapshot drift against Chaos Labs and TokenLogic dashboards.
 *
 * Distinct from Safety Module:
 *   - SM = single AAVE token pool, slashed to cover ANY reserve's bad debt
 *   - Umbrella = per-reserve aToken stakes, slashed only for THAT reserve
 * Both are currently active on Ethereum.
 */
import { Umbrella as UmbrellaIcon } from "lucide-react"
import { formatUSD } from "@/lib/utils"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import type { UmbrellaStatus } from "@/lib/aave-umbrella"

interface Props {
  status: UmbrellaStatus
  protocolColor: string
}

const ASSET_COLORS: Record<string, string> = {
  USDT: "#26A17B",
  USDC: "#2775CA",
  WETH: "#FF6B35",
  GHO: "#B44AFF",
}

export function AaveUmbrella({ status, protocolColor }: Props) {
  if (status.reserves.length === 0) {
    return null
  }
  const total = status.totalCoverageUsd
  const reserves = [...status.reserves].sort((a, b) => b.coverageUsd - a.coverageUsd)

  const lead = reserves[0]
  const insight = lead
    ? `${formatUSD(total)} of depositor capital is staked across the four Umbrella reserves. ${lead.symbol} carries the largest share at ${formatUSD(lead.coverageUsd)} (${((lead.coverageUsd / total) * 100).toFixed(1)}%).`
    : `${formatUSD(total)} of coverage across the Umbrella reserves.`

  return (
    <div className="space-y-2">
      <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
        <div
          className="border-b border-card-border flex items-center justify-between"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            <UmbrellaIcon size={12} strokeWidth={2.5} style={{ color: protocolColor }} />
            Umbrella
            <MethodologyTooltip methodologyKey="aave-umbrella" />
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.08em]"
            style={{ color: "var(--text-muted)" }}
          >
            Per-reserve · live on-chain
          </span>
        </div>

        <div
          className="px-4 py-3 flex items-baseline justify-between gap-3 flex-wrap"
          style={{ borderBottom: "1px solid var(--card-border)" }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted)" }}
          >
            Total Coverage
          </span>
          <span
            className="text-lg font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {formatUSD(total)}
          </span>
        </div>

        <ul style={{ listStyle: "none", padding: "8px 16px 12px", margin: 0, display: "grid", gap: 8 }}>
          {reserves.map((r) => {
            const sharePct = total > 0 ? (r.coverageUsd / total) * 100 : 0
            const barColor = ASSET_COLORS[r.symbol] ?? protocolColor
            return (
              <li key={r.symbol} style={{ display: "grid", gridTemplateColumns: "60px 1fr 100px", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    color: barColor,
                  }}
                >
                  {r.symbol}
                </span>
                <div
                  style={{
                    height: 14,
                    background: "rgba(15, 17, 21, 0.04)",
                    borderRadius: 2,
                    position: "relative",
                    overflow: "hidden",
                  }}
                  title={`${r.symbol} · ${formatUSD(r.coverageUsd)} (${sharePct.toFixed(1)}%)`}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${sharePct}%`,
                      background: barColor,
                      opacity: 0.85,
                    }}
                  />
                </div>
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    textAlign: "right",
                  }}
                >
                  {formatUSD(r.coverageUsd)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <p
        className="text-[12px] leading-relaxed px-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {insight}
      </p>
    </div>
  )
}
