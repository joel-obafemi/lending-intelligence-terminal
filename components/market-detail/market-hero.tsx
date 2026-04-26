import { ASSET_TYPE_COLOR, ASSET_TYPE_LABEL, type AssetType } from "@/lib/assets"
import { formatPercent, formatUSD } from "@/lib/utils"

interface Props {
  asset: string
  subLabel: string | null
  assetType: AssetType
  protocolName: string
  protocolColor: string
  protocolArchitecture: string
  chain: string
  totalSupplyUsd: number
  tvlUsd: number
  totalBorrowUsd: number
  utilizationPct: number | null
  supplyApy: number | null
  supplyApyReward: number | null
  borrowApy: number | null
  borrowApyReward: number | null
  apyMean30d: number | null
  ltv: number | null
}

function StatCell({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string
  primary: React.ReactNode
  secondary?: React.ReactNode
  accent?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-base font-semibold tabular-nums"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
        {primary}
      </span>
      {secondary && (
        <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          {secondary}
        </span>
      )}
    </div>
  )
}

export function MarketHero({
  asset,
  subLabel,
  assetType,
  protocolName,
  protocolColor,
  protocolArchitecture,
  chain,
  totalSupplyUsd,
  tvlUsd,
  totalBorrowUsd,
  utilizationPct,
  supplyApy,
  supplyApyReward,
  borrowApy,
  borrowApyReward,
  apyMean30d,
  ltv,
}: Props) {
  const typeColor = ASSET_TYPE_COLOR[assetType]
  const typeLabel = ASSET_TYPE_LABEL[assetType]
  const utilDisplay = utilizationPct != null ? formatPercent(utilizationPct, 1) : "—"
  const utilBarPct = Math.min(100, Math.max(0, utilizationPct ?? 0))

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      {/* Identity strip */}
      <div
        className="border-b border-card-border flex items-center justify-between gap-3 flex-wrap"
        style={{ padding: "14px 18px" }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {asset}
            </span>
            {subLabel && (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {subLabel}
              </span>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              background: `${protocolColor}22`,
              color: protocolColor,
              border: `1px solid ${protocolColor}44`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: protocolColor }} />
            {protocolName}
          </span>
          <span
            className="inline-flex items-center text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              background: `${typeColor}22`,
              color: typeColor,
              border: `1px solid ${typeColor}44`,
            }}
          >
            {typeLabel}
          </span>
          <span
            className="inline-flex items-center text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--card-border)",
            }}
          >
            {protocolArchitecture}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
          {chain}
        </span>
      </div>

      {/* Vitals grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4"
        style={{ padding: "16px 18px" }}
      >
        <StatCell
          label="Total Supply"
          primary={formatUSD(totalSupplyUsd)}
          secondary={`TVL ${formatUSD(tvlUsd)}`}
        />
        <StatCell
          label="Total Borrowed"
          primary={formatUSD(totalBorrowUsd)}
          secondary={
            utilizationPct != null
              ? `Utilization ${utilDisplay}`
              : "Utilization —"
          }
        />
        <StatCell
          label="Supply APY"
          primary={
            <>
              {supplyApy != null ? formatPercent(supplyApy, 2) : "—"}
              {supplyApyReward != null && supplyApyReward > 0 && (
                <span
                  className="text-[11px] ml-1.5"
                  style={{ color: "var(--accent-secondary)" }}
                >
                  +{formatPercent(supplyApyReward, 2)}
                </span>
              )}
            </>
          }
          secondary={
            apyMean30d != null ? `30d mean ${formatPercent(apyMean30d, 2)}` : undefined
          }
          accent="var(--success)"
        />
        <StatCell
          label="Borrow APY"
          primary={
            <>
              {borrowApy != null ? formatPercent(borrowApy, 2) : "—"}
              {borrowApyReward != null && borrowApyReward > 0 && (
                <span
                  className="text-[11px] ml-1.5"
                  style={{ color: "var(--accent-secondary)" }}
                >
                  +{formatPercent(borrowApyReward, 2)}
                </span>
              )}
            </>
          }
          accent="var(--danger)"
        />
        <StatCell
          label={protocolArchitecture === "isolated" ? "LLTV" : "LTV"}
          primary={ltv != null ? formatPercent(ltv * 100, 0) : "—"}
        />
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted)" }}
          >
            Utilization
          </span>
          <span
            className="text-base font-semibold tabular-nums"
            style={{ color: "var(--text-primary)" }}
          >
            {utilDisplay}
          </span>
          <div
            className="w-full overflow-hidden rounded"
            style={{
              height: "4px",
              background: "var(--card-border)",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${utilBarPct}%`,
                background: protocolColor,
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
