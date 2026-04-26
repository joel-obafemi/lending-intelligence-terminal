/**
 * Auto Signal-of-the-Week cards for The Lending Pulse headline (Section 1).
 *
 * Takes the same per-protocol + per-asset series we already build in
 * `lib/overview.ts` and `lib/liquidations.ts` and extracts the 3-5 most
 * interesting one-week deltas. Pure function — no I/O, no side effects —
 * so the Overview page just calls `computeSignals(overview, liquidations)`
 * and renders the result.
 *
 * The signals are intentionally narrow: each one is a single fact with a
 * USD or percentage-point delta, a short label, and a color hint. The
 * narrative around them lives in the actual Lending Pulse edition text.
 */
import type { OverviewResponse, OverviewTimeseriesPoint } from "./overview"
import type { LiquidationResponse, LiquidationTimeseriesPoint } from "./liquidations"
import { PROTOCOLS } from "./protocols"

export type SignalDirection = "up" | "down" | "neutral"
export type SignalTone = "positive" | "negative" | "notable"

export interface Signal {
  /** Short headline (< 42 chars). Must read well standalone. */
  label: string
  /** Primary value display (e.g. "+$1.2B", "-8.3pp", "14.1%"). */
  value: string
  /** One-sentence context about what drove the move. */
  subtext: string
  /** Up / down / no-change arrow. */
  direction: SignalDirection
  /** Color hint: positive=green, negative=red, notable=orange. */
  tone: SignalTone
  /** Optional emoji/icon keyword for the card's accent. */
  iconKey?: "trend" | "liquidation" | "share" | "rate" | "asset"
}

/** Percentage-points delta (utilization gaps, share gaps, etc.). */
function ppString(pp: number): string {
  const sign = pp > 0 ? "+" : ""
  return `${sign}${pp.toFixed(1)}pp`
}

/** Percent change (USD growth, TVL change, etc.). */
function pctChangeString(pct: number): string {
  const sign = pct > 0 ? "+" : ""
  return `${sign}${pct.toFixed(1)}%`
}

function usdDeltaString(usd: number): string {
  const sign = usd > 0 ? "+" : ""
  const abs = Math.abs(usd)
  if (abs >= 1_000_000_000) return `${sign}$${(usd / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}$${(usd / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(usd / 1_000).toFixed(1)}K`
  return `${sign}$${usd.toFixed(0)}`
}

function sumProtocols(pt: OverviewTimeseriesPoint | undefined): number {
  if (!pt) return 0
  return PROTOCOLS.reduce((s, p) => s + ((pt[p.slug] as number) || 0), 0)
}

/**
 * Build a map of timestamp → point for quick "7 days ago" lookup, then pick
 * the point closest to `target` within a tolerance window.
 */
function pointNearest<T extends { timestamp: number }>(
  series: T[],
  target: number,
  toleranceSec = 2 * 86400,
): T | undefined {
  let best: T | undefined
  let bestDist = Infinity
  for (const pt of series) {
    const d = Math.abs(pt.timestamp - target)
    if (d < bestDist && d <= toleranceSec) {
      best = pt
      bestDist = d
    }
  }
  return best
}

