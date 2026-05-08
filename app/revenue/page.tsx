import { loadOverview } from "@/lib/overview"
import { loadLiquidations } from "@/lib/liquidations"
import { loadRevenueDecomp } from "@/lib/revenue-decomp"
import { buildTakeRateSeries } from "@/lib/take-rate"
import {
  computeRevenueVerdict,
  revenueVerdictSentence,
} from "@/lib/revenue-verdict"
import { RevenueSnapshotCards } from "@/components/overview/revenue-snapshot-cards"
import { RevenueBarChart } from "@/components/overview/revenue-bar-chart"
import { CumulativeRevenueChart } from "@/components/overview/cumulative-revenue-chart"
import { RevenueDecompTabs } from "@/components/overview/revenue-decomp-tabs"
import { RevenueDecompCards } from "@/components/overview/revenue-decomp-cards"
import { RevenueVerdictStrip } from "@/components/overview/revenue-verdict-strip"
import { RevenueSourceSplitRow } from "@/components/overview/revenue-source-split-row"
import { TakeRateComparisonChart } from "@/components/overview/take-rate-comparison-chart"
import { MethodologyTooltip } from "@/components/overview/methodology-tooltip"
import { AsOfFooter } from "@/components/overview/as-of-footer"
import { CiteThisPage } from "@/components/overview/cite-this-page"

// ISR — 15 min cache. Fee data is daily-resolution from DefiLlama; a
// 15-min revalidation window keeps trend charts fresh enough while
// making nav-back-to-/revenue instant.
export const revalidate = 900
export const maxDuration = 60

export default async function RevenuePage() {
  const [data, liq, decomp] = await Promise.all([
    loadOverview(),
    loadLiquidations(90),
    loadRevenueDecomp(90, 365),
  ])

  const verdict = computeRevenueVerdict(data, decomp)
  const insight = revenueVerdictSentence(verdict)
  const takeRateSeries = buildTakeRateSeries(data, 365)

  // Trend charts default to ~12 monthly buckets — captures the current
  // cycle without dragging stale 24-month context. Cumulative charts
  // get the longer 24-month default per the audit rationale.
  const trendBucketLimits = { month: 12, week: 12, quarter: 4 }
  const cumulativeBucketLimits = { month: 24, week: 24, quarter: 8 }

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

      {/* Verdict band — sector aggregates + biggest mover. */}
      <RevenueVerdictStrip verdict={verdict} />

      {insight && (
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {insight}
        </p>
      )}

      {/* Per-protocol revenue snapshot cards (now with sparklines, MoM
          deltas, and the Morpho 0% capture explainer). */}
      <RevenueSnapshotCards
        rows={data.revenueSnapshot}
        momByProtocol={verdict.perProtocolMom}
      />

      {/* Source Split — promoted out of the per-card bottom strip into
          its own full-width row above the bar/cumulative charts. */}
      <RevenueSourceSplitRow rows={decomp.protocols} windowDays={decomp.windowDays} />

      {/* Take Rate Comparison — the page's signature long-term lens. */}
      <TakeRateComparisonChart data={takeRateSeries} defaultRange={30} />

      {/* Two charts side-by-side: weekly fees + cumulative fees. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueBarChart
          title="Fees by Protocol"
          data={data.feesWeeklySeries}
          methodologyKey="revenue-weekly-fees"
          bucketLimits={trendBucketLimits}
          enableShareToggle
        />
        <CumulativeRevenueChart
          title="Cumulative Fees by Protocol"
          data={data.cumulativeFeesSeries}
          methodologyKey="revenue-cumulative"
          bucketLimits={cumulativeBucketLimits}
        />
      </div>

      {/* Per-protocol decomposition — tabs + single chart, now with
          12-month chart history (audit's largest single-chart fix). */}
      <div>
        <h2 className="text-[11px] uppercase tracking-[0.15em] text-text-muted mb-3">
          Revenue by Recipient · per protocol
        </h2>
        <RevenueDecompTabs protocols={decomp.protocols} />
      </div>

      {/* Per-protocol decomposition cards — kept below the tabs as a
          summary-vs-detail split. */}
      <RevenueDecompCards rows={decomp.protocols} windowDays={decomp.windowDays} />

      {/* Liquidation volume comparison — defaults to 12 months so the
          weekly spikes contextualize against a meaningful range. */}
      {liq.available && (
        <RevenueBarChart
          title="Liquidation Volume by Protocol"
          data={liq.weeklyVolume}
          methodologyKey="revenue-liquidation-volume"
          bucketLimits={trendBucketLimits}
        />
      )}

      {/* Methodology footer (Phase E voice). */}
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

      <CiteThisPage
        pageTitle="Revenue & Protocol Economics"
        pageUrl="https://lending-intelligence-terminal.vercel.app/revenue"
      />
      <AsOfFooter
        timestamp={decomp.fetchedAt}
        source="DefiLlama /summary/fees + Liquidator Economy DB · live load"
      />
    </div>
  )
}
