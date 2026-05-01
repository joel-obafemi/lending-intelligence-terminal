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
import { riskVerdictSentence } from "@/lib/headline-sentence"
import { RiskVerdictStrip } from "@/components/risk/risk-verdict-strip"
import { OracleMapTable } from "@/components/risk/oracle-map-table"
import { StablecoinDebtShareTrend } from "@/components/risk/stablecoin-debt-share-trend"
import { LiquidationIntensityTable } from "@/components/risk/liquidation-intensity-table"
import { RevenueBarChart } from "@/components/overview/revenue-bar-chart"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function RiskPage() {
  const risk = await loadRisk()

  const peakName = risk.peakIntensity?.name ?? "No protocol"
  const peakPct = risk.peakIntensity?.intensityPct ?? 0
  const summary = riskVerdictSentence({
    stablecoinDebtSharePct: risk.stablecoinDebtSharePct,
    topOraclePct: risk.oracle.topSharePct,
    topOracleName: risk.oracle.topVendor,
    peakIntensityPct: peakPct,
    peakIntensityProtocol: peakName,
  })

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

      {/* Zone 1 — Verdict strip */}
      <RiskVerdictStrip
        stablecoinDebtSharePct={risk.stablecoinDebtSharePct}
        topOracleVendor={risk.oracle.topVendor}
        topOracleSharePct={risk.oracle.topSharePct}
        unclassifiedPct={risk.oracle.unclassifiedPct}
        peakIntensityName={peakName}
        peakIntensityPct={peakPct}
        summary={summary}
      />

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
    </div>
  )
}
