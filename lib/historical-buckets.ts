/**
 * Historical bucket snapshots for the Sector Overview's date-pickable
 * Composition Donuts and Top Markets tables.
 *
 * Each bucket represents a Week / Month / Quarter; we store an end-of-bucket
 * snapshot (the last day with full per-protocol data inside that bucket).
 * The picker UIs let the user pick a specific week / month / quarter and
 * we render the rankings as they stood at that point.
 *
 * Data sources:
 *  - Cross-protocol per-asset USD daily series (already aggregated upstream)
 *    drives the donut rankings.
 *  - Per-(protocol, asset) USD daily series — built here from each protocol's
 *    DefiLlama per-asset history — drives the Top Markets table.
 *
 * Data limitations (surfaced in the UI for non-current periods):
 *  - APY / Utilization for individual markets has no historical source we can
 *    tap for free across all four protocols. Top Markets in historical mode
 *    therefore renders APY/Util cells as `—` with a footnote.
 */
import type { ProtocolHistory } from "./defillama"
import { PROTOCOLS } from "./protocols"
import { classifyAsset, type AssetType } from "./assets"
import { bucketStart } from "./time-bucketing"

export interface HistoricalRankedAsset {
  symbol: string
  usd: number
  sharePct: number
  type: AssetType
}

export interface HistoricalMarketRow {
  protocolSlug: string
  protocolName: string
  protocolColor: string
  asset: string
  /** USD supplied (= unborrowed + borrowed) for this (protocol, asset) on bucket-end day. */
  totalSupplyUsd: number
  /** USD borrowed for this (protocol, asset) on bucket-end day. */
  totalBorrowUsd: number
  /** Available liquidity = totalSupplyUsd − totalBorrowUsd. */
  tvlUsd: number
}

export interface HistoricalBucket {
  /** Stable id used by the picker (e.g. "2026-04", "2026-Q1", "2026-W18"). */
  id: string
  /** Display label (e.g. "Apr 2026", "Q1 2026", "Week of Apr 27, 2026"). */
  label: string
  /** UTC midnight unix seconds of the day used for the snapshot — the latest
   *  day inside the bucket that had full coverage. */
  endTs: number
  /** Sector totals on bucket-end day, used to keep donut sums consistent. */
  totalSuppliedUsd: number
  totalBorrowedUsd: number
  /** Top collateral assets (cross-protocol summed) at bucket-end day. */
  topCollateral: HistoricalRankedAsset[]
  /** Top borrowed assets at bucket-end day. */
  topBorrowed: HistoricalRankedAsset[]
  /** Top markets across protocols at bucket-end, sorted by total supply USD.
   *  No APY / Util — those columns are blanked out in the UI. */
  topMarkets: HistoricalMarketRow[]
}

export interface HistoricalBuckets {
  weeks: HistoricalBucket[]
  months: HistoricalBucket[]
  quarters: HistoricalBucket[]
}

const TOP_ASSETS_LIMIT = 10
const TOP_MARKETS_LIMIT = 30
const WEEKS_RETAINED = 52
const MONTHS_RETAINED = 24
const QUARTERS_RETAINED = 8

/** Format a UTC timestamp for the bucket id. */
function bucketId(ts: number, granularity: "week" | "month" | "quarter"): string {
  const d = new Date(ts * 1000)
  const y = d.getUTCFullYear()
  if (granularity === "month") {
    return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  }
  if (granularity === "quarter") {
    return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
  }
  // ISO week number — quick approximation: week of year.
  const jan1 = Date.UTC(y, 0, 1) / 1000
  const weekNum = Math.floor((ts - jan1) / (7 * 86400)) + 1
  return `${y}-W${String(weekNum).padStart(2, "0")}`
}

function bucketLabel(ts: number, granularity: "week" | "month" | "quarter"): string {
  const d = new Date(ts * 1000)
  if (granularity === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
  }
  if (granularity === "quarter") {
    return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
  }
  // Week of MMM DD, YYYY
  return `Week of ${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`
}

