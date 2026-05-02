/**
 * FluidPenaltyCallout — dedicated stat card for the per-vault Liquidation
 * Penalty.
 *
 * Fluid's headline marketing claim is "near-zero liquidation penalty"
 * relative to other lenders. Burying this number in the Vault Info row
 * underplays it; this component lifts it to a single bold tile above
 * the info card, with a sector-context line that anchors the comparison.
 *
 * Render only when `liquidationPenalty` is present and >= 0. Anything
 * else falls back to the embedded row in `FluidVaultInfoCard`.
 */
import { formatPercent } from "@/lib/utils"

interface Props {
  /** 0-1 fraction. */
  liquidationPenalty: number
  /** Optional sector context — typical penalty paid on the other major
   *  Ethereum lending protocols (Aave V3 / Spark / Morpho averages,
   *  in percent units). When supplied the sub-line surfaces the gap. */
  sectorAvgPenaltyPct?: number | null
}

export function FluidPenaltyCallout({ liquidationPenalty, sectorAvgPenaltyPct }: Props) {
  const penaltyPct = liquidationPenalty * 100
  const hasContext =
    sectorAvgPenaltyPct != null &&
    Number.isFinite(sectorAvgPenaltyPct) &&
    sectorAvgPenaltyPct > 0
  const gap = hasContext ? sectorAvgPenaltyPct! - penaltyPct : null

  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded-lg flex flex-col gap-1 relative overflow-hidden"
      style={{ padding: "16px" }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ backgroundColor: "var(--accent-orange)" }}
      />
      <div className="flex items-baseline justify-between pl-2">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: "var(--accent-orange)" }}
        >
          Liquidation Penalty
        </span>
        <span
          className="text-[9px] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded"
          style={{
            background: "rgba(255, 138, 61, 0.10)",
            color: "var(--accent-orange)",
            border: "1px solid rgba(255, 138, 61, 0.25)",
          }}
        >
          Fluid sector-low
        </span>
      </div>
      <div className="pl-2 mt-1 flex items-baseline gap-3">
        <span
          className="text-3xl font-semibold tabular-nums"
          style={{ color: "var(--accent-orange)" }}
        >
          {formatPercent(penaltyPct, 2)}
        </span>
        <span
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          paid by borrowers when this vault is liquidated
        </span>
      </div>
      {hasContext && gap != null && gap > 0 && (
        <div
          className="pl-2 mt-1 text-[11px] leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          <span style={{ color: "var(--success)" }}>↓</span>{" "}
          {formatPercent(gap, 2)} below the {formatPercent(sectorAvgPenaltyPct!, 2)}{" "}
          cross-protocol average (Aave V3 / Spark / Morpho).
        </div>
      )}
    </div>
  )
}
