/**
 * Shared logic for Market Overview — used by both the server component page
 * and the /api/overview route so external consumers and the UI stay in sync.
 */
import { PROTOCOLS } from "./protocols"
import { fetchAllProtocolHistory } from "./defillama"
import { classifyAsset, type AssetType, ASSET_TYPE_STACK_ORDER } from "./assets"
import { buildHistoricalBuckets, type HistoricalBuckets } from "./historical-buckets"
import {
  buildNetFlowsSankey,
  type NetFlowsSankeyData,
  type ProtocolAssetUsdSeries,
} from "./net-flows-sankey"

export interface DeltaTriple {
  /** 24-hour absolute-USD change (current − T−1d) */
  change24h: number
  /** Month-over-month change (T0 − T−30d) */
  changeMoM: number
  /** Year-over-year change (T0 − T−365d) */
  changeYoY: number
  /** Sparkline data — last 30 days of values */
  sparkline: Array<{ timestamp: number; value: number }>
}

export interface OverviewSnapshot {
  /** Unborrowed liquidity (DefiLlama's chainTvls.Ethereum) */
  totalTvl: number
  /** Currently outstanding borrows (chainTvls.Ethereum-borrowed) */
  totalBorrowed: number
  /** Total supplied = TVL + borrowed (the full deposit base) */
  totalSupplied: number
  /** Multi-window deltas + sparkline series for each headline counter. */
  tvlDeltas: DeltaTriple
  borrowedDeltas: DeltaTriple
  suppliedDeltas: DeltaTriple
  /** Net interest paid by borrowers, last 30 days summed (Tier 1 metric). */
  netInterestPaid30d: number
  netInterestPaidDeltas: DeltaTriple
  /** Stablecoin debt share — % of total borrows held in stablecoins. */
  stablecoinDebtSharePct: number
  /** Total fees over recent windows (already had these). */
  totalFees24h: number
  totalFees7d: number
  protocolCount: number
}

export interface OverviewProtocolRow {
  slug: string
  name: string
  color: string
  tvl: number
  borrowed: number
  utilizationPct: number
  fees24h: number
  fees7d: number
  tvlShare: number
}

/** Chart point keyed by protocol slug: `{ timestamp, 'aave-v3': 1e10, spark: 3e9, ... }` */
export interface OverviewTimeseriesPoint {
  timestamp: number
  [protocolSlug: string]: number
}

/** Chart point keyed by asset symbol (uppercase): `{ timestamp, WETH: 5e9, USDC: 2e9, Other: 1e9 }` */
export interface AssetTimeseriesPoint {
  timestamp: number
  [assetSymbol: string]: number
}

/** Chart point keyed by asset type: `{ timestamp, native: 5e9, lst: 2e9, ... }` */
export interface AssetTypeTimeseriesPoint {
  timestamp: number
  native: number
  lst: number
  lrt: number
  stable: number
  other: number
}

export interface RankedAssetRow {
  symbol: string
  usd: number
  sharePct: number
  type: AssetType
  /** Per-protocol breakdown of `usd` for this asset, keyed by canonical
   *  dash-form slug. Sum approximately equals `usd` (rounding aside).
   *  Empty record when per-protocol data isn't available. */
  byProtocol: Record<string, number>
}

export interface ProtocolRevenueSnapshot {
  slug: string
  name: string
  color: string
  /** Period total fees in USD (30d rolling) */
  fees30d: number
  /** Revenue-per-dollar-of-TVL ratio, annualized (fees30d × 12 / tvl) */
  revPerTvlAnnualized: number
  /** Cumulative fees across the full DefiLlama history on Ethereum */
  cumulativeFees: number
  /** Current TVL for the denominator in rev/TVL */
  tvl: number
}

