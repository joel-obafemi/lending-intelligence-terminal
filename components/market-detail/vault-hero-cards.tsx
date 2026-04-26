import { formatPercent, formatUSD } from "@/lib/utils"

interface Props {
  totalDepositsUsd: number
  totalDeposits24hChangeUsd: number | null
  liquidityUsd: number
  exposureSymbols: string[]
  exposureLogoMap: Record<string, string | null>
  netApy: number | null            // Already in percent
}

/** Compact +/-USD pill — green when positive, red when negative. */
function DeltaPill({ value }: { value: number | null }) {
  if (value == null || value === 0 || !Number.isFinite(value)) return null
  const positive = value > 0
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums"
      style={{ color: positive ? "var(--success)" : "var(--danger)" }}
    >
      <span>{positive ? "\u25B2" : "\u25BC"}</span>
      <span>{formatUSD(Math.abs(value))}</span>
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>24h</span>
    </span>
  )
}

interface CardProps {
  label: string
  accent: string
  children: React.ReactNode
}

function Card({ label, accent, children }: CardProps) {
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded-lg flex flex-col gap-2 relative overflow-hidden"
      style={{ padding: "16px 18px", minHeight: "104px" }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ backgroundColor: accent }}
      />
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em] pl-2"
        style={{ color: accent }}
      >
        {label}
      </span>
      <div className="pl-2 flex flex-col gap-1">{children}</div>
    </div>
  )
}

/** Small token-symbol pill used in the Exposure card. Renders the asset
 *  logo when Morpho's API supplied one; otherwise a colored letter avatar. */
function ExposurePill({ symbol, logoURI }: { symbol: string; logoURI: string | null }) {
  if (logoURI) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={logoURI}
        alt={symbol}
        title={symbol}
        width={24}
        height={24}
        style={{
          borderRadius: "50%",
          background: "var(--card-hover)",
          border: "1px solid var(--card-border)",
        }}
      />
    )
  }
  // Fallback — first letter of the symbol over the accent.
  return (
    <div
      title={symbol}
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background: "var(--card-hover)",
        border: "1px solid var(--card-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "9px",
        fontWeight: 600,
        color: "var(--text-secondary)",
      }}
    >
      {symbol.slice(0, 2)}
    </div>
  )
}

export function VaultHeroCards({
  totalDepositsUsd,
  totalDeposits24hChangeUsd,
  liquidityUsd,
  exposureSymbols,
  exposureLogoMap,
  netApy,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Total Deposits" accent="#5B7FFF">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatUSD(totalDepositsUsd)}
        </span>
        <DeltaPill value={totalDeposits24hChangeUsd} />
      </Card>

      <Card label="Total Liquidity" accent="#10B981">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatUSD(liquidityUsd)}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Idle + market-redeemable funds
        </span>
      </Card>

      <Card label="Exposure" accent="#F59E0B">
        {exposureSymbols.length > 0 ? (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              {exposureSymbols.slice(0, 8).map((sym) => (
                <ExposurePill key={sym} symbol={sym} logoURI={exposureLogoMap[sym] ?? null} />
              ))}
              {exposureSymbols.length > 8 && (
                <span
                  className="text-[10px] tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  +{exposureSymbols.length - 8}
                </span>
              )}
            </div>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Collateral assets backing markets the vault lends into
            </span>
          </>
        ) : (
          <>
            <span className="text-base" style={{ color: "var(--text-muted)" }}>
              100% Idle
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Vault has no active market allocations
            </span>
          </>
        )}
      </Card>

      <Card label="Net APY" accent="#EC4899">
        <span
          className="text-2xl font-semibold tabular-nums"
          style={{ color: "var(--success)" }}
        >
          {netApy != null ? formatPercent(netApy, 2) : "—"}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          After curator fee + rewards
        </span>
      </Card>
    </div>
  )
}
