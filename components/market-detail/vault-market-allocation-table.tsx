"use client"

import Link from "next/link"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { VaultAllocationRow } from "@/lib/market-detail"

interface Props {
  allocation: VaultAllocationRow[]
  /** When true, market labels link to a future per-market detail page. */
  linkMarkets?: boolean
}

/** Logo or letter avatar for the market's collateral asset. */
function CollateralAvatar({
  symbol,
  logoURI,
}: {
  symbol: string | null
  logoURI: string | null
}) {
  if (logoURI) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoURI}
        alt={symbol ?? ""}
        width={20}
        height={20}
        style={{
          borderRadius: "50%",
          background: "var(--card-hover)",
          border: "1px solid var(--card-border)",
          flexShrink: 0,
        }}
      />
    )
  }
  // Idle marker — neutral grey avatar.
  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "var(--card-hover)",
        border: "1px solid var(--card-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "8px",
        fontWeight: 600,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}
    >
      {symbol ? symbol.slice(0, 2) : "··"}
    </div>
  )
}

/** Color scale for utilization — green low, amber high, red ≥95%. */
function utilColor(util: number | null): string {
  if (util == null) return "var(--text-muted)"
  if (util >= 0.95) return "var(--danger)"
  if (util >= 0.85) return "#F59E0B"
  return "var(--success)"
}

export function VaultMarketAllocationTable({ allocation }: Props) {
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
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
          Market Allocation
        </span>
        <span className="text-[10px] text-text-muted">
          Morpho Blue markets this vault supplies to
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Market</th>
              <th className="text-right">Allocated</th>
              <th className="text-right">Total Supply</th>
              <th className="text-right">Total Borrow</th>
              <th className="text-right">Liquidity</th>
              <th className="text-right">Utilization</th>
              <th className="text-right">Supply APY</th>
              <th className="text-right">Borrow APY</th>
            </tr>
          </thead>
          <tbody>
            {allocation.map((r) => (
              <tr key={r.marketUniqueKey}>
                <td>
                  <div className="flex items-center gap-2">
                    <CollateralAvatar
                      symbol={r.collateralSymbol}
                      logoURI={r.collateralLogoURI}
                    />
                    <div className="flex flex-col">
                      <span style={{ fontWeight: 600 }}>{r.marketLabel}</span>
                      {r.lltv != null && (
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          LLTV {formatPercent(r.lltv * 100, 0)}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td
                  className="text-right tabular-nums"
                  style={{
                    color:
                      r.vaultSupplyUsd > 0 ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: r.vaultSupplyUsd > 0 ? 600 : 400,
                  }}
                >
                  {formatUSD(r.vaultSupplyUsd)}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatUSD(r.marketSupplyAssetsUsd)}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatUSD(r.marketBorrowAssetsUsd)}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {formatUSD(r.marketLiquidityAssetsUsd)}
                </td>
                <td
                  className="text-right tabular-nums"
                  style={{ color: utilColor(r.marketUtilization) }}
                >
                  {r.marketUtilization != null
                    ? formatPercent(r.marketUtilization * 100, 1)
                    : "—"}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--success)" }}>
                  {r.marketSupplyApy != null ? formatPercent(r.marketSupplyApy, 2) : "—"}
                </td>
                <td className="text-right tabular-nums" style={{ color: "var(--danger)" }}>
                  {r.marketBorrowApy != null ? formatPercent(r.marketBorrowApy, 2) : "—"}
                </td>
              </tr>
            ))}
            {allocation.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  Vault has no active allocations.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
