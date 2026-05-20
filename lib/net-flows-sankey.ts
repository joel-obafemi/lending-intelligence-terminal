/**
 * Net Flows Sankey aggregation.
 *
 * Three-column Sankey layout for the Sector Overview's net supply flows:
 *
 *   LEFT             MIDDLE                    RIGHT
 *   asset inflows  → protocol net total      → asset outflows
 *   (USDT $215M)     (Aave +$51M)              (weETH $209M)
 *   (wstETH $151M)   (Spark +$218M)            (PYUSD $81M)
 *   ...              (Euler -$107M)           ...
 *
 * The aggregation is computed at constant prices (latest observed) so the
 * deltas isolate real flows from price swings — same convention as the
 * existing weekly/monthly net flow series.
 *
 * Per-asset breakdown is only available for protocols whose DefiLlama
 * history exposes token quantities (currently Aave V3, Spark, Morpho).
 * Protocols on the USD-only fallback path (Fluid, Compound V3, Euler V2)
 * contribute a single protocol-level net total under the synthetic
 * "Mixed" asset bucket.
 */
import { PROTOCOLS } from "./protocols"

export interface SankeyNode {
  /** Stable identifier for the node — e.g. "asset_in:USDT" / "protocol:aave-v3" / "asset_out:weETH". */
  id: string
  /** Display name shown on the Sankey label. */
  name: string
  /** Node kind for column placement + color picking. */
  kind: "asset_in" | "protocol" | "asset_out"
  /** Net total at the node — USD. Positive on inflow + protocol-positive, negative on outflow + protocol-negative. */
  totalUsd: number
  /** Optional protocol color when kind === "protocol"; helps the chart match the dashboard palette. */
  color?: string
}

export interface SankeyLink {
  /** Index of the source node in the parent `nodes` array. */
  source: number
  /** Index of the target node in the parent `nodes` array. */
  target: number
  /** Flow magnitude in USD. Always positive (direction encoded by source/target column). */
  value: number
}

export interface NetFlowsSankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** Sum of all positive deltas across the window. */
  totalInflowUsd: number
  /** Sum of all negative deltas (absolute value) across the window. */
  totalOutflowUsd: number
  /** Window length in days the deltas cover. */
  windowDays: number
  /** Unix seconds at which the window ends (the latest snapshot day). */
  endTimestamp: number
}

/**
 * Per-(protocol, asset, day) USD-at-constant-prices series. The producer
 * (lib/overview.ts) builds this from the existing DefiLlama token-quantity
 * path while computing daily flows, so this Sankey aggregation does not
 * trigger any extra fetch.
 */
export interface ProtocolAssetUsdSeries {
  protocolSlug: string
  /** Sorted ascending by timestamp. */
  daily: Array<{
    timestamp: number
    /** Symbol → USD-at-constant-price for that day. */
    tokens: Record<string, number>
  }>
}

/**
 * Build a Sankey snapshot covering the trailing `windowDays`. Trailing
 * variant — use buildNetFlowsSankeyForRange for explicit calendar
 * boundaries (e.g. "May 2026").
 *
 *  - For each protocol, picks the last point as the END snapshot and the
 *    point closest to (END − windowDays * 86400) as the START.
 *  - For each (protocol, asset) where both snapshots have data, computes
 *    delta = end_usd − start_usd. Positive contributes to inflow links;
 *    negative contributes to outflow links.
 *  - Aggregates left/right column totals by asset symbol.
 *
 * Below-floor deltas are merged into "Other" buckets so the chart does not
 * disappear under a long tail of $50K rows. `maxAssetsPerSide` further
 * caps how many asset rows render on each side; everything beyond the cap
 * (sorted desc by magnitude) collapses into "Other" too.
 */
export function buildNetFlowsSankey(
  perProtocol: ProtocolAssetUsdSeries[],
  windowDays: number,
  minLinkUsd = 1_000_000,
  maxAssetsPerSide = 18,
): NetFlowsSankeyData {
  const endTs = perProtocol.reduce(
    (max, p) => (p.daily.length > 0 ? Math.max(max, p.daily[p.daily.length - 1]!.timestamp) : max),
    0,
  )
  if (endTs === 0) {
    return { nodes: [], links: [], totalInflowUsd: 0, totalOutflowUsd: 0, windowDays, endTimestamp: 0 }
  }
  const startTargetTs = endTs - windowDays * 86400
  return buildSankeyInternal(perProtocol, startTargetTs, endTs, windowDays, minLinkUsd, maxAssetsPerSide)
}

/**
 * Build a Sankey snapshot covering a specific calendar window. Used by
 * the month / quarter pickers so users see "May 2026" or "Q2 2026"
 * deltas instead of a trailing 30 / 90.
 *
 *  - startTs / endTs are unix seconds, inclusive on the start side.
 *  - For partial periods (e.g. the current month before month-end), the
 *    end snapshot is the latest available data day, so the chart still
 *    renders as month-to-date.
 *  - The two snapshots are picked as the closest available days to the
 *    requested boundaries, so weekend / holiday gaps in DefiLlama don't
 *    drop the period.
 */
