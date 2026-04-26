import { formatPercent } from "@/lib/utils"

interface Props {
  protocolColor: string
  protocolArchitecture: string
  /** All APY fields are normalized to PERCENT (0-100) by the loader. */
  supplyApy: number | null
  supplyApyReward: number | null
  borrowApy: number | null
  borrowApyReward: number | null
  utilizationPct: number | null    // 0-100
  collateralFactor: number | null  // 0-1 fraction (LTV)
  fee: number | null               // 0-1 fraction (vault performance fee)
  reserveFactor: number | null     // 0-1 fraction
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(2)}%`
}

interface CardProps {
  label: string
  children: React.ReactNode
  accent?: string
}

function Card({ label, children, accent }: CardProps) {
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded-lg flex flex-col gap-2 relative overflow-hidden"
      style={{ padding: "16px" }}
    >
      {accent && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[2px]"
          style={{ backgroundColor: accent }}
        />
      )}
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em] pl-2"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div className="pl-2">{children}</div>
    </div>
  )
}

export function MarketKpiCards({
  protocolColor,
  protocolArchitecture,
  supplyApy,
  supplyApyReward,
  borrowApy,
  borrowApyReward,
  utilizationPct,
  collateralFactor,
  fee,
  reserveFactor,
}: Props) {
  const utilSafe = utilizationPct != null ? Math.min(100, Math.max(0, utilizationPct)) : 0
  const isVault = protocolArchitecture === "isolated"

  // Pick the most-relevant risk card. Vaults: Performance Fee. Pools: LTV +
  // optional Reserve Factor stacked. Falls back to "Coming with SDK" if none.
  const riskKind: "fee" | "ltv-rf" | "ltv" | "rf" | "none" =
    isVault && fee != null
      ? "fee"
      : collateralFactor != null && reserveFactor != null
      ? "ltv-rf"
      : collateralFactor != null
      ? "ltv"
      : reserveFactor != null
      ? "rf"
      : "none"

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Supply APY" accent="#10B981">
        <span className="text-3xl font-semibold tabular-nums" style={{ color: "#10B981" }}>
          {fmtPct(supplyApy)}
        </span>
        {supplyApyReward != null && supplyApyReward > 0 && (
          <span
            className="text-[11px] ml-2 tabular-nums"
            style={{ color: "var(--accent-secondary)" }}
          >
            +{fmtPct(supplyApyReward)} rewards
          </span>
        )}
      </Card>

      <Card label={isVault ? "Net APY" : "Borrow APY"} accent="#FF8A3D">
        {isVault ? (
          <>
            <span className="text-3xl font-semibold tabular-nums" style={{ color: "#FF8A3D" }}>
              {fmtPct(borrowApy ?? supplyApy)}
            </span>
            <span className="text-[10px] block mt-1" style={{ color: "var(--text-muted)" }}>
              Vaults aggregate supply only
            </span>
          </>
        ) : (
          <>
            <span className="text-3xl font-semibold tabular-nums" style={{ color: "#FF8A3D" }}>
              {fmtPct(borrowApy)}
            </span>
            {borrowApyReward != null && borrowApyReward > 0 && (
              <span
                className="text-[11px] ml-2 tabular-nums"
                style={{ color: "var(--accent-secondary)" }}
              >
                +{fmtPct(borrowApyReward)} rewards
              </span>
            )}
          </>
        )}
      </Card>

      <Card label="Utilization" accent="#8B5CF6">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-3xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {utilizationPct != null ? formatPercent(utilizationPct, 1) : "—"}
          </span>
        </div>
        <div
          className="w-full overflow-hidden rounded"
          style={{ height: "6px", background: "var(--card-border)" }}
        >
          <div
            style={{
              height: "100%",
              width: `${utilSafe}%`,
              background: protocolColor,
              opacity: 0.9,
            }}
          />
        </div>
      </Card>

      {/* Risk card — varies by what data we have */}
      {riskKind === "fee" && (
        <Card label="Performance Fee" accent="#F59E0B">
          <span className="text-3xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formatPercent((fee ?? 0) * 100, 2)}
          </span>
          <span className="text-[10px] block mt-1" style={{ color: "var(--text-muted)" }}>
            Curator share of vault yield
          </span>
        </Card>
      )}
      {riskKind === "ltv-rf" && (
        <Card label="Risk Parameters" accent="#F59E0B">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Collateral Factor
            </span>
            <span className="text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatPercent((collateralFactor ?? 0) * 100, 0)}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Reserve Factor
            </span>
            <span className="text-base font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {formatPercent((reserveFactor ?? 0) * 100, 0)}
            </span>
          </div>
        </Card>
      )}
      {riskKind === "ltv" && (
        <Card label="Collateral Factor" accent="#F59E0B">
          <span className="text-3xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formatPercent((collateralFactor ?? 0) * 100, 0)}
          </span>
          <span className="text-[10px] block mt-1" style={{ color: "var(--text-muted)" }}>
            Reserve Factor coming with SDK
          </span>
        </Card>
      )}
      {riskKind === "rf" && (
        <Card label="Reserve Factor" accent="#F59E0B">
          <span className="text-3xl font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {formatPercent((reserveFactor ?? 0) * 100, 0)}
          </span>
        </Card>
      )}
      {riskKind === "none" && (
        <Card label="Risk Parameters" accent="var(--card-border)">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Caps · Reserve Factor · LTV
          </span>
          <span className="text-[10px] block mt-1" style={{ color: "var(--text-muted)" }}>
            Coming with SDK integration
          </span>
        </Card>
      )}
    </div>
  )
}
