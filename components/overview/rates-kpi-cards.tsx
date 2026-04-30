/**
 * Rates page Verdict band — three KPI cards summarizing the best
 * supply / best borrow / tightest spread across the entire matrix.
 */
import { formatPercent } from "@/lib/utils"
import type { RateKpis } from "@/lib/rates-kpi"

interface Props {
  kpis: RateKpis
}

export function RatesKpiCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label="Best supply APY"
        value={kpis.bestSupply ? formatPercent(kpis.bestSupply.value, 2) : "—"}
        attribution={
          kpis.bestSupply
            ? `${kpis.bestSupply.asset} on ${kpis.bestSupply.protocolName}`
            : "no data"
        }
        accent={kpis.bestSupply?.protocolColor ?? "var(--accent-orange)"}
      />
      <KpiCard
        label="Best borrow APY"
        value={kpis.bestBorrow ? formatPercent(kpis.bestBorrow.value, 2) : "—"}
        attribution={
          kpis.bestBorrow
            ? `${kpis.bestBorrow.asset} on ${kpis.bestBorrow.protocolName}`
            : "no data"
        }
        accent={kpis.bestBorrow?.protocolColor ?? "var(--accent-orange)"}
      />
      <KpiCard
        label="Tightest spread (borrow − supply)"
        value={
          kpis.tightestSpread ? formatPercent(kpis.tightestSpread.spreadPct, 2) : "—"
        }
        attribution={
          kpis.tightestSpread
            ? `${kpis.tightestSpread.asset} on ${kpis.tightestSpread.protocolName}`
            : "no data"
        }
        accent={kpis.tightestSpread?.protocolColor ?? "var(--accent-orange)"}
      />
    </div>
  )
}

interface CardProps {
  label: string
  value: string
  attribution: string
  accent: string
}

function KpiCard({ label, value, attribution, accent }: CardProps) {
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded p-4"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-semibold tabular-nums mt-1"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      <div
        className="text-[11px] mt-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {attribution}
      </div>
    </div>
  )
}
