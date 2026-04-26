import { Activity, TrendingDown, DollarSign } from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import { RevenueBarChart } from "@/components/overview/revenue-bar-chart"
import { LargestEventsTable } from "@/components/overview/largest-events-table"
import { CollateralLiquidationTable } from "@/components/overview/collateral-liquidation-table"
import { loadLiquidations } from "@/lib/liquidations"
import { loadOverview } from "@/lib/overview"
import { PROTOCOLS } from "@/lib/protocols"
import { formatUSD, formatPercent } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function EventsPage() {
  // 90-day window matches the quarterly Lending Pulse cadence.
  const [liq, overview] = await Promise.all([loadLiquidations(90), loadOverview()])

  if (!liq.available) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-4">
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted">
          Stress Events
        </h1>
        <div
          className="tui-card bg-card-bg border border-card-border rounded p-6 text-sm text-text-muted"
        >
          <p className="mb-2" style={{ color: "var(--danger)" }}>
            LIQUIDATOR_DATABASE_URL is not configured.
          </p>
          <p>
            The Stress Events page reads from the liquidator-economy Neon DB. Add
            <code className="mx-1 px-1" style={{ background: "var(--card-hover)" }}>LIQUIDATOR_DATABASE_URL</code>
            to <code className="px-1" style={{ background: "var(--card-hover)" }}>.env</code> and restart the
            dev server.
          </p>
        </div>
      </div>
    )
  }

  // Normalize volume-vs-TVL across protocols. Pairs current TVL with the
  // period's liquidation volume for a same-scale comparison.
  const volumeVsTvl = PROTOCOLS.map((p) => {
    const proto = liq.protocols.find((r) => r.slug === p.slug)
    const overviewRow = overview.protocols.find((r) => r.slug === p.slug)
    const tvl = overviewRow?.tvl ?? 0
    const volume = proto?.volumeUsd ?? 0
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      volumeUsd: volume,
      tvlUsd: tvl,
      volumePctOfTvl: tvl > 0 ? (volume / tvl) * 100 : 0,
      count: proto?.count ?? 0,
    }
  })

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Stress Events
        </h1>
        <p className="text-xs text-text-muted">
          Liquidation activity across Aave V3, Spark, Morpho, and Fluid for the past 90 days.
          Source: Datum Labs Liquidator Economy pipeline.
        </p>
      </div>

      {/* Aggregate metric cards (all metrics summed over the trailing 90 days).
          Bad debt was removed: the upstream pipeline only populates the column
          for Morpho Blue, so the figure is misleading at a sector-wide level. */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted mb-2">
          Trailing 90 days
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            label="Liquidation Volume (90d)"
            value={liq.snapshot.totalVolumeUsd}
            icon={<Activity size={12} strokeWidth={2.5} />}
            accentColor="#FF6B35"
          />
          <MetricCard
            label="Events (90d)"
            value={liq.snapshot.totalCount}
            format="count"
            icon={<TrendingDown size={12} strokeWidth={2.5} />}
            accentColor="#5B7FFF"
          />
          <MetricCard
            label="Liquidator Gross Profit (90d)"
            value={liq.snapshot.totalGrossProfitUsd}
            icon={<DollarSign size={12} strokeWidth={2.5} />}
            accentColor="#10B981"
          />
        </div>
      </div>

      {/* Weekly volume by protocol + Volume / TVL normalization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueBarChart
          title="Liquidation Volume by Protocol"
          data={liq.weeklyVolume}
        />

        <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
          <div
            className="border-b border-card-border"
            style={{ display: "flex", alignItems: "center", padding: "10px 16px" }}
          >
            <span
              className="text-accent"
              style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
            >
              Volume as % of Current TVL
            </span>
            <span className="ml-3 text-[10px] text-text-muted">
              90-day liquidation volume normalized by today&apos;s TVL
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th className="text-right">Volume (90d)</th>
                  <th className="text-right">TVL</th>
                  <th className="text-right">Volume / TVL</th>
                  <th className="text-right">Events</th>
                  <th style={{ width: "22%" }}>Normalized Bar</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxPct = Math.max(...volumeVsTvl.map((r) => r.volumePctOfTvl), 0.0001)
                  return volumeVsTvl
                    .sort((a, b) => b.volumePctOfTvl - a.volumePctOfTvl)
                    .map((r) => (
                      <tr key={r.slug}>
                        <td>
                          <span
                            className="inline-flex items-center gap-1.5"
                            style={{ color: r.color }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: r.color }}
                            />
                            {r.name}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{formatUSD(r.volumeUsd)}</td>
                        <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {formatUSD(r.tvlUsd)}
                        </td>
                        <td className="text-right tabular-nums">
                          {formatPercent(r.volumePctOfTvl, 2)}
                        </td>
                        <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {r.count.toLocaleString()}
                        </td>
                        <td>
                          <div
                            style={{
                              width: `${(r.volumePctOfTvl / maxPct) * 100}%`,
                              height: "6px",
                              background: r.color,
                              opacity: 0.65,
                              borderRadius: "2px",
                            }}
                          />
                        </td>
                      </tr>
                    ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top collateral by liquidation volume */}
      <CollateralLiquidationTable
        title="Liquidation Concentration by Collateral"
        rows={liq.topCollateralAssets}
      />

      {/* Largest single events */}
      <LargestEventsTable title="Largest 20 Liquidation Events" events={liq.largestEvents} />
    </div>
  )
}
