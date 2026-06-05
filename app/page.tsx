import { VerdictStrip } from "@/components/overview/verdict-strip"
import { MarketShareHero } from "@/components/overview/market-share-hero"
import { CompositionStrip } from "@/components/overview/composition-strip"
import { LdrChart } from "@/components/overview/ldr-chart"
import { NetFlowsSankey } from "@/components/overview/net-flows-sankey"
import { CompositionDonuts } from "@/components/overview/composition-donuts"
import { TopMarketsCrossProtocolTable } from "@/components/overview/top-markets-cross-protocol-table"
import { CiteThisPage } from "@/components/overview/cite-this-page"
import { AsOfFooter } from "@/components/overview/as-of-footer"
import { FeaturedIssueBanner } from "@/components/featured-issue-banner"
import { loadSectorOverview } from "@/lib/sector-snapshot"
import { getFeaturedIssue } from "@/lib/reports/featuredIssue"
import {
  buildDailyDeltaTriple,
  buildHeroLenses,
  netDeposits30dByProtocol,
  sectorTakeRatePct,
  sectorUtilizationDailySeries,
  sectorUtilizationPct,
} from "@/lib/sector-derived"

// ISR — 1 hour. The underlying sector snapshot refreshes once daily at
// 01:00 UTC (Cloudflare-triggered cron). Crucially, this page now reads
// EVERYTHING (incl. top markets + real-yield) from that Neon snapshot —
// no live DefiLlama `no-store` fetches in the render path — so Next can
// actually statically cache + ISR it. Previously two live loaders forced
// the whole page to render dynamically on every request, which is what
// drove the Vercel Active-CPU + Fast-Origin-Transfer bill.
export const revalidate = 3600
export const maxDuration = 60

