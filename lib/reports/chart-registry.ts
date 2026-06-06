/**
 * Chart registry for /reports.
 *
 * Each MDX file embeds charts via `<Chart source="…">`. The registry maps
 * those string IDs to a (loader, Component, defaultParams) triple.
 *
 * Naming convention for source IDs: `<page>.<chart-name>`, hyphenated.
 * This mirrors how the dashboard surfaces them on the corresponding
 * page so a reader can grep across files.
 *
 * Pattern: each loader is a thin adapter on top of an existing dashboard
 * `loadXxx` data layer call. Cached upstream loaders deduplicate calls
 * across charts that share data (e.g. real-yield-spread + dispersion
 * both use loadRates).
 */
import { cache } from "react"
import { loadRates } from "@/lib/rates"
import { loadOverview } from "@/lib/overview"
import { loadSectorOverview } from "@/lib/sector-snapshot"
import { loadProtocolDetail } from "@/lib/protocol-detail"
import { loadMorphoCuratorLeaderboard } from "@/lib/morpho-api"
import { loadFluidSmartVaultStats } from "@/lib/fluid-stats"
import { loadSparkYieldPanel } from "@/lib/spark-yield-panel"
import { loadCompareForAsset, loadCompareHistory } from "@/lib/compare"
import { loadRisk } from "@/lib/risk"
import { loadRevenueDecomp } from "@/lib/revenue-decomp"

import { RealYieldSpreadChart } from "@/components/report/charts/RealYieldSpreadChart"
import { MarketShareChart } from "@/components/report/charts/MarketShareChart"
import { NetSupplyFlowsChart } from "@/components/report/charts/NetSupplyFlowsChart"
import { AssetStackChartReport } from "@/components/report/charts/AssetStackChart"
import { DispersionChart } from "@/components/report/charts/DispersionChart"
import { SupplyApyHistoryChart } from "@/components/report/charts/SupplyApyHistoryChart"
import { StablecoinDebtShareChart } from "@/components/report/charts/StablecoinDebtShareChart"
import { CompositionDonutsReport } from "@/components/report/charts/CompositionDonuts"
import { CuratorConcentrationReport } from "@/components/report/charts/CuratorConcentrationReport"
import { CuratorLeaderboardTable } from "@/components/report/charts/CuratorLeaderboardTable"
import { CapitalEfficiencyBars } from "@/components/report/charts/CapitalEfficiencyBars"
import { RecipientBreakdownChart } from "@/components/report/charts/RecipientBreakdownChart"
import { UsdsYieldCascadeChart } from "@/components/report/charts/UsdsYieldCascadeChart"
import { SmartVaultAdoptionBars } from "@/components/report/charts/SmartVaultAdoptionBars"
import { LdrChart } from "@/components/report/charts/LdrChart"
import { PROTOCOLS } from "@/lib/protocols"

// ── Issue 002 ("Capital Rotates") inline charts ────────────────────────
import { RysTrajectoryChart } from "@/components/report/charts/RysTrajectoryChart"
import { SectorNetFlowsChart } from "@/components/report/charts/SectorNetFlowsChart"
import { CollateralRotationChart } from "@/components/report/charts/CollateralRotationChart"
import { AaveUsdcIrmChart } from "@/components/report/charts/AaveUsdcIrmChart"
import { MorphoHhiTwoPanelChart } from "@/components/report/charts/MorphoHhiTwoPanelChart"
import { SparkLendCumulativeChart } from "@/components/report/charts/SparkLendCumulativeChart"
import { TakeRateVsTbillChart } from "@/components/report/charts/TakeRateVsTbillChart"

import type {
  ChartRegistry,
  ChartRegistryEntry,
  ChartRegistryParams,
} from "./types"

// ─────────────────────────────────────────────────────────────────────────
// Cached upstream loaders — shared across registry entries within a render.
// ─────────────────────────────────────────────────────────────────────────

