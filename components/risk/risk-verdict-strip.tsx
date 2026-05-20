/**
 * Risk Verdict Strip — Zone 1 of the Risk page foundation.
 *
 * Four-card row + auto-generated summary line. Cards:
 *   - Stablecoin Debt Share (have it from sector overview)
 *   - Oracle Concentration (top vendor + share)
 *   - Liquidation Intensity 90d (max protocol volume / TVL)
 *   - Days Since Last Bad Debt (curated registry; the longer the
 *     counter runs the stronger the protocol-level safety story)
 *
 * The Top-10 Borrower Share card is intentionally not here yet. It lands
 * once the borrower-discovery data layer ships — until then we don't have
 * wallet-level data and would be guessing.
 */
import { Layers, Eye, Activity, ShieldCheck } from "lucide-react"
import { formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { ORACLE_COLOR, type OracleVendor } from "@/lib/oracles"
import type { BadDebtSummary } from "@/lib/bad-debt"

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
  badDebt: BadDebtSummary
}

function badDebtCaption(bd: BadDebtSummary): string {
  if (bd.daysSince == null || bd.latest == null) {
    return "no protocol-level incident on file"
  }
  const date = new Date(`${bd.latest.date}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
  )
  return `last incident ${date} · ${bd.latest.protocol} ${bd.latest.asset}`
}

export function RiskVerdictStrip({
  stablecoinDebtSharePct,
  topOracleVendor,
  topOracleSharePct,
  unclassifiedPct,
  peakIntensityName,
  peakIntensityPct,
  badDebt,
}: Props) {
  const oracleColor = ORACLE_COLOR[topOracleVendor]
  const unclassifiedCaption =
    unclassifiedPct > 1
      ? `top vendor on priced collateral · ${unclassifiedPct.toFixed(0)}% unclassified`
      : "top vendor on priced collateral"
  const badDebtValue =
    badDebt.daysSince == null
      ? "—"
      : badDebt.daysSince === 0
      ? "today"
      : `${badDebt.daysSince}`
  // Tone: green when the streak is long (>180 days), yellow under a
  // month, neutral otherwise. Counter increments daily; tone updates
  // automatically on subsequent renders.
  const badDebtAccent =
    badDebt.daysSince == null
      ? "var(--text-muted)"
      : badDebt.daysSince > 180
      ? "var(--success)"
      : badDebt.daysSince < 30
      ? "var(--accent-yellow)"
      : "#5B7FFF"
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        <VerdictCard
          label="Days Since Last Bad Debt"
          value={
            badDebt.daysSince == null
              ? "—"
              : `${badDebtValue}${badDebt.daysSince === 0 ? "" : badDebt.daysSince === 1 ? " day" : " days"}`
          }
          caption={badDebtCaption(badDebt)}
          accent={badDebtAccent}
          icon={<ShieldCheck size={12} strokeWidth={2.5} />}
          methodologyKey="risk-days-since-bad-debt"
        />
      </div>
    </div>
  )
}