export function buildNetFlowsSankeyForRange(
  perProtocol: ProtocolAssetUsdSeries[],
  startTs: number,
  endTs: number,
  minLinkUsd = 1_000_000,
  maxAssetsPerSide = 18,
): NetFlowsSankeyData {
  if (endTs <= startTs) {
    return { nodes: [], links: [], totalInflowUsd: 0, totalOutflowUsd: 0, windowDays: 0, endTimestamp: endTs }
  }
  const windowDays = Math.max(1, Math.round((endTs - startTs) / 86400))
  return buildSankeyInternal(perProtocol, startTs, endTs, windowDays, minLinkUsd, maxAssetsPerSide)
}

/**
 * Shared core. Picks the closest available snapshots to `startTargetTs`
 * and `endTargetTs` per protocol, then computes per-(protocol, asset)
 * deltas and emits the Sankey shape.
 */
function buildSankeyInternal(
  perProtocol: ProtocolAssetUsdSeries[],
  startTargetTs: number,
  endTargetTs: number,
  windowDays: number,
  minLinkUsd: number,
  maxAssetsPerSide: number,
): NetFlowsSankeyData {
  // Latest available data day per protocol — capped at endTargetTs so
  // future requests still snap to the most recent observed day.
  const effectiveEndTs = perProtocol.reduce((max, p) => {
    if (p.daily.length === 0) return max
    const lastAvailable = p.daily[p.daily.length - 1]!.timestamp
    const capped = Math.min(lastAvailable, endTargetTs)
    return Math.max(max, capped)
  }, 0)
  if (effectiveEndTs === 0) {
    return { nodes: [], links: [], totalInflowUsd: 0, totalOutflowUsd: 0, windowDays, endTimestamp: 0 }
  }
  // Re-target the locals for the rest of the function so the existing
  // delta logic just sees a single (startTargetTs, endTs) pair.
  const endTs = effectiveEndTs

  // ── Per-(protocol, asset) delta computation ─────────────────────────
  // Each row: { protocolSlug, assetSymbol, deltaUsd }. Positive deltaUsd
  // becomes an inflow; negative becomes an outflow.
  interface Delta {
    protocolSlug: string
    asset: string
    deltaUsd: number
  }
  const deltas: Delta[] = []
  for (const p of perProtocol) {
    if (p.daily.length === 0) continue
    const sorted = p.daily // already sorted asc
    // Pick the END point: the latest day <= endTs. For "current period
    // in progress" calls this is the latest available data point. For
    // historical periods (e.g. April 2026 viewed from May) this snaps
    // to the closing day of the period.
    let endPoint = sorted[0]!
    for (const point of sorted) {
      if (point.timestamp <= endTs) endPoint = point
      else break
    }
    // Pick the START point: closest day to startTargetTs. Tolerates a
    // few days of weekend / holiday gap so the period does not collapse.
    let startPoint = sorted[0]
    let bestDist = Math.abs(sorted[0]!.timestamp - startTargetTs)
    for (const point of sorted) {
      const d = Math.abs(point.timestamp - startTargetTs)
      if (d < bestDist) {
        bestDist = d
        startPoint = point
      }
      if (point.timestamp > startTargetTs + 2 * 86400) break
    }
    if (!startPoint || startPoint.timestamp >= endPoint.timestamp) continue
    const symbols = new Set<string>([
      ...Object.keys(endPoint.tokens),
      ...Object.keys(startPoint.tokens),
    ])
    for (const sym of symbols) {
      const endUsd = endPoint.tokens[sym] ?? 0
      const startUsd = startPoint.tokens[sym] ?? 0
      const delta = endUsd - startUsd
      if (!Number.isFinite(delta) || delta === 0) continue
      deltas.push({ protocolSlug: p.protocolSlug, asset: sym, deltaUsd: delta })
    }
  }

  // ── Aggregate inflow / outflow totals per (asset, side) ─────────────
  const inflowByAsset = new Map<string, number>()
  const outflowByAsset = new Map<string, number>()
  const protocolNet = new Map<string, number>()
  for (const d of deltas) {
    if (d.deltaUsd > 0) {
      inflowByAsset.set(d.asset, (inflowByAsset.get(d.asset) ?? 0) + d.deltaUsd)
    } else {
      outflowByAsset.set(d.asset, (outflowByAsset.get(d.asset) ?? 0) + Math.abs(d.deltaUsd))
    }
    protocolNet.set(d.protocolSlug, (protocolNet.get(d.protocolSlug) ?? 0) + d.deltaUsd)
  }

  // ── Bucket tiny rows into "Other" so the chart stays legible ────────
  // Two filters: absolute floor (drop rows below minLinkUsd) and per-side
  // node cap (rank remaining rows desc, keep top N, fold rest into Other).
  const inflowBuckets = bucketByThresholds(inflowByAsset, minLinkUsd, maxAssetsPerSide)
  const outflowBuckets = bucketByThresholds(outflowByAsset, minLinkUsd, maxAssetsPerSide)

  // ── Build node arrays ───────────────────────────────────────────────
  const nodes: SankeyNode[] = []
  const idIndex = new Map<string, number>()
  function addNode(n: SankeyNode): number {
    if (idIndex.has(n.id)) return idIndex.get(n.id)!
    const idx = nodes.length
    nodes.push(n)
    idIndex.set(n.id, idx)
    return idx
  }

  // Left column: inflow assets sorted by total, then "Other" last.
  for (const [asset, usd] of [...inflowBuckets.entries()].sort(
    ([aA, a], [aB, b]) => (aA === "Other" ? 1 : aB === "Other" ? -1 : b - a),
  )) {
    addNode({ id: `asset_in:${asset}`, name: asset, kind: "asset_in", totalUsd: usd })
  }
  // Middle column: protocols in canonical order.
  for (const p of PROTOCOLS) {
    const net = protocolNet.get(p.slug) ?? 0
    if (Math.abs(net) < minLinkUsd && !hasAnyLink(deltas, p.slug, minLinkUsd)) {
      // Protocol contributes nothing meaningful in this window — skip.
      continue
    }
    addNode({
      id: `protocol:${p.slug}`,
      name: p.name,
      kind: "protocol",
      totalUsd: net,
      color: p.color,
    })
  }
  // Right column: outflow assets sorted by total, "Other" last.
  for (const [asset, usd] of [...outflowBuckets.entries()].sort(
    ([aA, a], [aB, b]) => (aA === "Other" ? 1 : aB === "Other" ? -1 : b - a),
  )) {
    addNode({ id: `asset_out:${asset}`, name: asset, kind: "asset_out", totalUsd: usd })
  }

  // ── Build links ─────────────────────────────────────────────────────
  // Inflow: asset_in:{asset} → protocol:{slug}. Outflow: protocol:{slug} → asset_out:{asset}.
  // Tiny per-link contributions roll into "Other" on the correct side.
  const links: SankeyLink[] = []
  for (const d of deltas) {
    if (d.deltaUsd > 0) {
      const assetKey = inflowBuckets.has(d.asset) ? d.asset : "Other"
      const sourceId = `asset_in:${assetKey}`
      const targetId = `protocol:${d.protocolSlug}`
      const sIdx = idIndex.get(sourceId)
      const tIdx = idIndex.get(targetId)
      if (sIdx == null || tIdx == null) continue
      links.push({ source: sIdx, target: tIdx, value: d.deltaUsd })
    } else {
      const assetKey = outflowBuckets.has(d.asset) ? d.asset : "Other"
      const sourceId = `protocol:${d.protocolSlug}`
      const targetId = `asset_out:${assetKey}`
      const sIdx = idIndex.get(sourceId)
      const tIdx = idIndex.get(targetId)
      if (sIdx == null || tIdx == null) continue
      links.push({ source: sIdx, target: tIdx, value: Math.abs(d.deltaUsd) })
    }
  }

  // Collapse duplicate (source, target) pairs that arise after Other-bucketing.
  const collapsed = new Map<string, SankeyLink>()
  for (const l of links) {
    const key = `${l.source}>${l.target}`
    const prev = collapsed.get(key)
    if (prev) prev.value += l.value
    else collapsed.set(key, { ...l })
  }

  const totalInflowUsd = [...inflowByAsset.values()].reduce((s, v) => s + v, 0)
  const totalOutflowUsd = [...outflowByAsset.values()].reduce((s, v) => s + v, 0)

  return {
    nodes,
    links: [...collapsed.values()],
    totalInflowUsd,
    totalOutflowUsd,
    windowDays,
    endTimestamp: endTs,
  }
}