export interface OverviewResponse {
  snapshot: OverviewSnapshot
  protocols: OverviewProtocolRow[]
  /** TVL (unborrowed) over time, stacked by protocol */
  tvlSeries: OverviewTimeseriesPoint[]
  /** Currently borrowed over time, stacked by protocol */
  borrowedSeries: OverviewTimeseriesPoint[]
  /** Total supplied = tvl + borrowed, stacked by protocol */
  supplySeries: OverviewTimeseriesPoint[]
  /** Per-protocol utilization % over time (borrowed / supplied × 100) */
  utilizationSeries: OverviewTimeseriesPoint[]
  /** Market share % over time, stacked by protocol (sums to 100 each day) */
  marketShareSeries: OverviewTimeseriesPoint[]
  /** Daily fees per protocol (weekly-aggregated for bar chart display) */
  feesWeeklySeries: OverviewTimeseriesPoint[]
  /** Cumulative fees per protocol over time */
  cumulativeFeesSeries: OverviewTimeseriesPoint[]
  /** Supply (tvl + borrowed) by asset across protocols — stacked top-N + Other */
  supplyByAssetSeries: AssetTimeseriesPoint[]
  /** Borrowed by asset across protocols */
  borrowedByAssetSeries: AssetTimeseriesPoint[]
  /** Per-asset utilization % over time */
  utilizationByAssetSeries: AssetTimeseriesPoint[]
  /** Total supplied collateral by classified asset-type (native/LST/LRT/stable/other) */
  collateralByTypeSeries: AssetTypeTimeseriesPoint[]
  /** Top collateral (supplied) assets ranked by USD at latest day */
  topCollateralAssets: RankedAssetRow[]
  /** Top borrowed assets ranked by USD at latest day */
  topBorrowedAssets: RankedAssetRow[]
  /** The asset symbols used in the stacked charts (rest are "Other") */
  topAssets: string[]
  /** Per-protocol fee & revenue snapshot (for the /revenue page cards) */
  revenueSnapshot: ProtocolRevenueSnapshot[]
  /** Weekly net supply change per protocol (USD). Positive = deposits exceed
   *  withdrawals, negative = net outflows. Computed from token-quantity
   *  deltas × latest price so price swings don't fake flow signal. */
  netFlowWeeklySeries: OverviewTimeseriesPoint[]
  /** Same data as `netFlowWeeklySeries`, bucketed by calendar month instead of week. */
  netFlowMonthlySeries: OverviewTimeseriesPoint[]
  /** Pre-computed Sankey snapshots for the trailing W (7d), M (30d), Q (90d)
   *  windows. Each entry has the three-column shape (asset inflow → protocol
   *  net → asset outflow) ready for the <NetFlowsSankey> client component. */
  netFlowsSankey?: {
    week: NetFlowsSankeyData
    month: NetFlowsSankeyData
    quarter: NetFlowsSankeyData
  }
  /** Net interest paid by borrowers (DefiLlama dailyUserFees), per protocol per day. */
  netInterestPaidDailySeries: OverviewTimeseriesPoint[]
  /** End-of-bucket snapshots (Week/Month/Quarter) for the date-pickable
   *  Composition Donuts and Top Markets tables. Latest 52 weeks / 24 months
   *  / 8 quarters. May be undefined on snapshots written before this field
   *  was introduced — components should fall back to the current arrays. */
  historicalBuckets?: HistoricalBuckets
  fetchedAt: number
  errors: Array<{ slug: string; message: string }>
}

/**
 * Compute a value at the timestamp closest to `targetTs`, within `tolerance`.
 * Used for MoM / YoY lookups in the various daily series.
 */
function valueAtNearest(
  series: Array<{ timestamp: number }>,
  targetTs: number,
  toleranceSec: number,
  reduce: (pt: { timestamp: number }) => number,
): number {
  let best: { timestamp: number } | undefined
  let bestDist = Infinity
  for (const pt of series) {
    const d = Math.abs(pt.timestamp - targetTs)
    if (d < bestDist && d <= toleranceSec) {
      best = pt
      bestDist = d
    }
  }
  return best ? reduce(best) : 0
}

/**
 * Build the 24h / MoM / YoY delta triple plus a 30-day sparkline series for a
 * protocol-keyed time series, using `reduce` to collapse each point to a
 * single value. For aggregate counters we sum across all protocols.
 */
function buildDeltaTriple(
  series: OverviewTimeseriesPoint[],
  reduce: (pt: OverviewTimeseriesPoint) => number,
): DeltaTriple {
  if (series.length === 0) {
    return { change24h: 0, changeMoM: 0, changeYoY: 0, sparkline: [] }
  }
  const latest = series[series.length - 1]
  const latestVal = reduce(latest)
  const t0 = latest.timestamp

  const v24 = valueAtNearest(series, t0 - 86400, 2 * 86400, (p) => reduce(p as OverviewTimeseriesPoint))
  const vMoM = valueAtNearest(series, t0 - 30 * 86400, 4 * 86400, (p) => reduce(p as OverviewTimeseriesPoint))
  const vYoY = valueAtNearest(series, t0 - 365 * 86400, 14 * 86400, (p) => reduce(p as OverviewTimeseriesPoint))

  const sparkCutoff = t0 - 30 * 86400
  const sparkline = series
    .filter((p) => p.timestamp >= sparkCutoff)
    .map((p) => ({ timestamp: p.timestamp, value: reduce(p) }))

  return {
    change24h: v24 > 0 ? latestVal - v24 : 0,
    changeMoM: vMoM > 0 ? latestVal - vMoM : 0,
    changeYoY: vYoY > 0 ? latestVal - vYoY : 0,
    sparkline,
  }
}

