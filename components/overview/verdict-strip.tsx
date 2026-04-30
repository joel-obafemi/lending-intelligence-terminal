/**
 * Verdict Strip — Zone 1 of the Sector Overview rebuild.
 *
 * Five-card row + a one-line auto-generated summary sentence beneath. The
 * cards are dense (no sparklines) so the strip reads as a verdict band, not
 * a metric grid. The Total Supplied / Borrows / TVL deltas + sparklines now
 * live in the Composition Strip below.
 */
import { TrendingUp, TrendingDown, Activity, Percent, Receipt } from "lucide-react"
import { formatUSD, formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "./methodology-tooltip"

interface VerdictCardProps {
  label: string
  value: string
  caption?: string
  accent: string
  icon: React.ReactNode
  methodologyKey?: string
}

function VerdictCard({ label, value, caption, accent, icon, methodologyKey }: VerdictCardProps) {
  return (
    <div className="tui-card bg-card-bg border border-card-border rounded-lg px-4 py-3 flex flex-col gap-1 relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ backgroundColor: accent }}
      />
      <div className="pl-2 flex items-center gap-1.5">
        <span style={{ color: accent }}>{icon}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: accent }}
        >
          {label}
        </span>
        <MethodologyTooltip methodologyKey={methodologyKey} />
      </div>
      <div className="pl-2">
        <span className="text-lg font-semibold text-text-primary tabular-nums">{value}</span>
      </div>
      {caption && (
        <div className="pl-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {caption}
        </div>
      )}
    </div>
  )
}

interface Props {
  totalTvlUsd: number
  totalBorrowedUsd: number
  utilizationPct: number
  realYieldSpreadPct: number | null
  takeRatePct: number
  /** Auto-generated one-line summary built via `sectorVerdictSentence`. */
  summary: string
}

export function VerdictStrip({
  totalTvlUsd,
  totalBorrowedUsd,
  utilizationPct,
  realYieldSpreadPct,
  takeRatePct,
  summary,
}: Props) {
  const spreadStr =
    realYieldSpreadPct == null
      ? "—"
      : `${realYieldSpreadPct >= 0 ? "+" : "−"}${Math.abs(realYieldSpreadPct).toFixed(2)} pp`
  const spreadCaption =
    realYieldSpreadPct == null
      ? undefined
      : realYieldSpreadPct >= 0
      ? "stables yield over T-bills"
      : "stables yield under T-bills"

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <VerdictCard
          label="Sector TVL"
          value={formatUSD(totalTvlUsd)}
          caption="unborrowed liquidity"
          accent="#B44AFF"
          icon={<TrendingUp size={12} strokeWidth={2.5} />}
          methodologyKey="sector-tvl-by-protocol"
        />
        <VerdictCard
          label="Active Borrows"
          value={formatUSD(totalBorrowedUsd)}
          caption="outstanding debt"
          accent="#EC4899"
          icon={<TrendingDown size={12} strokeWidth={2.5} />}
          methodologyKey="sector-borrows-by-protocol"
        />
        <VerdictCard
          label="Sector Utilization"
          value={formatPercent(utilizationPct, 1)}
          caption="borrows ÷ supplied"
          accent="#FF6B35"
          icon={<Activity size={12} strokeWidth={2.5} />}
          methodologyKey="sector-utilization-headline"
        />
        <VerdictCard
          label="Real Yield Spread"
          value={spreadStr}
          caption={spreadCaption}
          accent="#10B981"
          icon={<Percent size={12} strokeWidth={2.5} />}
          methodologyKey="sector-real-yield-spread"
        />
        <VerdictCard
          label="Sector Take Rate"
          value={formatPercent(takeRatePct, 2)}
          caption="annualized rev ÷ TVL"
          accent="#5B7FFF"
          icon={<Receipt size={12} strokeWidth={2.5} />}
          methodologyKey="sector-take-rate"
        />
      </div>
      <p
        className="text-[12px] leading-relaxed px-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {summary}
      </p>
    </div>
  )
}