/**
 * Group a usd-by-asset map into ranked buckets. First filter: drop anything
 * below `minUsd` into the "Other" bucket. Second filter: keep only the
 * top `maxKept` assets by magnitude; everything beyond that also rolls
 * into "Other".
 */
function bucketByThresholds(
  byAsset: Map<string, number>,
  minUsd: number,
  maxKept: number,
): Map<string, number> {
  const sorted = [...byAsset.entries()].sort(([, a], [, b]) => b - a)
  const out = new Map<string, number>()
  let otherTotal = 0
  for (let i = 0; i < sorted.length; i++) {
    const [asset, usd] = sorted[i]!
    if (usd >= minUsd && i < maxKept) {
      out.set(asset, usd)
    } else {
      otherTotal += usd
    }
  }
  if (otherTotal > 0) out.set("Other", otherTotal)
  return out
}

/**
 * Some protocols may have many tiny per-asset deltas that all roll into
 * "Other" and never produce a meaningful link. This guard keeps a protocol
 * column even when its main contributions land in the "Other" bucket so
 * the Sankey doesn't drop it.
 */
function hasAnyLink(
  deltas: Array<{ protocolSlug: string; deltaUsd: number }>,
  slug: string,
  minUsd: number,
): boolean {
  for (const d of deltas) {
    if (d.protocolSlug === slug && Math.abs(d.deltaUsd) >= minUsd) return true
  }
  return false
}
