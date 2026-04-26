import { formatUSD } from "@/lib/utils"
import type { MorphoMarketLiquidation } from "@/lib/morpho-api"

interface Props {
  liquidations: MorphoMarketLiquidation[]
}

function shortAddr(a: string | null): string {
  if (!a) return "—"
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function shortTx(h: string): string {
  return `${h.slice(0, 6)}…${h.slice(-4)}`
}

function formatDateTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  })
}

function formatTokenAmount(qty: number, symbol: string | null): string {
  if (!Number.isFinite(qty) || qty === 0) return `0 ${symbol ?? ""}`
  const abs = Math.abs(qty)
  let v: string
  if (abs >= 1) v = qty.toFixed(qty >= 1000 ? 2 : 4)
  else if (abs >= 0.001) v = qty.toFixed(6)
  else v = qty.toExponential(2)
  return `${v} ${symbol ?? ""}`
}

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

export function VaultLiquidationEventsTable({ liquidations }: Props) {
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
          Liquidation Events
        </span>
        <span className="text-[10px] text-text-muted">
          {liquidations.length === 0
            ? "No recent liquidations on this vault's markets"
            : `${liquidations.length} most-recent liquidations across allocated markets`}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date &amp; Time</th>
              <th>Market</th>
              <th className="text-right">Amount Repaid</th>
              <th className="text-right">Amount Seized</th>
              <th className="text-right">Bad Debt</th>
              <th>Liquidator</th>
              <th>Tx Hash</th>
            </tr>
          </thead>
          <tbody>
            {liquidations.map((l) => (
              <tr key={l.txHash + l.marketUniqueKey}>
                <td style={{ color: "var(--text-muted)" }}>{formatDateTime(l.timestamp)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <CollateralAvatar
                      symbol={l.collateralSymbol}
                      logoURI={l.collateralLogoURI}
                    />
                    <span style={{ fontWeight: 600 }}>
                      {l.collateralSymbol ?? "?"} <span style={{ color: "var(--text-muted)" }}>/</span>{" "}
                      {l.loanSymbol}
                    </span>
                  </div>
                </td>
                <td className="text-right">
                  <div className="flex flex-col items-end">
                    <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {formatTokenAmount(l.repaidAssets, l.loanSymbol)}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatUSD(l.repaidAssetsUsd)}
                    </span>
                  </div>
                </td>
                <td className="text-right">
                  <div className="flex flex-col items-end">
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--danger)" }}
                    >
                      {formatTokenAmount(l.seizedAssets, l.collateralSymbol)}
                    </span>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatUSD(l.seizedAssetsUsd)}
                    </span>
                  </div>
                </td>
                <td
                  className="text-right tabular-nums"
                  style={{
                    color: l.badDebtAssetsUsd > 0 ? "var(--danger)" : "var(--text-muted)",
                  }}
                >
                  {l.badDebtAssetsUsd > 0 ? formatUSD(l.badDebtAssetsUsd) : "—"}
                </td>
                <td>
                  <a
                    href={`https://etherscan.io/address/${l.liquidator ?? ""}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent-orange)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "11px",
                    }}
                    title={l.liquidator ?? ""}
                  >
                    {shortAddr(l.liquidator)}
                  </a>
                </td>
                <td>
                  <a
                    href={`https://etherscan.io/tx/${l.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent-orange)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: "11px",
                    }}
                    title={l.txHash}
                  >
                    {shortTx(l.txHash)}
                  </a>
                </td>
              </tr>
            ))}
            {liquidations.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No liquidation events on this vault&apos;s markets.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
