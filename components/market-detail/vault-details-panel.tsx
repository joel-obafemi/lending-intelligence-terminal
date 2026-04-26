import { formatPercent } from "@/lib/utils"
import type { VaultMetaInfo } from "@/lib/market-detail"

interface Props {
  meta: VaultMetaInfo
}

function shortAddr(addr: string | null): string {
  if (!addr) return "—"
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** "604800" → "7d", "86400" → "1d", "3600" → "1h". */
function formatTimelock(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—"
  const days = seconds / 86400
  if (days >= 1) return `${Number.isInteger(days) ? days : days.toFixed(1)}d`
  const hours = seconds / 3600
  if (hours >= 1) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
  const minutes = seconds / 60
  return `${minutes.toFixed(0)}m`
}

interface RowProps {
  label: string
  /** Address: rendered as monospace with Etherscan link. */
  address?: string | null
  /** Plain text (for fees, timelock, version). */
  text?: string
  /** Optional badge to render after the value (e.g. allocator count). */
  badge?: string
}

function Row({ label, address, text, badge }: RowProps) {
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
          <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
            {text}
          </span>
        )}
        {badge && (
          <span
            className="text-[9px] uppercase tracking-[0.05em] px-1 py-0.5 rounded"
            style={{
              background: "var(--card-hover)",
              color: "var(--text-muted)",
              border: "1px solid var(--card-border)",
            }}
          >
            {badge}
          </span>
        )}
      </span>
    </div>
  )
}

export function VaultDetailsPanel({ meta }: Props) {
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div
        className="border-b border-card-border"
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
          Vault Details
        </span>
      </div>
      <div style={{ padding: "8px 18px" }}>
        <Row label="Vault Address" address={meta.vaultAddress} />
        <Row label="Owner" address={meta.ownerAddress} />
        <Row
          label="Curator"
          address={meta.curatorAddress}
          badge={meta.curatorName ?? undefined}
        />
        <Row
          label="Allocator"
          address={meta.allocatorAddress}
          badge={meta.allocatorCount > 1 ? `+${meta.allocatorCount - 1} more` : undefined}
        />
        <Row label="Guardian" address={meta.guardianAddress} />
        <Row label="Fee Recipient" address={meta.feeRecipientAddress} />
        <Row
          label="Performance Fee"
          text={formatPercent((meta.performanceFee ?? 0) * 100, 2)}
        />
        <Row label="Timelock" text={formatTimelock(meta.timelockSeconds)} />
        <Row label="Vault Version" text={meta.versionLabel} />
      </div>
    </div>
  )
}