/** Build an array of (bucket-start-ts, list-of-day-ts-in-bucket) pairs from a
 *  set of available daily timestamps, capped to `limit` most-recent buckets. */
function groupDaysByBucket(
  availableTs: number[],
  granularity: "week" | "month" | "quarter",
  limit: number,
): Array<{ bucketStartTs: number; daysInBucket: number[] }> {
  const buckets = new Map<number, number[]>()
  for (const ts of availableTs) {
    const start = bucketStart(ts, granularity)
    const arr = buckets.get(start) ?? []
    arr.push(ts)
    buckets.set(start, arr)
  }
  const sorted = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketStartTs, daysInBucket]) => ({
      bucketStartTs,
      daysInBucket: daysInBucket.sort((a, b) => a - b),
    }))
  // Drop any all-zero (empty) tail buckets — the chart-data trim already
  // clips incomplete trailing days, but a fresh week with no data still
  // produces an empty bucket.
  return sorted.slice(-limit)
}

/** Top-N ranking from a Map<symbol, usd> snapshot. */
function rankAssets(
  snapshot: Map<string, number>,
  limit: number,
): HistoricalRankedAsset[] {
  const entries = [...snapshot.entries()].sort(([, a], [, b]) => b - a)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  return entries.slice(0, limit).map(([symbol, usd]) => ({
    symbol,
    usd,
    sharePct: total > 0 ? (usd / total) * 100 : 0,
    type: classifyAsset(symbol),
  }))
}

/**
 * Build per-(protocol, asset) per-day USD maps from the raw protocol histories.
 * Returned shape: `Map<timestamp, Map<protocolSlug, Map<symbol, usd>>>`.
 */
function buildPerProtocolAssetByDay(
  histories: Array<ProtocolHistory | null>,
): {
  supplied: Map<number, Map<string, Map<string, number>>>
  borrowed: Map<number, Map<string, Map<string, number>>>
} {
  const supplied = new Map<number, Map<string, Map<string, number>>>()
  const borrowed = new Map<number, Map<string, Map<string, number>>>()
  PROTOCOLS.forEach((p, i) => {
    const h = histories[i]
    if (!h) return
    function ingest(
      target: Map<number, Map<string, Map<string, number>>>,
      points: Array<{ timestamp: number; tokens: Record<string, number> }>,
    ) {
      for (const pt of points) {
        let dayMap = target.get(pt.timestamp)
        if (!dayMap) {
          dayMap = new Map()
          target.set(pt.timestamp, dayMap)
        }
        let protoMap = dayMap.get(p.slug)
        if (!protoMap) {
          protoMap = new Map()
          dayMap.set(p.slug, protoMap)
        }
        for (const [rawSym, usd] of Object.entries(pt.tokens)) {
          if (!Number.isFinite(usd) || usd <= 0) continue
          const sym = rawSym.toUpperCase()
          protoMap.set(sym, (protoMap.get(sym) ?? 0) + usd)
        }
      }
    }
    ingest(supplied, h.suppliedByAsset)
    ingest(borrowed, h.borrowedByAsset)
  })
  return { supplied, borrowed }
}