export function computeSignals(
  overview: OverviewResponse,
  liquidations: LiquidationResponse | null,
): Signal[] {
  const signals: Signal[] = []

  // ─── 1) Week-over-week TVL change, overall + largest-mover protocol ──────
  const latestTvl = overview.tvlSeries.at(-1)
  if (latestTvl) {
    const weekAgo = pointNearest(overview.tvlSeries, latestTvl.timestamp - 7 * 86400)
    if (weekAgo) {
      const totalNow = sumProtocols(latestTvl)
      const totalThen = sumProtocols(weekAgo)
      const deltaUsd = totalNow - totalThen
      const deltaPct = totalThen > 0 ? (deltaUsd / totalThen) * 100 : 0
      signals.push({
        label: "Total TVL, 7-day change",
        value: `${usdDeltaString(deltaUsd)} (${pctChangeString(deltaPct)})`,
        subtext: deltaUsd >= 0
          ? `Supplied liquidity grew ${usdDeltaString(deltaUsd)} across the four protocols`
          : `Supplied liquidity fell ${usdDeltaString(Math.abs(deltaUsd))} across the four protocols`,
        direction: deltaUsd > 0 ? "up" : deltaUsd < 0 ? "down" : "neutral",
        tone: deltaUsd >= 0 ? "positive" : "negative",
        iconKey: "trend",
      })

      // Largest protocol-level TVL move this week, in absolute USD.
      let biggestProto: { slug: string; name: string; color: string; deltaUsd: number } | null = null
      for (const p of PROTOCOLS) {
        const now = (latestTvl[p.slug] as number) || 0
        const then = (weekAgo[p.slug] as number) || 0
        const delta = now - then
        if (!biggestProto || Math.abs(delta) > Math.abs(biggestProto.deltaUsd)) {
          biggestProto = { slug: p.slug, name: p.name, color: p.color, deltaUsd: delta }
        }
      }
      if (biggestProto && Math.abs(biggestProto.deltaUsd) >= 10_000_000) {
        signals.push({
          label: `${biggestProto.name} led the move`,
          value: usdDeltaString(biggestProto.deltaUsd),
          subtext: biggestProto.deltaUsd >= 0
            ? `Biggest inflow among the four protocols this week`
            : `Biggest outflow among the four protocols this week`,
          direction: biggestProto.deltaUsd > 0 ? "up" : "down",
          tone: biggestProto.deltaUsd >= 0 ? "positive" : "negative",
          iconKey: "share",
        })
      }
    }
  }

  // ─── 2) Biggest utilization swing (in percentage points) per protocol ───
  const latestUtil = overview.utilizationSeries.at(-1)
  if (latestUtil) {
    const weekAgoUtil = pointNearest(
      overview.utilizationSeries,
      latestUtil.timestamp - 7 * 86400,
    )
    if (weekAgoUtil) {
      let biggestUtil: { name: string; pp: number; nowPct: number } | null = null
      for (const p of PROTOCOLS) {
        const now = (latestUtil[p.slug] as number) || 0
        const then = (weekAgoUtil[p.slug] as number) || 0
        const pp = now - then
        if (!biggestUtil || Math.abs(pp) > Math.abs(biggestUtil.pp)) {
          biggestUtil = { name: p.name, pp, nowPct: now }
        }
      }
      if (biggestUtil && Math.abs(biggestUtil.pp) >= 1) {
        signals.push({
          label: `${biggestUtil.name} utilization`,
          value: `${biggestUtil.nowPct.toFixed(1)}% (${ppString(biggestUtil.pp)})`,
          subtext: biggestUtil.pp > 0
            ? `Borrowers leaning in — higher utilization means tighter withdrawals`
            : `Deleveraging — utilization eased off last week`,
          direction: biggestUtil.pp > 0 ? "up" : biggestUtil.pp < 0 ? "down" : "neutral",
          tone: "notable",
          iconKey: "rate",
        })
      }
    }
  }

  // ─── 3) Biggest asset-level supply shift (composition change) ───────────
  if (overview.supplyByAssetSeries.length >= 2) {
    const latestAssetPt = overview.supplyByAssetSeries.at(-1)!
    const weekAgoAssetPt = pointNearest(
      overview.supplyByAssetSeries,
      latestAssetPt.timestamp - 7 * 86400,
    )
    if (weekAgoAssetPt) {
      let biggestAsset: { symbol: string; deltaUsd: number; nowUsd: number } | null = null
      for (const sym of overview.topAssets) {
        const now = (latestAssetPt[sym] as number) || 0
        const then = (weekAgoAssetPt[sym] as number) || 0
        const delta = now - then
        if (!biggestAsset || Math.abs(delta) > Math.abs(biggestAsset.deltaUsd)) {
          biggestAsset = { symbol: sym, deltaUsd: delta, nowUsd: now }
        }
      }
      if (biggestAsset && Math.abs(biggestAsset.deltaUsd) >= 50_000_000) {
        signals.push({
          label: `${biggestAsset.symbol} deposit base`,
          value: usdDeltaString(biggestAsset.deltaUsd),
          subtext: biggestAsset.deltaUsd >= 0
            ? `Biggest asset-level inflow across the terminal this week`
            : `Biggest asset-level outflow — watch for contagion risk if this accelerates`,
          direction: biggestAsset.deltaUsd > 0 ? "up" : "down",
          tone: biggestAsset.deltaUsd >= 0 ? "positive" : "negative",
          iconKey: "asset",
        })
      }
    }
  }

  // ─── 4) Liquidation pressure this week vs prior ─────────────────────────
  if (liquidations && liquidations.available && liquidations.weeklyVolume.length >= 2) {
    const wk = liquidations.weeklyVolume
    const last = wk[wk.length - 1]
    const prior = wk[wk.length - 2]
    const lastTotal = PROTOCOLS.reduce((s, p) => s + ((last[p.slug] as number) || 0), 0)
    const priorTotal = PROTOCOLS.reduce((s, p) => s + ((prior[p.slug] as number) || 0), 0)
    const delta = lastTotal - priorTotal
    // Only surface if it's a meaningful change (>$5M absolute or >50% relative).
    const relChange = priorTotal > 0 ? (delta / priorTotal) * 100 : 0
    if (Math.abs(delta) >= 5_000_000 || Math.abs(relChange) >= 50) {
      signals.push({
        label: "Liquidation volume, weekly",
        value: `${usdDeltaString(delta)} W/W`,
        subtext: delta >= 0
          ? `Stress up — ${(delta > priorTotal ? "more than doubled" : `+${relChange.toFixed(0)}%`)} vs prior week`
          : `Stress easing — ${relChange.toFixed(0)}% vs prior week`,
        direction: delta > 0 ? "up" : "down",
        tone: delta >= 0 ? "negative" : "positive",
        iconKey: "liquidation",
      })
    }
  }

  // Keep the 4 most interesting, preferring notable/negative tones first so
  // risk-relevant signals don't get crowded out by benign growth cards.
  const toneRank: Record<SignalTone, number> = { negative: 0, notable: 1, positive: 2 }
  return signals.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]).slice(0, 4)
}
