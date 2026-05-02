"use client"

/**
 * Rates page Verdict strip — four KPI cards summarizing where rates
 * sit right now. Scoped to actionable assets (stables + ETH-family) so
 * long-tail BTC artefacts don't dominate the strip.
 *
 * Cards (left → right):
 *  1. Best supply APY (across stables + ETH+LST+LRT)
 *  2. Best borrow APY (same scope)
 *  3. Real Yield Spread (stablecoin lending APY − 4-week T-bill)
 *  4. Stablecoin rate dispersion (max−min supply APY across protocols)
 */
import { LineChart, Line, ResponsiveContainer } from "recharts"
import { formatPercent } from "@/lib/utils"
import type { RateKpis } from "@/lib/rates-kpi"

interface Props {
  kpis: RateKpis
  /** Optional 30-day stablecoin lending APY history for the third card.
   *  Each point is a daily reading. Dropped when no data is available. */
  realYieldSpreadSparkline?: Array<{ timestamp: number; value: number }>
  /** Optional latest spread snapshot for the third card (percent). */
  realYieldSpreadPct?: number | null
  /** Optional 30-day max-minus-min stablecoin supply APY series for
   *  the dispersion card sparkline. Dropped when no data. */
  stableDispersionSparkline?: Array<{ timestamp: number; value: number }>
}

export function RatesKpiCards({
  kpis,
  realYieldSpreadSparkline,
  realYieldSpreadPct,
  stableDispersionSparkline,
}: Props) {
  const supplyLabel = kpis.bestSupply
    ? `${kpis.bestSupply.asset} on ${kpis.bestSupply.protocolName}`
    : "no data"
  const borrowLabel = kpis.bestBorrow
    ? `${kpis.bestBorrow.asset} on ${kpis.bestBorrow.protocolName}`
    : "no data"
  const dispersionLabel = kpis.stableDispersion
    ? `${kpis.stableDispersion.asset} · ${kpis.stableDispersion.topProtocolName} ${kpis.stableDispersion.topApyPct.toFixed(2)}% / ${kpis.stableDispersion.bottomProtocolName} ${kpis.stableDispersion.bottomApyPct.toFixed(2)}%`
    : "no data"

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        label="Best supply APY"
        value={kpis.bestSupply ? formatPercent(kpis.bestSupply.value, 2) : "—"}
        attribution={supplyLabel}
        accent={kpis.bestSupply?.protocolColor ?? "var(--accent-orange)"}
      />
      <KpiCard
        label="Best borrow APY"
        value={kpis.bestBorrow ? formatPercent(kpis.bestBorrow.value, 2) : "—"}
        attribution={borrowLabel}
        accent={kpis.bestBorrow?.protocolColor ?? "var(--accent-orange)"}
      />
      <KpiCard
        label="Real yield spread"
        value={
          realYieldSpreadPct != null
            ? formatPercent(realYieldSpreadPct, 2)
            : "—"
        }
        attribution="Stablecoin lending APY − 4-week T-bill"
        accent={(realYieldSpreadPct ?? 0) >= 0 ? "var(--success)" : "var(--danger)"}
        sparkline={realYieldSpreadSparkline}
      />
      <KpiCard
        label="Stablecoin rate dispersion"
        value={
          kpis.stableDispersion
            ? formatPercent(kpis.stableDispersion.spreadPct, 2)
            : "—"
        }
        attribution={dispersionLabel}
        accent="var(--accent-blue)"
        sparkline={stableDispersionSparkline}
      />
    </div>
  )
}

interface CardProps {
  label: string
  value: string
  attribution: string
  accent: string
  sparkline?: Array<{ timestamp: number; value: number }>
}

function KpiCard({ label, value, attribution, accent, sparkline }: CardProps) {
  const hasSpark = sparkline && sparkline.length > 1
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded p-4"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </div>
        {hasSpark && (
          <div className="w-[64px] h-[20px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={accent}
                  strokeWidth={1.25}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div
        className="text-2xl font-semibold tabular-nums mt-1"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      <div
        className="text-[11px] mt-0.5 truncate"
        style={{ color: "var(--text-muted)" }}
        title={attribution}
      >
        {attribution}
      </div>
    </div>
  )
}