export async function loadOverview(): Promise<OverviewResponse> {
  const slugs = PROTOCOLS.map((p) => p.defillamaSlug)
  const histories = await fetchAllProtocolHistory(slugs)

  const errors: Array<{ slug: string; message: string }> = []
  const rows: OverviewProtocolRow[] = []

  let totalTvl = 0
  let totalBorrowed = 0
  let totalFees24h = 0
  let totalFees7d = 0

  const tvlByDay = new Map<number, Record<string, number>>()
  const borrowedByDay = new Map<number, Record<string, number>>()
  // Per-protocol daily fees timeseries (for revenue bar chart + cumulative).
  const feesByDay = new Map<number, Record<string, number>>()

  // Per-asset aggregation across all four protocols — keyed by day then symbol.
  const suppliedAssetByDay = new Map<number, Map<string, number>>()
  const borrowedAssetByDay = new Map<number, Map<string, number>>()

  function mergeAssetPoints(
    target: Map<number, Map<string, number>>,
    points: Array<{ timestamp: number; tokens: Record<string, number> }>,
  ) {
    for (const pt of points) {
      const bucket = target.get(pt.timestamp) ?? new Map<string, number>()
      for (const [rawSym, usd] of Object.entries(pt.tokens)) {
        if (!rawSym || !Number.isFinite(usd) || usd <= 0) continue
        const sym = rawSym.toUpperCase()
        bucket.set(sym, (bucket.get(sym) ?? 0) + usd)
      }
      target.set(pt.timestamp, bucket)
    }
  }

  PROTOCOLS.forEach((p, i) => {
    const h = histories[i]
    if (!h) {
      errors.push({ slug: p.slug, message: "fetch failed" })
      rows.push({
        slug: p.slug,
        name: p.name,
        color: p.color,
        tvl: 0,
        borrowed: 0,
        utilizationPct: 0,
        fees24h: 0,
        fees7d: 0,
        tvlShare: 0,
      })
      return
    }

    const supplied = h.currentTvl + h.currentBorrowed
    const utilization = supplied > 0 ? (h.currentBorrowed / supplied) * 100 : 0

    rows.push({
      slug: p.slug,
      name: p.name,
      color: p.color,
      tvl: h.currentTvl,
      borrowed: h.currentBorrowed,
      utilizationPct: utilization,
      fees24h: h.fees24h,
      fees7d: h.fees7d,
      tvlShare: 0,
    })

    totalTvl += h.currentTvl
    totalBorrowed += h.currentBorrowed
    totalFees24h += h.fees24h
    totalFees7d += h.fees7d

    for (const point of h.tvl) {
      const bucket = tvlByDay.get(point.timestamp) ?? {}
      bucket[p.slug] = point.usd
      tvlByDay.set(point.timestamp, bucket)
    }
    for (const point of h.borrowed) {
      const bucket = borrowedByDay.get(point.timestamp) ?? {}
      bucket[p.slug] = point.usd
      borrowedByDay.set(point.timestamp, bucket)
    }
    for (const point of h.fees) {
      const bucket = feesByDay.get(point.timestamp) ?? {}
      bucket[p.slug] = point.usd
      feesByDay.set(point.timestamp, bucket)
    }
    mergeAssetPoints(suppliedAssetByDay, h.suppliedByAsset)
    mergeAssetPoints(borrowedAssetByDay, h.borrowedByAsset)
  })

  for (const r of rows) {
    r.tvlShare = totalTvl > 0 ? (r.tvl / totalTvl) * 100 : 0
  }

  // Each protocol's DefiLlama history ends at a slightly different timestamp
  // (different daily refresh clocks). After merging we trim the tail until
  // every protocol with a non-zero current total has a data point — otherwise
  // the stacked chart shows phantom drops to zero on the most recent 1-3 days.
  const activeSlugs = PROTOCOLS.filter((p) => {
    const r = rows.find((row) => row.slug === p.slug)
    return r && r.tvl > 0
  }).map((p) => p.slug)

  function buildProtocolSeries(
    byDay: Map<number, Record<string, number>>,
  ): OverviewTimeseriesPoint[] {
    const series = [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([timestamp, perProtocol]) => {
        const point: OverviewTimeseriesPoint = { timestamp }
        for (const p of PROTOCOLS) point[p.slug] = perProtocol[p.slug] ?? 0
        return point
      })
    while (series.length > 0) {
      const last = series[series.length - 1]
      const allHaveData = activeSlugs.every((slug) => (last[slug] as number) > 0)
      if (allHaveData) break
      series.pop()
    }
    return series
  }

  const tvlSeries = buildProtocolSeries(tvlByDay)
  const borrowedSeries = buildProtocolSeries(borrowedByDay)

  // Align supply + utilization to the same timestamps. We use tvlSeries as the
  // authoritative axis (trimmed to complete days) so all three protocol charts
  // share the same x-axis range.
  const borrowedByTs = new Map(borrowedSeries.map((p) => [p.timestamp, p]))
  const supplySeries: OverviewTimeseriesPoint[] = tvlSeries.map((tvlPoint) => {
    const borPoint = borrowedByTs.get(tvlPoint.timestamp)
    const point: OverviewTimeseriesPoint = { timestamp: tvlPoint.timestamp }
    for (const p of PROTOCOLS) {
      const tvl = (tvlPoint[p.slug] as number) || 0
      const bor = borPoint ? (borPoint[p.slug] as number) || 0 : 0
      point[p.slug] = tvl + bor
    }
    return point
  })
  const utilizationSeries: OverviewTimeseriesPoint[] = tvlSeries.map((tvlPoint) => {
    const borPoint = borrowedByTs.get(tvlPoint.timestamp)
    const point: OverviewTimeseriesPoint = { timestamp: tvlPoint.timestamp }
    for (const p of PROTOCOLS) {
      const tvl = (tvlPoint[p.slug] as number) || 0
      const bor = borPoint ? (borPoint[p.slug] as number) || 0 : 0
      const supplied = tvl + bor
      point[p.slug] = supplied > 0 ? (bor / supplied) * 100 : 0
    }
    return point
  })

  // ─── Market share % over time (Section 2 of The Lending Pulse) ─────────
  const marketShareSeries: OverviewTimeseriesPoint[] = tvlSeries.map((tvlPoint) => {
    const total = PROTOCOLS.reduce((s, p) => s + ((tvlPoint[p.slug] as number) || 0), 0)
    const point: OverviewTimeseriesPoint = { timestamp: tvlPoint.timestamp }
    for (const p of PROTOCOLS) {
      const v = (tvlPoint[p.slug] as number) || 0
      point[p.slug] = total > 0 ? (v / total) * 100 : 0
    }
    return point
  })

  // ─── Revenue (fees) time series + cumulative (Section 5) ───────────────
  // DefiLlama's `fees` endpoint returns one entry per day. We leave the raw
  // daily series alone for cumulative computation and expose a weekly-aggregated
  // version for the bar chart (daily bars are too noisy at a quarterly range).
  const feesDays = [...feesByDay.entries()].sort(([a], [b]) => a - b)
  // Trim any tail days where no protocol has yet reported fees (DefiLlama lag).
  while (feesDays.length > 0) {
    const [, perP] = feesDays[feesDays.length - 1]
    const anyVal = PROTOCOLS.some((p) => (perP[p.slug] ?? 0) > 0)
    if (anyVal) break
    feesDays.pop()
  }

  // Weekly aggregation: bucket by Monday 00:00 UTC.
  const WEEK_SEC = 7 * 86400
  const weeklyBuckets = new Map<number, Record<string, number>>()
  for (const [ts, perP] of feesDays) {
    // Align ts to Monday 00:00 UTC. DefiLlama's `date` is already UTC-midnight,
    // so we just subtract the weekday offset.
    const d = new Date(ts * 1000)
    const dow = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
    const weekStart = ts - dow * 86400
    const bucket = weeklyBuckets.get(weekStart) ?? {}
    for (const p of PROTOCOLS) {
      bucket[p.slug] = (bucket[p.slug] ?? 0) + (perP[p.slug] ?? 0)
    }
    weeklyBuckets.set(weekStart, bucket)
  }
  const feesWeeklySeries: OverviewTimeseriesPoint[] = [...weeklyBuckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ts, perP]) => {
      const point: OverviewTimeseriesPoint = { timestamp: ts }
      for (const p of PROTOCOLS) point[p.slug] = perP[p.slug] ?? 0
      return point
    })

  // Cumulative per protocol (daily resolution so the line stays smooth).
  const cumulative: Record<string, number> = Object.fromEntries(
    PROTOCOLS.map((p) => [p.slug, 0]),
  )
  const cumulativeFeesSeries: OverviewTimeseriesPoint[] = feesDays.map(([ts, perP]) => {
    const point: OverviewTimeseriesPoint = { timestamp: ts }
    for (const p of PROTOCOLS) {
      cumulative[p.slug] += perP[p.slug] ?? 0
      point[p.slug] = cumulative[p.slug]
    }
    return point
  })

  // ─── Per-asset aggregates (Sections 3 + 7) ─────────────────────────────
  // Total supplied collateral per asset = unborrowed supplied + borrowed
  // (the deposit base of that asset across the four protocols).
  const totalSuppliedAssetByDay = new Map<number, Map<string, number>>()
  for (const [ts, supMap] of suppliedAssetByDay.entries()) {
    const merged = new Map(supMap)
    const borMap = borrowedAssetByDay.get(ts)
    if (borMap) {
      for (const [sym, borUsd] of borMap.entries()) {
        merged.set(sym, (merged.get(sym) ?? 0) + borUsd)
      }
    }
    totalSuppliedAssetByDay.set(ts, merged)
  }
  for (const [ts, borMap] of borrowedAssetByDay.entries()) {
    if (totalSuppliedAssetByDay.has(ts)) continue
    totalSuppliedAssetByDay.set(ts, new Map(borMap))
  }

  const TOP_N = 7
  const latestSupplied = [...totalSuppliedAssetByDay.entries()].sort(([a], [b]) => b - a)[0]?.[1]
  const topAssets = latestSupplied
    ? [...latestSupplied.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, TOP_N)
        .map(([sym]) => sym)
    : []
  const topSet = new Set(topAssets)

  function buildAssetSeries(byDay: Map<number, Map<string, number>>): AssetTimeseriesPoint[] {
    const sorted = [...byDay.entries()].sort(([a], [b]) => a - b)
    const series: AssetTimeseriesPoint[] = sorted.map(([timestamp, assetMap]) => {
      const point: AssetTimeseriesPoint = { timestamp }
      let other = 0
      for (const sym of topAssets) point[sym] = 0
      for (const [sym, usd] of assetMap.entries()) {
        if (topSet.has(sym)) point[sym] = usd
        else other += usd
      }
      if (other > 0) point["Other"] = other
      return point
    })
    while (series.length > 0) {
      const last = series[series.length - 1]
      const hasData = topAssets.some((sym) => (last[sym] as number) > 0)
      if (hasData) break
      series.pop()
    }
    return series
  }

  const supplyByAssetSeries = buildAssetSeries(totalSuppliedAssetByDay)
  const borrowedByAssetSeries = buildAssetSeries(borrowedAssetByDay)

  // Per-asset utilization — only for the top assets.
  const utilizationByAssetSeries: AssetTimeseriesPoint[] = [...totalSuppliedAssetByDay.keys()]
    .sort((a, b) => a - b)
    .map((ts) => {
      const sup = totalSuppliedAssetByDay.get(ts)!
      const bor = borrowedAssetByDay.get(ts)
      const point: AssetTimeseriesPoint = { timestamp: ts }
      for (const sym of topAssets) {
        const s = sup.get(sym) ?? 0
        const b = bor?.get(sym) ?? 0
        point[sym] = s > 0 ? (b / s) * 100 : 0
      }
      return point
    })
  while (utilizationByAssetSeries.length > 0) {
    const last = utilizationByAssetSeries[utilizationByAssetSeries.length - 1]
    const hasData = topAssets.some((sym) => (last[sym] as number) > 0)
    if (hasData) break
    utilizationByAssetSeries.pop()
  }

  // Collateral-type breakdown — sum across classified buckets.
  const collateralByTypeSeries: AssetTypeTimeseriesPoint[] = [
    ...totalSuppliedAssetByDay.entries(),
  ]
    .sort(([a], [b]) => a - b)
    .map(([timestamp, assetMap]) => {
      const point: AssetTypeTimeseriesPoint = {
        timestamp,
        native: 0,
        lst: 0,
        lrt: 0,
        stable: 0,
        other: 0,
      }
      for (const [sym, usd] of assetMap.entries()) {
        point[classifyAsset(sym)] += usd
      }
      return point
    })
  while (collateralByTypeSeries.length > 0) {
    const last = collateralByTypeSeries[collateralByTypeSeries.length - 1]
    const total = ASSET_TYPE_STACK_ORDER.reduce((s, t) => s + (last[t] as number), 0)
    if (total > 0) break
    collateralByTypeSeries.pop()
  }

  // Per-protocol per-asset latest snapshot. Used to populate the
  // `byProtocol` field on RankedAssetRow so the Top Collateral /
  // Top Borrowed tables can render protocol-stacked breakdown bars.
  // For the supplied side, "supply" = unborrowed + borrowed per asset
  // per protocol, mirroring what `totalSuppliedAssetByDay` aggregates.
  const latestSupByProtocol = new Map<string, Record<string, number>>()
  const latestBorByProtocol = new Map<string, Record<string, number>>()
  histories.forEach((h, i) => {
    if (!h) return
    const slug = PROTOCOLS[i].slug
    const supPt = h.suppliedByAsset.at(-1)
    const borPt = h.borrowedByAsset.at(-1)
    function bump(
      map: Map<string, Record<string, number>>,
      tokens: Record<string, number> | undefined,
    ) {
      if (!tokens) return
      for (const [rawSym, usd] of Object.entries(tokens)) {
        if (!Number.isFinite(usd) || usd <= 0) continue
        const sym = rawSym.toUpperCase()
        const cur = map.get(sym) ?? {}
        cur[slug] = (cur[slug] ?? 0) + usd
        map.set(sym, cur)
      }
    }
    // Supplied = unborrowed + borrowed (matches totalSuppliedAssetByDay).
    bump(latestSupByProtocol, supPt?.tokens)
    bump(latestSupByProtocol, borPt?.tokens)
    // Borrowed = the borrowed slice only.
    bump(latestBorByProtocol, borPt?.tokens)
  })

  // Top asset rankings (rows for a table). Snapshot values from latest day.
  function rankLatest(
    byDay: Map<number, Map<string, number>>,
    perProtocolBySym: Map<string, Record<string, number>>,
    limit = 10,
  ): RankedAssetRow[] {
    const latest = [...byDay.entries()].sort(([a], [b]) => b - a)[0]?.[1]
    if (!latest) return []
    const entries = [...latest.entries()].sort(([, a], [, b]) => b - a)
    const total = entries.reduce((s, [, v]) => s + v, 0)
    return entries.slice(0, limit).map(([symbol, usd]) => ({
      symbol,
      usd,
      sharePct: total > 0 ? (usd / total) * 100 : 0,
      type: classifyAsset(symbol),
      byProtocol: perProtocolBySym.get(symbol.toUpperCase()) ?? {},
    }))
  }
  const topCollateralAssets = rankLatest(totalSuppliedAssetByDay, latestSupByProtocol, 10)
  const topBorrowedAssets = rankLatest(borrowedAssetByDay, latestBorByProtocol, 10)

  // ─── Net supply flows per protocol (Section 2.2 of The Lending Pulse) ──
  // We isolate flows from price swings by valuing each day's token quantity
  // at the most recent observed price for that symbol. Daily flow = change in
  // (supplied-tokens × latest-price) summed across symbols. We compute daily
  // flows once, then bucket into BOTH weekly and monthly views.
  const dailyFlowsByProtocol: Record<string, Array<{ timestamp: number; flow: number }>> = {}
  // Per-(protocol, asset, day) USD-at-constant-prices series. For
  // token-path protocols (Aave V3, Spark, Morpho, ...), each `tokens` row
  // carries per-symbol USD. For USD-fallback protocols (Fluid, Compound
  // V3 base assets, Euler V2 vaults) it carries a single synthetic
  // "Mixed" symbol equal to the protocol's daily total, so the Sankey
  // still places them in the middle column with a single "Mixed"
  // inflow/outflow link instead of dropping them entirely.
  const assetUsdByProtocol: ProtocolAssetUsdSeries[] = []
  ;(() => {
    PROTOCOLS.forEach((p, i) => {
      const h = histories[i]
      if (!h) return

      // Build a daily "priced supply USD" series. Two paths:
      //
      //  1. Token-quantity path (preferred): value each day's tokens at the
      //     latest observed price so day-over-day deltas isolate real flows
      //     from price swings. Available for Aave V3, Spark, Morpho.
      //  2. USD-fallback path: when DefiLlama doesn't expose `tokens`
      //     quantities for a protocol (e.g. Fluid), use TVL + borrowed USD
      //     directly. This conflates flows with price moves, but at least the
      //     protocol shows up. Documented in the chart's footer copy.
      const sortedDays: Array<{ timestamp: number; usd: number }> = []

      const lastUsdPt = h.suppliedByAsset.at(-1)
      const lastQtyPt = h.suppliedByAssetQty.at(-1)
      const tokenPathAvailable = !!(lastUsdPt && lastQtyPt && Object.keys(lastQtyPt.tokens).length > 0)

      if (tokenPathAvailable) {
        const latestPrice: Record<string, number> = {}
        for (const [sym, qty] of Object.entries(lastQtyPt!.tokens)) {
          if (qty <= 0) continue
          const usd = lastUsdPt!.tokens[sym] ?? 0
          if (usd <= 0) continue
          latestPrice[sym] = usd / qty
        }
        const lastBorUsdPt = h.borrowedByAsset.at(-1)
        const lastBorQtyPt = h.borrowedByAssetQty.at(-1)
        if (lastBorUsdPt && lastBorQtyPt) {
          for (const [sym, qty] of Object.entries(lastBorQtyPt.tokens)) {
            if (qty <= 0 || latestPrice[sym] != null) continue
            const usd = lastBorUsdPt.tokens[sym] ?? 0
            if (usd <= 0) continue
            latestPrice[sym] = usd / qty
          }
        }

        // "Supplied" tokens on day d = suppliedByAssetQty[d] + borrowedByAssetQty[d]
        // because supply = unborrowed + borrowed at the token level.
        const suppliedQtyByDay = new Map<number, Record<string, number>>()
        for (const pt of h.suppliedByAssetQty) {
          suppliedQtyByDay.set(pt.timestamp, { ...pt.tokens })
        }
        for (const pt of h.borrowedByAssetQty) {
          const bucket = suppliedQtyByDay.get(pt.timestamp) ?? {}
          for (const [sym, qty] of Object.entries(pt.tokens)) {
            bucket[sym] = (bucket[sym] ?? 0) + qty
          }
          suppliedQtyByDay.set(pt.timestamp, bucket)
        }
        const sortedQtyDays = [...suppliedQtyByDay.entries()].sort(([a], [b]) => a - b)
        const perAssetDaily: ProtocolAssetUsdSeries["daily"] = []
        for (const [ts, qtys] of sortedQtyDays) {
          let sum = 0
          const tokens: Record<string, number> = {}
          for (const [sym, qty] of Object.entries(qtys)) {
            const price = latestPrice[sym]
            if (!price || !qty) continue
            const usd = qty * price
            sum += usd
            tokens[sym] = usd
          }
          sortedDays.push({ timestamp: ts, usd: sum })
          perAssetDaily.push({ timestamp: ts, tokens })
        }
        assetUsdByProtocol.push({ protocolSlug: p.slug, daily: perAssetDaily })
      } else {
        // USD-fallback: use total supplied = TVL + borrowed in USD.
        const tvlByTs = new Map<number, number>(h.tvl.map((pt) => [pt.timestamp, pt.usd]))
        const borByTs = new Map<number, number>(h.borrowed.map((pt) => [pt.timestamp, pt.usd]))
        const allTimestamps = new Set<number>([...tvlByTs.keys(), ...borByTs.keys()])
        const sortedTs = [...allTimestamps].sort((a, b) => a - b)
        const perAssetDaily: ProtocolAssetUsdSeries["daily"] = []
        for (const ts of sortedTs) {
          const tvl = tvlByTs.get(ts) ?? 0
          const bor = borByTs.get(ts) ?? 0
          const total = tvl + bor
          sortedDays.push({ timestamp: ts, usd: total })
          // Synthetic "Mixed" symbol so the Sankey can still attach an
          // inflow / outflow link for this protocol's net total.
          perAssetDaily.push({ timestamp: ts, tokens: { Mixed: total } })
        }
        assetUsdByProtocol.push({ protocolSlug: p.slug, daily: perAssetDaily })
      }

      // Compute daily flow series for this protocol — we'll bucket later.
      const dailyFlows: Array<{ timestamp: number; flow: number }> = []
      for (let k = 1; k < sortedDays.length; k++) {
        dailyFlows.push({
          timestamp: sortedDays[k].timestamp,
          flow: sortedDays[k].usd - sortedDays[k - 1].usd,
        })
      }
      dailyFlowsByProtocol[p.slug] = dailyFlows
    })
  })()

  function bucketFlowsBy(
    bucketFn: (ts: number) => number,
  ): OverviewTimeseriesPoint[] {
    const buckets = new Map<number, Record<string, number>>()
    for (const [slug, daily] of Object.entries(dailyFlowsByProtocol)) {
      for (const { timestamp, flow } of daily) {
        const key = bucketFn(timestamp)
        const bucket = buckets.get(key) ?? {}
        bucket[slug] = (bucket[slug] ?? 0) + flow
        buckets.set(key, bucket)
      }
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ts, perP]) => {
        const point: OverviewTimeseriesPoint = { timestamp: ts }
        for (const p of PROTOCOLS) point[p.slug] = perP[p.slug] ?? 0
        return point
      })
  }

  const netFlowWeeklySeries: OverviewTimeseriesPoint[] = bucketFlowsBy((ts) => {
    const d = new Date(ts * 1000)
    const dow = (d.getUTCDay() + 6) % 7
    return ts - dow * 86400
  })

  const netFlowMonthlySeries: OverviewTimeseriesPoint[] = bucketFlowsBy((ts) => {
    const d = new Date(ts * 1000)
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)
  })

  // ─── Sankey snapshots for the Net Supply Flows chart ───────────────────
  // Three trailing windows: W (7 days), M (30 days), Q (90 days). Each is
  // a three-column (asset inflow → protocol → asset outflow) shape ready
  // for the <NetFlowsSankey> client component. Computed at constant
  // prices via the per-(protocol, asset) USD series captured above.
  const netFlowsSankey = {
    week: buildNetFlowsSankey(assetUsdByProtocol, 7),
    month: buildNetFlowsSankey(assetUsdByProtocol, 30),
    quarter: buildNetFlowsSankey(assetUsdByProtocol, 90),
  }

  // ─── Net interest paid by borrowers (Tier 1 metric) ────────────────────
  // Daily series per protocol from DefiLlama's dailyUserFees endpoint.
  const userFeesByDay = new Map<number, Record<string, number>>()
  PROTOCOLS.forEach((p, i) => {
    const h = histories[i]
    if (!h) return
    for (const point of h.userFees) {
      const bucket = userFeesByDay.get(point.timestamp) ?? {}
      bucket[p.slug] = point.usd
      userFeesByDay.set(point.timestamp, bucket)
    }
  })
  const netInterestPaidDailySeries: OverviewTimeseriesPoint[] = [...userFeesByDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([timestamp, perProto]) => {
      const point: OverviewTimeseriesPoint = { timestamp }
      for (const p of PROTOCOLS) point[p.slug] = perProto[p.slug] ?? 0
      return point
    })

  // ─── Per-protocol revenue snapshot (for /revenue page) ─────────────────
  const revenueSnapshot: ProtocolRevenueSnapshot[] = PROTOCOLS.map((p, i) => {
    const h = histories[i]
    const fees30d = (h?.fees ?? []).slice(-30).reduce((s, pt) => s + pt.usd, 0)
    const cumulativeFees = (h?.fees ?? []).reduce((s, pt) => s + pt.usd, 0)
    const tvl = h?.currentTvl ?? 0
    // Annualized rev/TVL: 30d fees × (365/30) / tvl, expressed as percent.
    const revPerTvlAnnualized = tvl > 0 ? (fees30d * (365 / 30)) / tvl * 100 : 0
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      fees30d,
      revPerTvlAnnualized,
      cumulativeFees,
      tvl,
    }
  })

  // ─── Headline-counter delta triples (24h / MoM / YoY + sparkline) ─────
  function sumProtocols(point: OverviewTimeseriesPoint): number {
    return PROTOCOLS.reduce((s, p) => s + ((point[p.slug] as number) || 0), 0)
  }
  const totalSupplied = totalTvl + totalBorrowed
  const tvlDeltas = buildDeltaTriple(tvlSeries, sumProtocols)
  const borrowedDeltas = buildDeltaTriple(borrowedSeries, sumProtocols)
  const suppliedDeltas = buildDeltaTriple(supplySeries, sumProtocols)
  // Net interest paid: sum of daily user fees over each window. We use a
  // 30-day rolling sum so the headline reads as "interest paid over the past
  // month" rather than "interest paid yesterday" (which is too noisy).
  function rollingSum30d(series: OverviewTimeseriesPoint[]): OverviewTimeseriesPoint[] {
    return series.map((pt, i) => {
      const out: OverviewTimeseriesPoint = { timestamp: pt.timestamp }
      const start = Math.max(0, i - 29)
      for (const p of PROTOCOLS) {
        let acc = 0
        for (let k = start; k <= i; k++) acc += (series[k][p.slug] as number) || 0
        out[p.slug] = acc
      }
      return out
    })
  }
  const netInterestPaidRolling = rollingSum30d(netInterestPaidDailySeries)
  const netInterestPaidDeltas = buildDeltaTriple(netInterestPaidRolling, sumProtocols)
  const netInterestPaid30d = sumProtocols(netInterestPaidRolling.at(-1) ?? { timestamp: 0 })

  // Stablecoin debt share: walk topBorrowedAssets, classify, sum stables.
  const totalBorrowedRanked = topBorrowedAssets.reduce((s, r) => s + r.usd, 0)
  const stablecoinBorrowed = topBorrowedAssets
    .filter((r) => r.type === "stable")
    .reduce((s, r) => s + r.usd, 0)
  const stablecoinDebtSharePct =
    totalBorrowedRanked > 0 ? (stablecoinBorrowed / totalBorrowedRanked) * 100 : 0

  return {
    snapshot: {
      totalTvl,
      totalBorrowed,
      totalSupplied,
      tvlDeltas,
      borrowedDeltas,
      suppliedDeltas,
      netInterestPaid30d,
      netInterestPaidDeltas,
      stablecoinDebtSharePct,
      totalFees24h,
      totalFees7d,
      protocolCount: PROTOCOLS.length,
    },
    protocols: rows.sort((a, b) => b.tvl - a.tvl),
    tvlSeries,
    borrowedSeries,
    supplySeries,
    utilizationSeries,
    marketShareSeries,
    feesWeeklySeries,
    cumulativeFeesSeries,
    supplyByAssetSeries,
    borrowedByAssetSeries,
    utilizationByAssetSeries,
    collateralByTypeSeries,
    topCollateralAssets,
    topBorrowedAssets,
    topAssets,
    revenueSnapshot,
    netFlowWeeklySeries,
    netFlowMonthlySeries,
    netFlowsSankey,
    netInterestPaidDailySeries,
    historicalBuckets: buildHistoricalBuckets(histories),
    fetchedAt: Math.floor(Date.now() / 1000),
    errors,
  }
}