export default async function OverviewPage() {
  const [overview, featured] = await Promise.all([
    loadSectorOverview(),
    getFeaturedIssue().catch(() => null),
  ])
  const data = overview.payload
  // Read from the snapshot payload. Falls back to empty/null for snapshots
  // written before these fields were folded in (until the next cron run).
  const topMarkets = data.topMarketsCrossProtocol ?? []
  const realYield = data.realYieldSpread ?? null
  const featuredSummary = featured
    ? {
        slug: featured.slug,
        url: featured.url,
        isFresh: featured.isFresh,
        socialImageUrl: featured.socialImageUrl,
        title: featured.record.frontmatter.title,
        theme: featured.record.frontmatter.theme,
        tagline: featured.record.frontmatter.tagline,
        issueLabel: featured.record.frontmatter.issue_label,
        publicationDate: featured.record.frontmatter.publication_date,
        readingTimeMin: featured.record.frontmatter.reading_time_min,
        coverImage: featured.record.frontmatter.cover_image,
      }
    : null
  const { snapshot, protocols, revenueSnapshot } = data

  // ─── Verdict strip inputs ─────────────────────────────────────────────
  const utilizationPct = sectorUtilizationPct(data)
  const takeRatePct = sectorTakeRatePct(data)
  const realYieldSpreadPct = realYield?.current.spreadPct ?? null

  // Daily series → MoM/YoY pp + sparkline for the rate cards.
  const utilDaily = sectorUtilizationDailySeries(data)
  const utilizationDeltas = buildDailyDeltaTriple(utilDaily)
  const realYieldDailySeries =
    realYield?.history
      .filter((p) => p.spreadPct != null && Number.isFinite(p.spreadPct))
      .map((p) => ({ timestamp: p.timestamp, value: p.spreadPct as number })) ?? []
  const realYieldDeltas =
    realYieldDailySeries.length > 0
      ? buildDailyDeltaTriple(realYieldDailySeries)
      : null

  // ─── Hero lens series + insight ───────────────────────────────────────
  const hero = buildHeroLenses(data)

  // ─── Composition strip net-deposits row ──────────────────────────────
  // Trailing-30d net deposits per protocol feed the per-card NET DEPOSITS 30D
  // line. The full time series renders in the Sankey Net Flows chart below.
  const netDeps30d = netDeposits30dByProtocol(data.netFlowWeeklySeries)

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-6">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Sector Overview
        </h1>
        <p className="text-xs text-text-muted">
          Aggregate metrics across {snapshot.protocolCount} Ethereum lending protocols. Source:
          DefiLlama, the Liquidator Economy DB, and FRED.
        </p>
      </div>

      {/* Featured-issue banner — discovery hook for the latest report.
          Dismissible per slug via 7-day cookie. Renders nothing when no
          issue is published or the banner has been dismissed. */}
      <FeaturedIssueBanner featured={featuredSummary} />

      {/* Zone 1 — Verdict strip (3 scale + 3 rate cards + summary) */}
      <VerdictStrip
        totalSuppliedUsd={snapshot.totalSupplied}
        totalSuppliedDeltas={snapshot.suppliedDeltas}
        totalBorrowedUsd={snapshot.totalBorrowed}
        totalBorrowedDeltas={snapshot.borrowedDeltas}
        availableLiquidityUsd={snapshot.totalTvl}
        availableLiquidityDeltas={snapshot.tvlDeltas}
        utilizationPct={utilizationPct}
        utilizationDeltas={{
          changeMoM: utilizationDeltas.changeMoM,
          changeYoY: utilizationDeltas.changeYoY,
          sparkline: utilizationDeltas.sparkline,
        }}
        realYieldSpreadPct={realYieldSpreadPct}
        realYieldDeltas={
          realYieldDeltas
            ? {
                changeMoM: realYieldDeltas.changeMoM,
                changeYoY: realYieldDeltas.changeYoY,
                sparkline: realYieldDeltas.sparkline,
              }
            : null
        }
        takeRatePct={takeRatePct}
        sectorLdrPct={snapshot.sectorLdr}
      />

      {/* Zone 2 — Hero: Market Share with Borrows / Supply / Available
          toggle. Methodology key + insight line both swap with the lens. */}
      <MarketShareHero
        borrowsShare={hero.borrowsShare}
        supplyShare={hero.supplyShare}
        availableShare={hero.availableShare}
        borrowsUsd={hero.borrowsUsd}
        supplyUsd={hero.supplyUsd}
        availableUsd={hero.availableUsd}
      />

      {/* Zone 3 — Composition Strip · 3 columns × 2 rows */}
      <CompositionStrip
        protocols={protocols}
        revenueSnapshot={revenueSnapshot}
        netDeposits30d={netDeps30d}
      />

      {/* Zone 3.5 — Loan-to-Deposit Ratio over time, per protocol +
          sector average dashed. Same source data as the Sector
          Utilization sparkline in the Verdict strip; this surfaces the
          per-protocol breakdown the §06.4 narrative leans on. */}
      <LdrChart
        utilizationSeries={data.utilizationSeries}
        supplySeries={data.supplySeries}
        borrowedSeries={data.borrowedSeries}
      />

      {/* Zone 4 — Net Supply Flows · Sankey, three columns
          (asset inflow → protocol net → asset outflow), W / M / Q toggle. */}
      {data.netFlowsSankey && (
        <NetFlowsSankey
          title="Net Supply Flows"
          windows={data.netFlowsSankey}
          methodologyKey="sector-net-flows"
        />
      )}

      {/* Zone 5 — Composition donuts (totals reconciled to Verdict cards;
          period picker drives both donuts off historicalBuckets) */}
      <CompositionDonuts
        collateral={data.topCollateralAssets}
        borrowed={data.topBorrowedAssets}
        totalSuppliedUsd={snapshot.totalSupplied}
        totalBorrowedUsd={snapshot.totalBorrowed}
        historicalBuckets={data.historicalBuckets}
      />

      {/* Zone 6 — Top 10 markets across protocols */}
      <TopMarketsCrossProtocolTable
        title="Top 10 Markets Across All Protocols"
        markets={topMarkets}
        historicalBuckets={data.historicalBuckets}
      />

      {/* Zone 7 — Cite this page (the rest of the reports footer is removed
          until a real issue is ready to publish). */}
      <CiteThisPage
        pageTitle="Sector Overview"
        pageUrl="https://lending-intelligence-terminal.vercel.app/"
      />

      {/* As-of footer — Sector Overview reads from the daily snapshot
          (refresh: 01:00 UTC via Cloudflare Worker), so this timestamp
          tells a reader how stale the page is vs a freshly-loaded
          /protocols page. The two pages occasionally drift; this is the
          reconciliation signal. */}
      <AsOfFooter
        timestamp={overview.fetchedAt}
        source={
          overview.source === "snapshot"
            ? "daily snapshot · sector_snapshots"
            : "live load · DefiLlama"
        }
      />

      {data.errors.length > 0 && (
        <div
          className="text-[11px] text-text-muted border border-card-border rounded px-3 py-2"
          style={{ background: "var(--card-bg)" }}
        >
          Some protocols failed to load from DefiLlama:{" "}
          {data.errors.map((e) => e.slug).join(", ")}
        </div>
      )}
    </div>
  )
}
