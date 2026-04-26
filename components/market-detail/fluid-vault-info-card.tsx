import { formatPercent } from "@/lib/utils"
import type { FluidVaultInfo } from "@/lib/market-detail"

interface Props {
  info: FluidVaultInfo
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Map Fluid's `vaultType` integer to a human-readable label. The integers
 *  come from the `IFluidVault.ConstantViews.vaultType` field — Fluid uses
 *  these to differentiate non-smart vs. smart-collateral / smart-debt
 *  configurations on the protocol side. The labels here mirror Fluid's
 *  own UI naming. */
function vaultTypeLabel(vaultType: number, isSmartCol: boolean, isSmartDebt: boolean): string {
  if (isSmartCol && isSmartDebt) return "Smart Collateral · Smart Debt"
  if (isSmartCol) return "Smart Collateral"
  if (isSmartDebt) return "Smart Debt"
  // Plain vault types: 10000 is Fluid's primary T1 vault marker.
  return vaultType === 10000 ? "Standard Vault" : `Vault Type ${vaultType}`
}

interface RowProps {
  label: string
  /** Address renders as monospace + Etherscan link. */
  address?: string | null
  /** Plain text otherwise. */
  text?: string
  /** Optional small badge after the value. */
  badge?: string
  badgeColor?: string
}

function Row({ label, address, text, badge, badgeColor }: RowProps) {
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b border-card-border/30 last:border-b-0"
      style={{ minHeight: "36px" }}
    >
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        {address !== undefined ? (
          address ? (
            <a
              href={`https://etherscan.io/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] tabular-nums"
              style={{
                color: "var(--accent-orange)",
                fontFamily: "JetBrains Mono, monospace",
              }}
              title={address}
            >
              {shortAddr(address)}
            </a>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
          )
        ) : (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {text}
          </span>
        )}
        {badge && (
          <span
            className="text-[9px] uppercase tracking-[0.05em] px-1 py-0.5 rounded"
            style={{
              background: badgeColor ? `${badgeColor}22` : "var(--card-hover)",
              color: badgeColor ?? "var(--text-muted)",
              border: `1px solid ${badgeColor ? `${badgeColor}44` : "var(--card-border)"}`,
            }}
          >
            {badge}
          </span>
        )}
      </span>
    </div>
  )
}

export function FluidVaultInfoCard({ info }: Props) {
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div className="border-b border-card-border" style={{ padding: "10px 16px" }}>
        <span
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Fluid Vault Info
        </span>
      </div>
      <div style={{ padding: "8px 18px" }}>
        <Row
          label="Pair"
          text={`${info.collateralAssetSymbol} → ${info.loanAssetSymbol}`}
          badge={vaultTypeLabel(info.vaultType, info.isSmartCol, info.isSmartDebt)}
          badgeColor={info.isSmartCol || info.isSmartDebt ? "#8B5CF6" : undefined}
        />
        <Row label="Vault ID" text={`#${info.vaultId}`} />
        <Row label="Vault Address" address={info.vaultAddress} />
        <Row
          label="Collateral"
          address={info.collateralAssetAddress}
          badge={info.collateralAssetSymbol}
        />
        <Row
          label="Loan Asset"
          address={info.loanAssetAddress}
          badge={info.loanAssetSymbol}
        />
        <Row
          label="Liquidation Penalty"
          text={formatPercent(info.liquidationPenalty * 100, 2)}
        />
      </div>
    </div>
  )
}
