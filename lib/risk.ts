/**
 * Risk page data loader.
 *
 * Pulls the three pieces the Risk Verdict + page need, computes the
 * derived metrics that aren't already in the upstream payloads, and
 * leaves wallet-level data (Top-10 borrower share, Top-200 positions)
 * out of scope until we have a borrower-discovery layer.
 *
 * Inputs:
 *   - `loadOverview()` for stablecoin debt share, total TVL, top
 *     collateral assets (used to compute oracle concentration).
 *   - `loadLiquidations(90)` for 90-day liquidation volume per protocol
 *     (used for the Liquidation Intensity card + the by-protocol bars).
 *
 * No new I/O — both upstream loaders cache through their own paths.
 */
import { loadOverview, type OverviewResponse } from "./overview"
import {
  loadLiquidations,
  loadLiquidatorLeaderboard,
  type LiquidationResponse,
  type LiquidatorLeaderboardRow,
} from "./liquidations"
import {
  oracleFor,
  oracleNotes,
  type OracleVendor,
} from "./oracles"
import { PROTOCOLS } from "./protocols"
import { loadBadDebtSummary, type BadDebtSummary } from "./bad-debt"
import {
  loadLiquidationPenaltyByProtocol,
  type ProtocolLiquidationPenaltyRow,
} from "./fluid-comparisons"

export interface OracleConcentration {
  /** Top oracle vendor by USD of priced collateral. */
  topVendor: OracleVendor
  /** Top vendor's share of priced collateral, 0-100. */
  topSharePct: number
  /** Full breakdown of vendor → USD share. Sums to ~100% (excludes
   *  unclassified assets, which are reported separately). */
  byVendor: Array<{ vendor: OracleVendor; sharePct: number; usd: number }>
  /** Share of total collateral that's not in the curated map yet. */
  unclassifiedPct: number
}

export interface LiquidationIntensityRow {
  slug: string
  name: string
  color: string
  tvlUsd: number
  /** Trailing 90d liquidation volume in USD. */
  volumeUsd: number
  /** Volume / TVL × 100. */
  intensityPct: number
}

export interface OracleMapRow {
  protocolSlug: string
  protocolName: string
  protocolColor: string
  asset: string
  vendor: OracleVendor
  notes?: string
  /** Latest-day asset USD on this protocol, where known (top-7 only).
   *  null when this row is from the curated catalog rather than observed. */
  usd: number | null
}

export interface RiskResponse {
  /** Stablecoin debt share, percent (0-100). */
  stablecoinDebtSharePct: number
  /** Cross-protocol oracle concentration. */
  oracle: OracleConcentration
  /** Per-protocol 90-day liquidation intensity (volume / TVL %). */
  intensity: LiquidationIntensityRow[]
  /** Maximum intensity across protocols (the "headline" stress number). */
  peakIntensity: LiquidationIntensityRow | null
  /** Weekly liquidation volume per protocol — feeds the time-series chart. */
  weeklyLiquidationVolume: LiquidationResponse["weeklyVolume"]
  liquidationsAvailable: boolean
  /** Curated oracle map rendered as a flat table (one row per pair). */
  oracleMap: OracleMapRow[]
  /** Stablecoin-debt-share daily history, for the trend chart. */
  stablecoinDebtShareHistory: Array<{ timestamp: number; sharePct: number }>
  /** Bad-debt incident summary derived from
   *  `content/bad-debt-incidents.json`. Powers the 4th stat card. */
  badDebt: BadDebtSummary
  /** Per-protocol effective liquidation penalty (90d, weighted by
   *  event size). Powers the Liquidation Efficiency comparison
   *  module — empirical version of "Fluid pays the lowest penalty". */
  liquidationEfficiency: ProtocolLiquidationPenaltyRow[]
  /** Window used for `liquidationEfficiency` (days). */
  liquidationEfficiencyPeriodDays: number
  /** Top 10 liquidator wallets by 90-day gross profit. Empty when the
   *  liquidator-economy DB isn't configured. */
  liquidatorLeaderboard: LiquidatorLeaderboardRow[]
  fetchedAt: number
}

/** Compute oracle concentration over the latest-day topCollateralAssets.
 *  We use the top-N (default 10) since that already covers >90% of cross-
 *  protocol collateral, and the curated map names the assets users actually
 *  hold. */
function computeOracleConcentration(
  overview: OverviewResponse,
): OracleConcentration {
  const total = overview.topCollateralAssets.reduce((s, r) => s + r.usd, 0)
  const usdByVendor = new Map<OracleVendor, number>()
  let unclassifiedUsd = 0
  for (const row of overview.topCollateralAssets) {
    const vendor = oracleFor(row.symbol)
    if (vendor === "Other") {
      unclassifiedUsd += row.usd
      continue
    }
    usdByVendor.set(vendor, (usdByVendor.get(vendor) ?? 0) + row.usd)
  }
  const classified = total - unclassifiedUsd
  const byVendor = [...usdByVendor.entries()]
    .map(([vendor, usd]) => ({
      vendor,
      usd,
      sharePct: classified > 0 ? (usd / classified) * 100 : 0,
    }))
    .sort((a, b) => b.usd - a.usd)
  const top = byVendor[0]
  return {
    topVendor: top?.vendor ?? "Other",
    topSharePct: top?.sharePct ?? 0,
    byVendor,
    unclassifiedPct: total > 0 ? (unclassifiedUsd / total) * 100 : 0,
  }
}

