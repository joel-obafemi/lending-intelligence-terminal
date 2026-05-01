/**
 * Auto-generated headline-sentence helpers for Verdict bands.
 *
 * Each page's Verdict strip ends with a one-line summary that reads naturally
 * out loud — see the Sector / Risk specs. The numbers come from the live
 * snapshot; the sentence templates live here so we have one place to tweak
 * voice/phrasing.
 *
 * Helpers are pure (no DOM / fetch) so they can run on the server during
 * SSR and produce identical output to the client.
 */

import { formatPercent, formatUSD } from "./utils"

// ─────────────────────────────────────────────────────────────────────────
// Number formatting helpers — small layer over `lib/utils` for the voice
// the Verdict bands want (e.g. "$32.8 billion" vs "$32.80B").
// ─────────────────────────────────────────────────────────────────────────

/** Compact USD with verbal scale: $32.8 billion / $586 million / $1.2 trillion. */
export function formatUsdProse(v: number, fractionDigits = 1): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(fractionDigits)} trillion`
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(fractionDigits)} billion`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(fractionDigits)} million`
  return formatUSD(v)
}

/** Same as formatUsdProse but defaults to a reading-friendly precision. */
export function formatUsdShort(v: number): string {
  return formatUsdProse(v, v >= 1e9 ? 1 : 0)
}

/** Render a delta as a phrase like "up 4% vs last month" / "down 12% vs last month". */
export function formatDeltaPhrase(
  pctChange: number | null | undefined,
  windowLabel: string,
): string {
  if (pctChange == null || !Number.isFinite(pctChange)) return `relative to ${windowLabel} not available`
  if (Math.abs(pctChange) < 0.005) return `flat vs ${windowLabel}`
  const dir = pctChange > 0 ? "up" : "down"
  return `${dir} ${formatPercent(Math.abs(pctChange) * 100, pctChange < 0.05 ? 1 : 0)} vs ${windowLabel}`
}

/** Basis-points-over-X phrase: "+217 bps over T-bills" / "−42 bps under T-bills". */
export function formatSpreadBpsPhrase(spreadPct: number, vs: string): string {
  if (!Number.isFinite(spreadPct)) return `spread vs ${vs} not available`
  const bps = Math.round(spreadPct * 100)
  if (bps === 0) return `at par with ${vs}`
  const sign = bps > 0 ? "+" : "−"
  const dir = bps > 0 ? "over" : "under"
  return `${sign}${Math.abs(bps)} bps ${dir} ${vs}`
}

// ─────────────────────────────────────────────────────────────────────────
// Page-specific sentence templates.
// ─────────────────────────────────────────────────────────────────────────

export interface SectorVerdictInput {
  asOf: number  // unix seconds
  totalSuppliedUsd: number
  /** MoM change in TOTAL SUPPLY as a fraction (e.g. -0.123 = -12.3%). */
  suppliedMomChange: number | null
  protocolCount: number
  realYieldSpreadPct: number | null  // current pp spread; null if missing
  sectorTakeRatePct: number | null  // annualized revenue ÷ TVL, in %
}

/** Sector Overview Verdict band sentence (Zone 1).
 *
 *  "As of {date}, Ethereum lending holds {$X} of total supply across {N}
 *   protocols, {trend phrase}. Depositors are earning {Y bps} {over/under}
 *   T-bills. The sector take rate is {Z}%."
 *
 *  We measure trend on TOTAL SUPPLY (deposits + active borrows), not on
 *  DefiLlama's net-liquidity TVL. The latter inverts when borrow demand
 *  rises — supply can be flat while net-liquidity TVL falls — and that
 *  inversion ends up in headlines as a phantom outflow signal.
 */
export function sectorVerdictSentence(d: SectorVerdictInput): string {
  const date = new Date(d.asOf * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
  const supplied = formatUsdShort(d.totalSuppliedUsd)
  const trend = formatDeltaPhrase(d.suppliedMomChange, "last month")
  const yieldPhrase =
    d.realYieldSpreadPct != null
      ? `Depositors are earning ${formatSpreadBpsPhrase(d.realYieldSpreadPct, "T-bills")}.`
      : ""
  const takeRatePhrase =
    d.sectorTakeRatePct != null
      ? ` The sector take rate is ${formatPercent(d.sectorTakeRatePct, 1)}.`
      : ""
  return (
    `As of ${date}, Ethereum lending holds ${supplied} of total supply across ` +
    `${d.protocolCount} protocols, ${trend}. ${yieldPhrase}${takeRatePhrase}`
  ).trim()
}

export interface RiskVerdictInput {
  stablecoinDebtSharePct: number  // 0-100
  topOraclePct: number  // 0-100; e.g. Chainlink share of $-priced collateral
  topOracleName: string
  /** Peak protocol's 90-day liquidation intensity (volume / TVL %). */
  peakIntensityPct: number
  peakIntensityProtocol: string
}

/** Risk page Verdict band sentence (no-wallet scope).
 *
 *  "{X}% of all on-chain credit is in stablecoins. {Y}% of collateral is
 *   priced by {oracle}. {Protocol} has been the most stress-prone over
 *   the past 90 days, liquidating {Z}% of its TVL."
 *
 *  Wallet concentration (Top-10 borrower share) lights up in a later pass
 *  once the borrower-discovery data layer ships.
 */
export function riskVerdictSentence(d: RiskVerdictInput): string {
  return (
    `${formatPercent(d.stablecoinDebtSharePct, 0)} of all on-chain credit ` +
    `is in stablecoins. ${formatPercent(d.topOraclePct, 0)} of collateral ` +
    `is priced by ${d.topOracleName}. ${d.peakIntensityProtocol} has been ` +
    `the most stress-prone over the past 90 days, liquidating ` +
    `${formatPercent(d.peakIntensityPct, 1)} of its TVL.`
  )
}

/** Compact "Top 10 markets hold $X — Y% of the sector total" line for the
 *  Sector Top Markets table footer. */
export function topMarketsConcentrationSentence(
  top10TvlUsd: number,
  totalSectorTvlUsd: number,
): string {
  const sharePct = totalSectorTvlUsd > 0 ? (top10TvlUsd / totalSectorTvlUsd) * 100 : 0
  return `The top 10 markets on Ethereum hold ${formatUsdShort(top10TvlUsd)} of deposits, or ${formatPercent(sharePct, 0)} of the sector total.`
}
