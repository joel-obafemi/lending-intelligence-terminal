import { formatPercent, formatUSD } from "@/lib/utils"

interface Props {
  totalDepositsUsd: number
  totalDeposits24hChangeUsd: number | null
  liquidityUsd: number
  exposureSymbols: string[]
  exposureLogoMap: Record<string, string | null>
  /** symbol → share-of-vault percent (0-100). When provided the Exposure
   *  card renders a small horizontal stacked bar + legend with allocation
   *  percentages, replacing the previous decorative icon row. */
  exposureSharePctMap?: Record<string, number>
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

const EXPOSURE_COLORS = [
  "#5B7FFF",  // blue
  "#FF6B35",  // accent orange
  "#10B981",  // green
  "#B44AFF",  // purple
  "#F59E0B",  // amber
  "rgba(91, 99, 115, 0.5)", // muted "Other"
]

export function VaultHeroCards({
  totalDepositsUsd,
  totalDeposits24hChangeUsd,
  liquidityUsd,
  exposureSymbols,
  exposureLogoMap,
  exposureSharePctMap,
  netApy,
}: Props) {
  // Build the Exposure breakdown when share% is available — sorted, capped
  // at top 5 with an "Other" bucket so the bar reads cleanly.
  interface ExpEntry {
    symbol: string
    sharePct: number
    color: string
  }
  let exposureBreakdown: ExpEntry[] | null = null
  if (exposureSharePctMap && Object.keys(exposureSharePctMap).length > 0) {
    const entries = Object.entries(exposureSharePctMap)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
    const top = entries.slice(0, 5)
    const tail = entries.slice(5)
    const tailShare = tail.reduce((s, [, v]) => s + v, 0)
    exposureBreakdown = top.map(([sym, share], i) => ({
      symbol: sym,
      sharePct: share,
      color: EXPOSURE_COLORS[i % (EXPOSURE_COLORS.length - 1)],
    }))
    if (tailShare > 0.5) {
      exposureBreakdown.push({
        symbol: `Other (${tail.length})`,
        sharePct: tailShare,
        color: EXPOSURE_COLORS[EXPOSURE_COLORS.length - 1],
      })
    }
  }
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
        {exposureBreakdown && exposureBreakdown.length > 0 ? (
          <>
            {/* Stacked bar — segments sized by share-of-vault. Hover any
                segment to see the exact allocation. */}
            <div
              className="flex w-full rounded overflow-hidden"
              style={{ height: 8, background: "var(--card-border)" }}
            >
              {exposureBreakdown.map((e) => (
                <div
                  key={e.symbol}
                  title={`${e.symbol} — ${e.sharePct.toFixed(1)}%`}
                  style={{
                    width: `${e.sharePct}%`,
                    background: e.color,
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
            {/* Legend — top entries with explicit %. */}
            <div className="flex flex-col gap-0.5 mt-1">
              {exposureBreakdown.slice(0, 4).map((e) => (
                <div
                  key={e.symbol}
                  className="flex items-center justify-between gap-2 text-[10px]"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ background: e.color }}
                    />
                    <span className="truncate" style={{ color: "var(--text-secondary)" }}>
                      {e.symbol}
                    </span>
                  </div>
                  <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {e.sharePct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : exposureSymbols.length > 0 ? (
          <>
            {/* Fallback for cases where the loader gave us symbols but no
                allocation %s — keep the original icon row treatment. */}
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
