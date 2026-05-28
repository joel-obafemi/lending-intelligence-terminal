/**
 * Risk page foundation — Phase E Week 3 (no-wallet pass).
 *
 * Surfaces the three risk vectors we already have data for:
 *   1. Stablecoin debt share (current + 24-month trend)
 *   2. Oracle concentration (curated map + cross-protocol map table)
 *   3. Liquidation intensity (per-protocol 90-day volume / TVL)
 *
 * Wallet-level risk (Top-10 borrower share, Top-200 positions) lights up
 * in a follow-up pass once the borrower-discovery data layer ships.
 */

import { ExternalLink } from "lucide-react"
import { loadRisk } from "@/lib/risk"
import { loadLiquidations } from "@/lib/liquidations"
import { RiskVerdictStrip } from "@/components/risk/risk-verdict-strip"
import { OracleMapTable } from "@/components/risk/oracle-map-table"
import { StablecoinDebtShareTrend } from "@/components/risk/stablecoin-debt-share-trend"
import { LiquidationIntensityTable } from "@/components/risk/liquidation-intensity-table"
import { LiquidationEfficiencyComparison } from "@/components/risk/liquidation-efficiency-comparison"
import { LiquidatorLeaderboard } from "@/components/risk/liquidator-leaderboard"
import { RevenueBarChart } from "@/components/overview/revenue-bar-chart"
import { CollateralLiquidationTable } from "@/components/overview/collateral-liquidation-table"
import { LargestEventsTable } from "@/components/overview/largest-events-table"
import { AsOfFooter } from "@/components/overview/as-of-footer"
import { FeaturedIssueCallout } from "@/components/featured-issue-callout"
import { CiteThisPage } from "@/components/overview/cite-this-page"