/** Build the historical-bucket snapshots from raw protocol histories. */
export function buildHistoricalBuckets(
  histories: Array<ProtocolHistory | null>,
): HistoricalBuckets {
  // Per-(protocol, asset) per-day USD — used for the Top Markets per-bucket snapshot.
  const { supplied: protoSupplied, borrowed: protoBorrowed } =
    buildPerProtocolAssetByDay(histories)

  // Cross-protocol summed daily series — used for donut rankings.
  // Total Supply per asset per day = supplied + borrowed (across all protocols).
  const allDayKeys = new Set<number>([...protoSupplied.keys(), ...protoBorrowed.keys()])
  const sortedDayKeys = [...allDayKeys].sort((a, b) => a - b)

  function totalSuppliedAtDay(ts: number): Map<string, number> {
    const out = new Map<string, number>()
    const supDay = protoSupplied.get(ts)
    const borDay = protoBorrowed.get(ts)
    if (supDay) {
      for (const protoMap of supDay.values()) {
        for (const [sym, usd] of protoMap.entries()) {
          out.set(sym, (out.get(sym) ?? 0) + usd)
        }
      }
    }
    if (borDay) {
      for (const protoMap of borDay.values()) {
        for (const [sym, usd] of protoMap.entries()) {
          out.set(sym, (out.get(sym) ?? 0) + usd)
        }
      }
    }
    return out
  }

  function totalBorrowedAtDay(ts: number): Map<string, number> {
    const out = new Map<string, number>()
    const borDay = protoBorrowed.get(ts)
    if (borDay) {
      for (const protoMap of borDay.values()) {
        for (const [sym, usd] of protoMap.entries()) {
          out.set(sym, (out.get(sym) ?? 0) + usd)
        }
      }
    }
    return out
  }

  function topMarketsAtDay(ts: number): HistoricalMarketRow[] {
    const supDay = protoSupplied.get(ts)
    const borDay = protoBorrowed.get(ts)
    const rows: HistoricalMarketRow[] = []
    for (const cfg of PROTOCOLS) {
      const protoSup = supDay?.get(cfg.slug)
      const protoBor = borDay?.get(cfg.slug)
      // Union of asset symbols present on either side for this protocol-day.
      const symbols = new Set<string>()
      if (protoSup) for (const s of protoSup.keys()) symbols.add(s)
      if (protoBor) for (const s of protoBor.keys()) symbols.add(s)
      for (const sym of symbols) {
        const supUsd = protoSup?.get(sym) ?? 0
        const borUsd = protoBor?.get(sym) ?? 0
        const totalSupply = supUsd + borUsd
        if (totalSupply <= 0) continue
        rows.push({
          protocolSlug: cfg.slug,
          protocolName: cfg.name,
          protocolColor: cfg.color,
          asset: sym,
          totalSupplyUsd: totalSupply,
          totalBorrowUsd: borUsd,
          tvlUsd: supUsd,
        })
      }
    }
    return rows
      .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd)
      .slice(0, TOP_MARKETS_LIMIT)
  }

  function buildOne(
    granularity: "week" | "month" | "quarter",
    limit: number,
  ): HistoricalBucket[] {
    const groups = groupDaysByBucket(sortedDayKeys, granularity, limit)
    const out: HistoricalBucket[] = []
    for (const { bucketStartTs, daysInBucket } of groups) {
      // End-of-bucket snapshot day: the LATEST day in the bucket. We don't
      // need to verify protocol coverage day-by-day because the upstream
      // trimming in `loadOverview` already caps the daily series at the
      // last day where every active protocol has data.
      const endTs = daysInBucket[daysInBucket.length - 1]
      const supSnap = totalSuppliedAtDay(endTs)
      const borSnap = totalBorrowedAtDay(endTs)
      const totalSupplied = [...supSnap.values()].reduce((s, v) => s + v, 0)
      const totalBorrowed = [...borSnap.values()].reduce((s, v) => s + v, 0)
      out.push({
        id: bucketId(bucketStartTs, granularity),
        label: bucketLabel(bucketStartTs, granularity),
        endTs,
        totalSuppliedUsd: totalSupplied,
        totalBorrowedUsd: totalBorrowed,
        topCollateral: rankAssets(supSnap, TOP_ASSETS_LIMIT),
        topBorrowed: rankAssets(borSnap, TOP_ASSETS_LIMIT),
        topMarkets: topMarketsAtDay(endTs),
      })
    }
    return out
  }

  return {
    weeks: buildOne("week", WEEKS_RETAINED),
    months: buildOne("month", MONTHS_RETAINED),
    quarters: buildOne("quarter", QUARTERS_RETAINED),
  }
}