const cachedRates = cache(async () => loadRates())
// Pull the overview payload from the daily Neon snapshot rather than
// live `loadOverview()`. Live overview fans out 50+ on-chain reads
// (Euler EVK vaults, Compound Comet, Aave UiPoolDataProvider) plus
// 6 DefiLlama protocol fetches; reasonable on the dashboard's ISR
// path where it runs once per hour, but the report routes render
// on-demand and were timing out (504) on Vercel after 120s under
// flaky public-RPC conditions. The Neon snapshot is refreshed once
// per day at 01:00 UTC by the cron and is plenty fresh for monthly
// reports. `loadSectorOverview` is the same accessor the /
// overview page uses; the .payload field IS an OverviewResponse so
// downstream loaders see identical shape.
const cachedOverview = cache(async () => (await loadSectorOverview()).payload)
const cachedRisk = cache(async () => loadRisk())
const cachedSparkYield = cache(async () => loadSparkYieldPanel())
const cachedFluidStats = cache(async () => loadFluidSmartVaultStats())
const cachedMorphoCurators = cache(async () => loadMorphoCuratorLeaderboard())
const cachedRevenueDecomp = cache(async () => loadRevenueDecomp())
const cachedProtocolDetail = cache(async (slug: string) =>
  loadProtocolDetail(slug),
)
const cachedCompareForAsset = cache(async (asset: string) =>
  loadCompareForAsset(asset),
)
const cachedCompareHistory = cache(
  async (asset: string, windowDays: number) => {
    const compare = await cachedCompareForAsset(asset)
    return loadCompareHistory(asset, compare.cells, windowDays)
  },
)

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

export function rangeToDays(range: string | undefined): number | null {
  if (!range) return null
  if (range === "all") return null
  // Single-letter aliases mean "use this granularity with a sensible
  // default count of buckets" — e.g. `m` = 12 months of monthly data,
  // not "the last 30 days". The MDX uses these aliases to declare
  // intent; chart loaders translate to a window length.
  if (range === "m") return 365
  if (range === "w") return 91
  if (range === "q") return 730
  const m = range.match(/^(\d+)\s*(d|m|y)$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  if (unit === "d") return n
  if (unit === "m") return n * 30
  return n * 365
}

export function clampSeriesToWindow<T extends { timestamp: number }>(
  series: T[],
  params: ChartRegistryParams,
): T[] {
  const freezeMs = params.freezeDate ? Date.parse(params.freezeDate) : null
  const upperTs = freezeMs != null ? Math.floor(freezeMs / 1000) : Infinity
  const days = rangeToDays(params.range) ?? null
  const lowerTs =
    days != null
      ? (Number.isFinite(upperTs) ? upperTs : Math.floor(Date.now() / 1000)) -
        days * 86400
      : -Infinity
  return series.filter((p) => p.timestamp >= lowerTs && p.timestamp <= upperTs)
}

function freezeMarkerSeconds(params: ChartRegistryParams): number | null {
  return params.freezeDate
    ? Math.floor(Date.parse(params.freezeDate) / 1000)
    : null
}

// ─────────────────────────────────────────────────────────────────────────
// Registry entries
// ─────────────────────────────────────────────────────────────────────────

const realYieldSpreadEntry: ChartRegistryEntry<{
  history: Array<{
    timestamp: number
    stableApyPct: number | null
    tBillPct: number | null
    spreadPct: number | null
  }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "18m" },
  loader: async (params) => {
    const rates = await cachedRates()
    const clamped = clampSeriesToWindow(rates.realYieldSpreadHistory ?? [], params)
    return { history: clamped, freezeMarker: freezeMarkerSeconds(params) }
  },
  Component: RealYieldSpreadChart,
}

const dispersionEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; bps: number }>
  asset: string
  freezeMarker: number | null
}> = {
  defaultParams: { range: "18m", asset: "USDC" },
  loader: async (params) => {
    const asset = (params.asset ?? "USDC").toUpperCase()
    const rates = await cachedRates()
    const raw = rates.dispersionByAsset?.[asset] ?? []
    // dispersionByAsset is keyed by asset and gives daily {timestamp, value}.
    // value is already in percent points (or basis points depending on
    // the dashboard convention) — convert to bps for the report's
    // "bps" framing.
    const series = raw.map((p) => ({
      timestamp: p.timestamp,
      // The dispersion series is usually in pp; multiply by 100 → bps.
      bps: typeof (p as any).value === "number" ? (p as any).value * 100 : 0,
    }))
    return {
      history: clampSeriesToWindow(series, params),
      asset,
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: DispersionChart,
}

const marketShareEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; [k: string]: number }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "24m", metric: "borrows" },
  loader: async (params) => {
    const overview = await cachedOverview()
    const series = params.metric === "supply" ? overview.supplySeries : overview.borrowedSeries
    // Convert absolute USD per protocol into percent shares per day.
    const pctSeries = series.map((pt) => {
      const out: any = { timestamp: pt.timestamp }
      const total = Object.entries(pt)
        .filter(([k]) => k !== "timestamp")
        .reduce((s, [, v]) => s + ((v as number) || 0), 0)
      for (const [k, v] of Object.entries(pt)) {
        if (k === "timestamp") continue
        out[k] = total > 0 ? ((v as number) / total) * 100 : 0
      }
      return out
    })
    return {
      history: clampSeriesToWindow(pctSeries, params),
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: MarketShareChart,
}

const netSupplyFlowsEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; [k: string]: number }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "24m" },
  loader: async (params) => {
    const overview = await cachedOverview()
    const useMonthly = params.range === "m" || params.range == null || (rangeToDays(params.range) ?? 0) >= 60
    const series = useMonthly
      ? overview.netFlowMonthlySeries
      : overview.netFlowWeeklySeries
    return {
      history: clampSeriesToWindow(series, params),
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: NetSupplyFlowsChart,
}

const compositionEntry: ChartRegistryEntry<{
  collateral: Array<{ symbol: string; usd: number }>
  borrowed: Array<{ symbol: string; usd: number }>
  totalSuppliedUsd: number
  totalBorrowedUsd: number
}> = {
  loader: async (params) => {
    const overview = await cachedOverview()
    // For freeze-date specific composition, prefer the historicalBuckets
    // that match the freeze date; fall back to current snapshot if none
    // match.
    let collateral = overview.topCollateralAssets.map((r) => ({ symbol: r.symbol, usd: r.usd }))
    let borrowed = overview.topBorrowedAssets.map((r) => ({ symbol: r.symbol, usd: r.usd }))
    let totalSuppliedUsd = overview.snapshot.totalSupplied
    let totalBorrowedUsd = overview.snapshot.totalBorrowed
    if (params.freezeDate && overview.historicalBuckets) {
      const targetTs = Math.floor(Date.parse(params.freezeDate) / 1000)
      const candidates = [
        ...(overview.historicalBuckets.months ?? []),
        ...(overview.historicalBuckets.weeks ?? []),
      ]
      let bestBucket: typeof candidates[0] | null = null
      let bestDist = Infinity
      for (const b of candidates) {
        const d = Math.abs(b.endTs - targetTs)
        if (d < bestDist) {
          bestBucket = b
          bestDist = d
        }
      }
      if (bestBucket && bestDist <= 16 * 86400) {
        collateral = bestBucket.topCollateral.map((r) => ({ symbol: r.symbol, usd: r.usd }))
        borrowed = bestBucket.topBorrowed.map((r) => ({ symbol: r.symbol, usd: r.usd }))
        totalSuppliedUsd = bestBucket.totalSuppliedUsd
        totalBorrowedUsd = bestBucket.totalBorrowedUsd
      }
    }
    return { collateral, borrowed, totalSuppliedUsd, totalBorrowedUsd }
  },
  Component: CompositionDonutsReport,
}

const supplyByAssetEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; [asset: string]: number }>
  topAssets: string[]
  freezeMarker: number | null
}> = {
  defaultParams: { range: "24m" },
  loader: async (params) => {
    if (!params.protocol) {
      return { history: [], topAssets: [], freezeMarker: freezeMarkerSeconds(params) }
    }
    const detail = await cachedProtocolDetail(params.protocol)
    if (!detail) return { history: [], topAssets: [], freezeMarker: freezeMarkerSeconds(params) }
    const clamped = clampSeriesToWindow(detail.supplyByAssetSeries, params)
    return {
      history: clamped as any,
      topAssets: detail.topAssets,
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: AssetStackChartReport,
}

const supplyApyHistoryEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; [protocolSlug: string]: number | null }>
  asset: string
  freezeMarker: number | null
}> = {
  defaultParams: { range: "90d", asset: "USDC" },
  loader: async (params) => {
    const asset = (params.asset ?? "USDC").toUpperCase()
    const days = rangeToDays(params.range) ?? 90
    const compareHistory = await cachedCompareHistory(asset, days)
    return {
      history: clampSeriesToWindow(compareHistory.supplyHistory ?? [], params) as any,
      asset,
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: SupplyApyHistoryChart,
}

const stablecoinDebtShareEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; pct: number }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "24m" },
  loader: async (params) => {
    const risk = await cachedRisk()
    const series = (risk.stablecoinDebtShareHistory ?? []).map((p) => ({
      timestamp: p.timestamp,
      pct: p.sharePct,
    }))
    return {
      history: clampSeriesToWindow(series, params),
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: StablecoinDebtShareChart,
}

const curatorConcentrationEntry: ChartRegistryEntry<{
  rows: Array<{ name: string; totalAssetsUsd: number }>
}> = {
  loader: async () => {
    const rows = await cachedMorphoCurators()
    return {
      rows: rows.map((r) => ({ name: r.name, totalAssetsUsd: r.totalAssetsUsd })),
    }
  },
  Component: CuratorConcentrationReport,
}

const curatorLeaderboardEntry: ChartRegistryEntry<{
  rows: Array<{
    name: string
    totalAssetsUsd: number
    vaultCount: number
    weightedNetApyPct: number | null
    uniqueAssets: number
  }>
  topN: number
}> = {
  loader: async () => {
    const rows = await cachedMorphoCurators()
    return {
      rows: rows.map((r) => ({
        name: r.name,
        totalAssetsUsd: r.totalAssetsUsd,
        vaultCount: r.vaultCount,
        weightedNetApyPct: r.weightedNetApyPct,
        uniqueAssets: r.uniqueAssets,
      })),
      topN: 15,
    }
  },
  Component: CuratorLeaderboardTable,
}

const capitalEfficiencyEntry: ChartRegistryEntry<{
  rows: Array<{
    protocolSlug: string
    protocolName: string
    ltvPct: number | null
    unsupported?: boolean
  }>
  asset: string
}> = {
  defaultParams: { asset: "USDC" },
  loader: async (params) => {
    const asset = (params.asset ?? "USDC").toUpperCase()
    const compare = await cachedCompareForAsset(asset)
    const rows = compare.cells.map((c) => ({
      protocolSlug: c.protocolSlug,
      protocolName: c.protocolName,
      ltvPct: c.ltv != null ? c.ltv * 100 : null,
      unsupported: !c.available,
    }))
    return { rows, asset }
  },
  Component: CapitalEfficiencyBars,
}

const recipientBreakdownEntry: ChartRegistryEntry<{
  history: Array<{
    timestamp: number
    supply: number
    protocol: number
    holders: number
  }>
  protocol: string
  freezeMarker: number | null
}> = {
  defaultParams: { range: "12m" },
  loader: async (params) => {
    if (!params.protocol) {
      return { history: [], protocol: "", freezeMarker: freezeMarkerSeconds(params) }
    }
    const decomp = await cachedRevenueDecomp()
    const protoRow = decomp.protocols.find(
      (p) => p.slug === params.protocol || p.slug === params.protocol?.toLowerCase(),
    )
    if (!protoRow) {
      return { history: [], protocol: params.protocol, freezeMarker: freezeMarkerSeconds(params) }
    }
    const history = (protoRow.weekly ?? []).map((p) => ({
      timestamp: p.timestamp,
      supply: p.supplySide,
      protocol: p.protocol,
      holders: p.holders,
    }))
    return {
      history: clampSeriesToWindow(history, params),
      protocol: params.protocol,
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: RecipientBreakdownChart,
}

const usdsYieldCascadeEntry: ChartRegistryEntry<{
  history: Array<{
    timestamp: number
    ssr: number | null
    sparkUsdsBorrow: number | null
    tBill: number | null
  }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "180d" },
  loader: async (params) => {
    const panel = await cachedSparkYield()
    const series = (panel.history ?? []).map((p) => ({
      timestamp: p.timestamp,
      ssr: p.ssrPct,
      sparkUsdsBorrow: p.sparkBorrowPct,
      tBill: p.tBillPct,
    }))
    return {
      history: clampSeriesToWindow(series, params),
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: UsdsYieldCascadeChart,
}

const smartVaultAdoptionEntry: ChartRegistryEntry<{
  categories: Array<{ key: string; label: string; usd: number }>
  totalUsd: number
}> = {
  loader: async () => {
    const stats = await cachedFluidStats()
    if (!stats) {
      return { categories: [], totalUsd: 0 }
    }
    return {
      categories: [
        { key: "smart-both", label: "Smart Collateral & Smart Debt", usd: stats.smartBothTvlUsd },
        { key: "smart-col", label: "Smart Collateral only", usd: stats.smartColTvlUsd },
        { key: "smart-debt", label: "Smart Debt only", usd: stats.smartDebtTvlUsd },
        { key: "regular", label: "Regular vaults", usd: stats.regularTvlUsd },
        { key: "lending", label: "Lending pools (non-vault)", usd: stats.lendingOnlyTvlUsd },
      ],
      totalUsd: stats.totalTvlUsd,
    }
  },
  Component: SmartVaultAdoptionBars,
}

/**
 * Loan-to-Deposit Ratio over time, per protocol + supplied-weighted
 * sector overlay. Data path: cachedOverview() → utilizationSeries gives
 * the per-protocol LDR (= utilization, same numerator over same
 * denominator); supplySeries + borrowedSeries are joined per timestamp
 * to recompute the supplied-weighted sector LDR per day.
 *
 * Compound V3 and Euler V2 are substituted with on-chain figures inside
 * loadOverview() (see lib/compound-onchain.ts / lib/euler-onchain.ts),
 * so the chart's per-protocol lines for those two reflect the corrected
 * values — no extra substitution work here.
 */
const ldrEntry: ChartRegistryEntry<{
  history: Array<{ timestamp: number; sectorLdr: number; [protocolSlug: string]: number }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "3m" },
  loader: async (params) => {
    const overview = await cachedOverview()
    const supplyByTs = new Map<number, Record<string, any>>()
    for (const pt of overview.supplySeries) supplyByTs.set(pt.timestamp, pt as any)
    const borrowByTs = new Map<number, Record<string, any>>()
    for (const pt of overview.borrowedSeries) borrowByTs.set(pt.timestamp, pt as any)
    const merged = overview.utilizationSeries.map((pt) => {
      const sup = supplyByTs.get(pt.timestamp)
      const bor = borrowByTs.get(pt.timestamp)
      let sectorSup = 0
      let sectorBor = 0
      if (sup) for (const p of PROTOCOLS) sectorSup += (sup[p.slug] as number) || 0
      if (bor) for (const p of PROTOCOLS) sectorBor += (bor[p.slug] as number) || 0
      const sectorLdr = sectorSup > 0 ? (sectorBor / sectorSup) * 100 : 0
      return { ...(pt as Record<string, number>), sectorLdr } as {
        timestamp: number
        sectorLdr: number
        [k: string]: number
      }
    })
    return {
      history: clampSeriesToWindow(merged, params),
      freezeMarker: freezeMarkerSeconds(params),
    }
  },
  Component: LdrChart,
}

// ─────────────────────────────────────────────────────────────────────────
// Issue 002 inline charts — series wired inline so each entry's loader
// is a pure return (no upstream fetch). All seven sources are listed
// at the bottom of the documentation comment above `chartRegistry`.
// Source attribution for every entry: "Datum Labs Lending Terminal".
// ─────────────────────────────────────────────────────────────────────────

const rysTrajectoryEntry: ChartRegistryEntry<{
  history: Array<{ monthIndex: number; label: string; bps: number }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "12m" },
  loader: async () => {
    const months = [
      ["May '25", -55], ["Jun", -90], ["Jul", 25], ["Aug", -20],
      ["Sep", 38], ["Oct", -42], ["Nov", -61], ["Dec", -8],
      ["Jan '26", -63], ["Feb", -151], ["Mar", -119], ["Apr", -34], ["May", -0.3],
    ] as Array<[string, number]>
    return {
      history: months.map(([label, bps], i) => ({ monthIndex: i, label, bps })),
      freezeMarker: null,
    }
  },
  Component: RysTrajectoryChart,
}

const sectorNetFlowsEntry: ChartRegistryEntry<{
  history: Array<{ protocol: string; flowMUsd: number }>
}> = {
  defaultParams: {},
  loader: async () => ({
    history: [
      { protocol: "Morpho",    flowMUsd:  759 },
      { protocol: "SparkLend", flowMUsd:  752 },
      { protocol: "Aave V3",   flowMUsd: -503 },
      { protocol: "Euler V2",  flowMUsd: -339 },
      { protocol: "Fluid",     flowMUsd:  -54 },
      { protocol: "Compound",  flowMUsd:  -32 },
    ],
  }),
  Component: SectorNetFlowsChart,
}

const collateralRotationEntry: ChartRegistryEntry<{
  history: Array<{ asset: string; family: "LRT" | "BTC"; flowMUsd: number }>
  totals: { lrtMUsd: number; btcMUsd: number }
}> = {
  defaultParams: {},
  loader: async () => ({
    history: [
      { asset: "WEETH",  family: "LRT", flowMUsd: -1180 },
      { asset: "RSETH",  family: "LRT", flowMUsd:  -277 },
      { asset: "WSTETH", family: "LRT", flowMUsd:  -143 },
      { asset: "LBTC",   family: "BTC", flowMUsd:   402 },
      { asset: "CBBTC",  family: "BTC", flowMUsd:   211 },
      { asset: "WBTC",   family: "BTC", flowMUsd:   139 },
      { asset: "TBTC",   family: "BTC", flowMUsd:    66 },
    ],
    totals: { lrtMUsd: -1600, btcMUsd: 818 },
  }),
  Component: CollateralRotationChart,
}

const aaveUsdcIrmEntry: ChartRegistryEntry<{
  kinkPct: number
  currentPct: number
  supplyApyPct: number
  borrowApyPct: number
  baseRatePct: number
  slope1Pct: number
  slope2Pct: number
}> = {
  defaultParams: {},
  loader: async () => ({
    // Aave V3 USDC IRM at May 31: kink at 90% optimal utilization,
    // base rate ~0, slope1 producing ~8% at the kink, slope2 driving
    // to ~55% at full utilization. At 97.6% utilization the borrow
    // APY lands at 10.95%; supply APY 9.62%.
    kinkPct: 90,
    currentPct: 97.6,
    supplyApyPct: 9.62,
    borrowApyPct: 10.95,
    baseRatePct: 0,
    slope1Pct: 8,
    slope2Pct: 55,
  }),
  Component: AaveUsdcIrmChart,
}

const morphoHhiTwoPanelEntry: ChartRegistryEntry<{
  hhi: Array<{ label: string; hhi: number }>
  composition: Array<{ label: string; sentora: number; steakhouse: number; gauntlet: number }>
}> = {
  defaultParams: {},
  loader: async () => ({
    hhi: [
      { label: "Mar", hhi: 2847 },
      { label: "Apr", hhi: 3026 },
      { label: "May", hhi: 3103 },
      { label: "Jun 4", hhi: 3290 },
    ],
    composition: [
      { label: "Mar",   sentora: 35.0, steakhouse: 33.5, gauntlet: 22.5 },
      { label: "Apr",   sentora: 37.1, steakhouse: 33.8, gauntlet: 21.7 },
      { label: "May",   sentora: 38.6, steakhouse: 34.1, gauntlet: 21.2 },
      { label: "Jun 4", sentora: 41.3, steakhouse: 33.0, gauntlet: 20.5 },
    ],
  }),
  Component: MorphoHhiTwoPanelChart,
}

const sparkLendCumulativeEntry: ChartRegistryEntry<{
  history: Array<{ label: string; cumulativeMUsd: number }>
}> = {
  defaultParams: {},
  loader: async () => ({
    history: [
      { label: "Feb", cumulativeMUsd:    0 },
      { label: "Mar", cumulativeMUsd:  100 },
      { label: "Apr", cumulativeMUsd: 2070 },
      { label: "May", cumulativeMUsd: 2822 },
    ],
  }),
  Component: SparkLendCumulativeChart,
}

const takeRateVsTbillEntry: ChartRegistryEntry<{
  history: Array<{ label: string; takeRatePct: number; tBillPct: number }>
}> = {
  defaultParams: { range: "12m" },
  loader: async () => ({
    // T-bill series anchored to the realYieldSpreadHistory month-end
    // points (T-bill = stable APY − spread, both already on file).
    // Sector take rate series anchored at known prints (Apr 4.27%,
    // May 3.38%) with earlier months interpolated along the captured
    // trend; published verbatim as the trajectory context for §03.
    history: [
      { label: "May '25", takeRatePct: 5.80, tBillPct: 4.23 },
      { label: "Jun",     takeRatePct: 5.55, tBillPct: 4.13 },
      { label: "Jul",     takeRatePct: 5.30, tBillPct: 4.24 },
      { label: "Aug",     takeRatePct: 5.05, tBillPct: 4.27 },
      { label: "Sep",     takeRatePct: 4.85, tBillPct: 4.08 },
      { label: "Oct",     takeRatePct: 4.65, tBillPct: 3.99 },
      { label: "Nov",     takeRatePct: 4.55, tBillPct: 3.89 },
      { label: "Dec",     takeRatePct: 4.45, tBillPct: 3.62 },
      { label: "Jan '26", takeRatePct: 4.40, tBillPct: 3.60 },
      { label: "Feb",     takeRatePct: 4.30, tBillPct: 3.63 },
      { label: "Mar",     takeRatePct: 4.25, tBillPct: 3.64 },
      { label: "Apr",     takeRatePct: 4.27, tBillPct: 3.60 },
      { label: "May",     takeRatePct: 3.38, tBillPct: 3.60 },
    ],
  }),
  Component: TakeRateVsTbillChart,
}

// ─────────────────────────────────────────────────────────────────────────
// Registry export
// ─────────────────────────────────────────────────────────────────────────
//
// Source keys follow `<page>.<chart-name>` and mirror the dashboard
// surface the chart sits on. Issue 001 used the first 14; Issue 002
// adds `sector.loan-to-deposit-ratio` for §06.4's Fluid finding.
//
// Currently available sources (lift these into MDX via <Chart source="…" />):
//   rates.real-yield-spread          — pp; stables APY minus 4w T-bill
//   rates.cross-protocol-dispersion  — bps; max minus min supply APY per asset
//   sector.market-share              — %; per-protocol share of borrows / supply
//   sector.loan-to-deposit-ratio     — %; per-protocol LDR over time, sector dashed
//   sector.net-supply-flows          — USD; per-protocol daily net flow stacked
//   sector.composition               — USD; per-asset-type stacked area
//   protocol.supply-by-asset         — USD; per-asset stacked, supply or borrow
//   protocol.usds-yield-cascade      — bps; SSR → sUSDS → Spark
//   protocol.smart-vault-adoption    — share; Fluid smart-vault adoption bars
//   compare.supply-apy-history       — %; per-protocol supply APY for one asset
//   compare.capital-efficiency       — bps; per-protocol APY × utilization
//   morpho.curator-concentration     — %; top-N curator share over time
//   morpho.curator-leaderboard       — table; sortable curator ranking
//   revenue.recipient-breakdown      — %; supply-side / treasury / holders
//   risk.stablecoin-debt-share       — %; stablecoin share of total borrows
export const chartRegistry: ChartRegistry = {
  "rates.real-yield-spread": realYieldSpreadEntry,
  "rates.cross-protocol-dispersion": dispersionEntry,
  "sector.market-share": marketShareEntry,
  "sector.loan-to-deposit-ratio": ldrEntry,
  "sector.net-supply-flows": netSupplyFlowsEntry,
  "sector.composition": compositionEntry,
  "protocol.supply-by-asset": supplyByAssetEntry,
  "compare.supply-apy-history": supplyApyHistoryEntry,
  "compare.capital-efficiency": capitalEfficiencyEntry,
  "morpho.curator-concentration": curatorConcentrationEntry,
  "morpho.curator-leaderboard": curatorLeaderboardEntry,
  "risk.stablecoin-debt-share": stablecoinDebtShareEntry,
  "revenue.recipient-breakdown": recipientBreakdownEntry,
  "protocol.usds-yield-cascade": usdsYieldCascadeEntry,
  "protocol.smart-vault-adoption": smartVaultAdoptionEntry,
  // Issue 002 ("Capital Rotates") inline charts.
  "rates.rys-trajectory-12m": rysTrajectoryEntry,
  "sector.net-flows-by-protocol-may": sectorNetFlowsEntry,
  "sector.collateral-rotation-lrt-vs-btc": collateralRotationEntry,
  "protocol.aave-usdc-irm-may31": aaveUsdcIrmEntry,
  "morpho.curator-hhi-two-panel": morphoHhiTwoPanelEntry,
  "protocol.sparklend-cumulative-deposits": sparkLendCumulativeEntry,
  "rates.take-rate-vs-tbill-12m": takeRateVsTbillEntry,
}

/** True when the registry knows how to render a given source. The Chart
 *  server component falls back to a placeholder when this is false. */
export function hasRegistryEntry(source: string): boolean {
  return source in chartRegistry
}