// Live on-chain + DefiLlama reads (cache: 'no-store') make this page
// dynamic regardless of revalidate. force-dynamic stops Next from
// attempting a build-time prerender — when the public RPC rate-limits,
// that prerender blows the 60s static-generation budget and fails the
// whole deploy. Runtime behavior is unchanged (always a cache MISS).
export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function RiskPage() {
  // Risk page now subsumes the two retained modules from the
  // decommissioned /events page (Liquidation Concentration by
  // Collateral + Largest 20 Liquidation Events). Load 90d
  // liquidations alongside the existing risk aggregate.
  const [risk, liq] = await Promise.all([
    loadRisk(),
    loadLiquidations(90),
  ])

  const peakName = risk.peakIntensity?.name ?? "No protocol"
  const peakPct = risk.peakIntensity?.intensityPct ?? 0

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-6">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Collateral & Stress Risk
        </h1>
        <p className="text-xs text-text-muted">
          Sector-level risk indicators across the tracked Ethereum lending protocols.
          Wallet-concentration metrics light up in a later pass once the borrower-discovery
          data layer ships.
        </p>
      </div>

      {/* Zone 1 — Verdict strip (4 cards) */}
      <RiskVerdictStrip
        stablecoinDebtSharePct={risk.stablecoinDebtSharePct}
        topOracleVendor={risk.oracle.topVendor}
        topOracleSharePct={risk.oracle.topSharePct}
        unclassifiedPct={risk.oracle.unclassifiedPct}
        peakIntensityName={peakName}
        peakIntensityPct={peakPct}
        badDebt={risk.badDebt}
      />

      {/* Featured-issue inline callout — links to the latest issue's
          theme essay (rsETH Reckoning for Issue #001). */}
      <FeaturedIssueCallout theme />

      {/* Zone 2 — Stablecoin Debt Share trend */}
      <StablecoinDebtShareTrend
        title="Stablecoin Debt Share · 24 months"
        data={risk.stablecoinDebtShareHistory}
        methodologyKey="risk-stablecoin-debt-share-trend"
      />

      {/* Zone 3 — Oracle Map table */}
      <OracleMapTable
        title="Oracle Map · Who prices what"
        rows={risk.oracleMap}
        concentration={risk.oracle}
        methodologyKey="risk-oracle-map"
      />

      {/* Zone 4 — Liquidation activity (intensity table + weekly volume chart) */}
      {risk.liquidationsAvailable ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <LiquidationIntensityTable
            title="Liquidation Intensity by Protocol"
            rows={risk.intensity}
            methodologyKey="risk-liquidation-intensity"
          />
          <RevenueBarChart
            title="Liquidation Volume by Protocol"
            data={risk.weeklyLiquidationVolume}
            methodologyKey="risk-liquidation-volume-weekly"
            bucketLimits={{ month: 12, week: 12, quarter: 4 }}
            annotationKey="risk-liquidation-volume-weekly"
          />
        </div>
      ) : (
        <div
          className="tui-card bg-card-bg border border-card-border rounded p-4 text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Liquidator Economy DB not configured. Set <code>LIQUIDATOR_DATABASE_URL</code> in
          .env to enable Liquidation Intensity and the weekly volume chart.
        </div>
      )}

      {/* Zone 5 — Liquidation Efficiency comparison. Cross-protocol
          $ collateral seized ÷ $ debt repaid. The empirical version
          of "Fluid pays the lowest penalty". */}
      {risk.liquidationEfficiency.length > 0 && (
        <LiquidationEfficiencyComparison
          rows={risk.liquidationEfficiency}
          periodDays={risk.liquidationEfficiencyPeriodDays}
        />
      )}

      {/* Zone 6 — Liquidator Leaderboard. Top 10 wallets by 90d
          gross profit, with ENS resolution + protocol tags. */}
      {risk.liquidatorLeaderboard.length > 0 && (
        <LiquidatorLeaderboard
          rows={risk.liquidatorLeaderboard}
          periodDays={risk.liquidationEfficiencyPeriodDays}
        />
      )}

      {/* Zone 7 — Liquidation Concentration by Collateral (migrated
          from the decommissioned /events page). Top assets by
          liquidated-debt volume with per-protocol breakdown bars. */}
      {liq.available && liq.topCollateralAssets.length > 0 && (
        <CollateralLiquidationTable
          title="Liquidation Concentration by Collateral · 90d"
          rows={liq.topCollateralAssets}
        />
      )}

      {/* Zone 8 — Largest 20 Liquidation Events (migrated from /events).
          Borrower / liquidator wallets, debt + profit, FLASH tags,
          Etherscan tx links. */}
      {liq.available && liq.largestEvents.length > 0 && (
        <LargestEventsTable
          title="Largest 20 Liquidation Events · 90d"
          events={liq.largestEvents}
        />
      )}

      {/* Footer link to the standalone Liquidator Economy dashboard for deeper liq stats. */}
      <a
        href="https://liquidator-economy-dashboard.vercel.app"
        target="_blank"
        rel="noreferrer"
        className="tui-card bg-card-bg border border-card-border rounded p-4 flex items-center justify-between gap-3"
        style={{ textDecoration: "none" }}
      >
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.1em] mb-1"
            style={{ color: "var(--accent-orange)" }}
          >
            Companion dashboard
          </div>
          <div
            className="text-[13px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Liquidator Economy Terminal
          </div>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            Per-liquidator concentration, MEV searcher leaderboards, gas / profit ratios,
            and event-level drilldowns live there.
          </p>
        </div>
        <ExternalLink size={14} strokeWidth={1.75} color="var(--accent-orange)" />
      </a>

      {/* Methodology footer (Phase E voice) — single text strip with
          source attribution + curation policy. Per-module specifics
          live in the chart-level methodology drawers. */}
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
        Stablecoin debt share + oracle concentration derive from DefiLlama
        Yields + the curated lib/oracles.ts map. Liquidation intensity,
        efficiency, leaderboard, concentration, and largest-events all
        read the Liquidator Economy Neon DB over the trailing 90-day
        window. Days Since Last Bad Debt counts from
        content/bad-debt-incidents.json — append a row when an incident
        occurs and the next render picks it up. Bonus-rate assumptions
        for liquidation efficiency are weighted averages; per-reserve
        values vary 5–15%.
      </div>

      <CiteThisPage
        pageTitle="Collateral & Stress Risk"
        pageUrl="https://lending-intelligence-terminal.vercel.app/risk"
      />
      <AsOfFooter
        timestamp={risk.fetchedAt}
        source="DefiLlama + Liquidator Economy DB · live load"
      />
    </div>
  )
}