/** Per-protocol 90d liquidation intensity (volume / TVL). */
function computeIntensity(
  overview: OverviewResponse,
  liq: LiquidationResponse,
): LiquidationIntensityRow[] {
  return PROTOCOLS.map((p) => {
    const liqRow = liq.protocols.find((r) => r.slug === p.slug)
    const ovRow = overview.protocols.find((r) => r.slug === p.slug)
    const tvlUsd = ovRow?.tvl ?? 0
    const volumeUsd = liqRow?.volumeUsd ?? 0
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      tvlUsd,
      volumeUsd,
      intensityPct: tvlUsd > 0 ? (volumeUsd / tvlUsd) * 100 : 0,
    }
  })
}

/** Build the flat oracle map table — one row per (protocol, top asset). */
function buildOracleMap(overview: OverviewResponse): OracleMapRow[] {
  // Use the top asset symbols to drive the table so we don't list every
  // dust market. Curators can still see uncovered assets via the
  // unclassifiedPct hint on the Verdict card.
  const symbols = overview.topAssets.length > 0
    ? overview.topAssets
    : overview.topCollateralAssets.map((r) => r.symbol)
  const topUsdBySymbol = new Map(
    overview.topCollateralAssets.map((r) => [r.symbol, r.usd] as const),
  )
  const rows: OracleMapRow[] = []
  for (const protocol of PROTOCOLS) {
    for (const symbol of symbols) {
      rows.push({
        protocolSlug: protocol.slug,
        protocolName: protocol.name,
        protocolColor: protocol.color,
        asset: symbol,
        vendor: oracleFor(symbol, protocol.slug),
        notes: oracleNotes(symbol),
        // Cross-protocol USD is the right approximation here — we don't
        // have per-protocol per-asset USD on the overview payload, only
        // the cross-protocol total. Surfaces the magnitude per asset
        // without overstating.
        usd: topUsdBySymbol.get(symbol) ?? null,
      })
    }
  }
  return rows
}

/** Daily history of stablecoin debt share across the four protocols.
 *  Built from the daily borrowed-by-asset series + the asset classifier. */
function buildStablecoinShareHistory(
  overview: OverviewResponse,
): Array<{ timestamp: number; sharePct: number }> {
  // borrowedByAssetSeries is daily, keyed by asset symbol. Sum stablecoin
  // values per day vs. total per day.
  const STABLES = new Set([
    "USDC", "USDT", "DAI", "USDS", "GHO", "PYUSD", "USDE", "SUSDE",
    "FRAX", "FDUSD", "USDTB", "CRVUSD", "LUSD", "TUSD", "USDC.E", "FUSD",
    "USD1", "MKUSD", "USD0", "USD0++", "SUSDS", "SDAI",
  ])
  return overview.borrowedByAssetSeries.map((pt) => {
    let stableUsd = 0
    let total = 0
    for (const [k, v] of Object.entries(pt)) {
      if (k === "timestamp") continue
      const usd = (v as number) || 0
      total += usd
      if (STABLES.has(k.toUpperCase())) stableUsd += usd
    }
    return {
      timestamp: pt.timestamp,
      sharePct: total > 0 ? (stableUsd / total) * 100 : 0,
    }
  })
}

const LIQ_EFFICIENCY_DAYS = 90

export async function loadRisk(): Promise<RiskResponse> {
  const [overview, liq, badDebt, liquidationEfficiency, liquidatorLeaderboard] =
    await Promise.all([
      loadOverview(),
      loadLiquidations(90),
      loadBadDebtSummary(),
      loadLiquidationPenaltyByProtocol(LIQ_EFFICIENCY_DAYS).catch((err) => {
        console.error("[risk] liquidation efficiency load failed:", err?.message ?? err)
        return [] as ProtocolLiquidationPenaltyRow[]
      }),
      loadLiquidatorLeaderboard(LIQ_EFFICIENCY_DAYS, 10).catch((err) => {
        console.error("[risk] liquidator leaderboard load failed:", err?.message ?? err)
        return [] as LiquidatorLeaderboardRow[]
      }),
    ])
  const oracle = computeOracleConcentration(overview)
  const intensity = computeIntensity(overview, liq)
  const peakIntensity =
    intensity.length === 0
      ? null
      : intensity.reduce((best, r) => (r.intensityPct > best.intensityPct ? r : best))
  return {
    stablecoinDebtSharePct: overview.snapshot.stablecoinDebtSharePct,
    oracle,
    intensity,
    peakIntensity,
    weeklyLiquidationVolume: liq.weeklyVolume,
    liquidationsAvailable: liq.available,
    oracleMap: buildOracleMap(overview),
    stablecoinDebtShareHistory: buildStablecoinShareHistory(overview),
    badDebt,
    liquidationEfficiency,
    liquidationEfficiencyPeriodDays: LIQ_EFFICIENCY_DAYS,
    liquidatorLeaderboard,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
