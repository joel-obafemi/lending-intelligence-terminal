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
import { riskVerdictSentence } from "@/lib/headline-sentence"
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
import { CiteThisPage } from "@/components/overview/cite-this-page"

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
  const summary = riskVerdictSentence({
    stablecoinDebtSharePct: risk.stablecoinDebtSharePct,
    topOraclePct: risk.oracle.topSharePct,
    topOracleName: risk.oracle.topVendor,
    peakIntensityPct: peakPct,
    peakIntensityProtocol: peakName,
  })

  // Auto insight: Stablecoin Debt Share trend. Compare current value
  // to 12 months ago to characterize the trajectory in one line.
  const stableInsight = (() => {
    const series = risk.stablecoinDebtShareHistory
    if (series.length < 30) return null
    const current = series[series.length - 1]?.sharePct
    if (!Number.isFinite(current)) return null
    const yearAgoTs = series[series.length - 1]!.timestamp - 365 * 86400
    let prior: number | null = null
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].timestamp <= yearAgoTs) {
        prior = series[i].sharePct
        break
      }
    }
    if (prior == null) prior = series[0].sharePct
    const delta = current - prior
    const dirWord =
      Math.abs(delta) < 0.5
        ? "essentially flat"
        : delta > 0
        ? `up ${delta.toFixed(1)} pp`
        : `down ${Math.abs(delta).toFixed(1)} pp`
    return `Stablecoin share of cross-protocol borrows is ${current.toFixed(1)}% — ${dirWord} vs 12 months ago. The ${current >= 50 ? "majority" : "plurality"} of on-chain credit is denominated in stables.`
  })()

  // Auto insight: Liquidation Intensity table. Reads off the gap
  // between the peak and the second-highest protocol — Fluid is
  // typically the peak by a wide margin.
  const intensityInsight = (() => {
    const sorted = [...risk.intensity].sort((a, b) => b.intensityPct - a.intensityPct)
    const top = sorted[0]
    const second = sorted[1]
    if (!top || !second) return null
    const gap = top.intensityPct - second.intensityPct
    if (gap < 0.5) {
      return `Cross-protocol liquidation intensity is converged: ${top.name} ${top.intensityPct.toFixed(1)}% vs ${second.name} ${second.intensityPct.toFixed(1)}% over 90 days.`
    }
    return `${top.name} liquidated ${top.intensityPct.toFixed(1)}% of its TVL over 90 days vs ${second.name}'s ${second.intensityPct.toFixed(1)}% — outsized velocity per dollar of TVL.`
  })()

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-6">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Collateral & Stress Risk
        </h1>
        <p className="text-xs text-text-muted">
          Sector-level risk indicators across Aave V3, Spark, Morpho, and Fluid on Ethereum.
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
        summary={summary}
        badDebt={risk.badDebt}
      />

      {/* Zone 2 — Stablecoin Debt Share trend */}
      <StablecoinDebtShareTrend
        title="Stablecoin Debt Share · 24 months"
        data={risk.stablecoinDebtShareHistory}
        methodologyKey="risk-stablecoin-debt-share-trend"
        insight={stableInsight}
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
            insight={intensityInsight}
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
