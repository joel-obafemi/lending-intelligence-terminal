import { loadOverview } from "@/lib/overview"
import { loadLiquidations } from "@/lib/liquidations"
import { loadRevenueDecomp } from "@/lib/revenue-decomp"
import { RevenueSnapshotCards } from "@/components/overview/revenue-snapshot-cards"
import { RevenueBarChart } from "@/components/overview/revenue-bar-chart"
import { CumulativeRevenueChart } from "@/components/overview/cumulative-revenue-chart"
import { RevenueDecompTabs } from "@/components/overview/revenue-decomp-tabs"
import { RevenueDecompCards } from "@/components/overview/revenue-decomp-cards"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function RevenuePage() {
  const [data, liq, decomp] = await Promise.all([
    loadOverview(),
    loadLiquidations(90),
    loadRevenueDecomp(90),
  ])

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1 flex items-center gap-1.5">
          Revenue &amp; Protocol Economics
          <MethodologyTooltip
            text={
              "Daily fees, cumulative revenue, and recipient split across the four Ethereum lending protocols. " +
              "Per-protocol Rev/TVL annualization in the cards. Authoritative recipient split (supply-side / protocol / holders) " +
              "from DefiLlama; liquidation-source share estimated from the Liquidator Economy DB."
            }
            source="DefiLlama /summary/fees + Liquidator Economy DB"
          />
        </h1>
        <p className="text-xs text-text-muted">
          What each protocol earned, where it went, and how it compares.
        </p>
      </div>

      {/* Verdict band — 4 per-protocol revenue snapshot cards (existing) */}
      <RevenueSnapshotCards rows={data.revenueSnapshot} />

      {/* Two charts side-by-side: weekly fees + cumulative fees. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueBarChart
          title="Fees by Protocol"
          data={data.feesWeeklySeries}
          methodologyKey="revenue-weekly-fees"
        />
        <CumulativeRevenueChart
          title="Cumulative Fees by Protocol"
          data={data.cumulativeFeesSeries}
          methodologyKey="revenue-cumulative"
        />
      </div>

      {/* Per-protocol decomposition — tabs + single chart instead of 4 stacked.
          Defaults to the first protocol; URL-synced via `?d=<slug>`. */}
      <div>
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-text-muted mb-3">
          Revenue by Recipient · per protocol
        </h2>
        <RevenueDecompTabs protocols={decomp.protocols} />
      </div>

      {/* Per-protocol decomposition cards — kept below the tabs as a
          summary-vs-detail split. */}
      <RevenueDecompCards rows={decomp.protocols} windowDays={decomp.windowDays} />

      {/* Liquidation volume comparison — surfaces revenue/liquidation
          correlation in one chart. */}
      {liq.available && (
        <RevenueBarChart
          title="Liquidation Volume by Protocol · For Comparison"
          data={liq.weeklyVolume}
          methodologyKey="revenue-liquidation-volume"
        />
      )}

      {/* Methodology note collapsed into a footer (Phase E voice). */}
      <div
        className="text-[11px] leading-relaxed border border-card-border rounded px-4 py-3"
        style={{ background: "var(--card-bg)", color: "var(--text-muted)" }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.12em] mr-2"
          style={{ color: "var(--accent-orange)", fontWeight: 700 }}
        >
          Methodology
        </span>
        {decomp.methodology}
      </div>
    </div>
  )
}
