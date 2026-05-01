/**
 * Risk Verdict Strip — Zone 1 of the Risk page foundation.
 *
 * Three-card row + auto-generated summary line. Cards:
 *   - Stablecoin Debt Share (have it from sector overview)
 *   - Oracle Concentration (top vendor + share)
 *   - Liquidation Intensity 90d (max protocol volume / TVL)
 *
 * The Top-10 Borrower Share card is intentionally not here yet. It lands
 * once the borrower-discovery data layer ships — until then we don't have
 * wallet-level data and would be guessing.
 */
import { Layers, Eye, Activity } from "lucide-react"
import { formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { ORACLE_COLOR, type OracleVendor } from "@/lib/oracles"

interface CardProps {
  label: string
  value: string
  caption?: string
  accent: string
  icon: React.ReactNode
  methodologyKey?: string
}

function VerdictCard({ label, value, caption, accent, icon, methodologyKey }: CardProps) {
  // No overflow:hidden so the methodology popover (which now portals via
  // document.body anyway) is consistent with the Sector Verdict cards.
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded-lg px-4 py-3 flex flex-col gap-1 relative"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: accent }}>{icon}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.12em]"
          style={{ color: accent }}
        >
          {label}
        </span>
        <MethodologyTooltip methodologyKey={methodologyKey} />
      </div>
      <span className="text-lg font-semibold text-text-primary tabular-nums">{value}</span>
      {caption && (
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {caption}
        </span>
      )}
    </div>
  )
}

interface Props {
  stablecoinDebtSharePct: number
  topOracleVendor: OracleVendor
  topOracleSharePct: number
  unclassifiedPct: number
  peakIntensityName: string
  peakIntensityPct: number
  summary: string
}

export function RiskVerdictStrip({
  stablecoinDebtSharePct,
  topOracleVendor,
  topOracleSharePct,
  unclassifiedPct,
  peakIntensityName,
  peakIntensityPct,
  summary,
}: Props) {
  const oracleColor = ORACLE_COLOR[topOracleVendor]
  const unclassifiedCaption =
    unclassifiedPct > 1
      ? `top vendor on priced collateral · ${unclassifiedPct.toFixed(0)}% unclassified`
      : "top vendor on priced collateral"
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <VerdictCard
          label="Stablecoin Debt Share"
          value={formatPercent(stablecoinDebtSharePct, 1)}
          caption="of cross-protocol borrows"
          accent="#F59E0B"
          icon={<Layers size={12} strokeWidth={2.5} />}
          methodologyKey="risk-stablecoin-debt-share"
        />
        <VerdictCard
          label="Oracle Concentration"
          value={`${topOracleVendor} ${formatPercent(topOracleSharePct, 0)}`}
          caption={unclassifiedCaption}
          accent={oracleColor}
          icon={<Eye size={12} strokeWidth={2.5} />}
          methodologyKey="risk-oracle-concentration"
        />
        <VerdictCard
          label="Liquidation Intensity 90d"
          value={formatPercent(peakIntensityPct, 1)}
          caption={`peak: ${peakIntensityName} liquidations vs TVL`}
          accent="#D6322E"
          icon={<Activity size={12} strokeWidth={2.5} />}
          methodologyKey="risk-liquidation-intensity"
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
