/**
 * Revenue decomposition for Section 5 of The Lending Pulse — builds on top
 * of the existing Overview aggregation and the liquidator-economy DB.
 *
 * Two lenses, answering two different questions:
 *
 * 1. **By recipient** (authoritative, from DefiLlama /summary/fees with
 *    dataType=daily{Fees,ProtocolRevenue,SupplySideRevenue,HoldersRevenue}).
 *    Splits each protocol's gross fees into:
 *      - Supply-side revenue — what depositors earn
 *      - Protocol revenue    — what the treasury keeps
 *      - Holders revenue     — buybacks/distributions to token holders
 *    Sum ≈ total fees. Answers "where does the money go?"
 *
 * 2. **By source** (estimated). Splits gross fees into:
 *      - Liquidation-driven  — rough estimate using our liquidator-economy
 *        DB: sum(debt_amount_usd × est. effective bonus rate per protocol).
 *      - Interest + other    — residual = total fees − liquidation estimate.
 *    Answers "volatility-driven vs steady-state lending income?" from the
 *    outline. Explicit estimate — documented in the returned object's
 *    `methodology` field and labelled "est." in the UI.
 */
import { PROTOCOLS } from "./protocols"
import { fetchFeeBreakdown } from "./defillama"
import { hasLiquidatorDb, liquidatorSql } from "./liquidator-db"
import { PROTOCOL_BY_LIQUIDATOR_SLUG } from "./protocols"

/**
 * Effective fraction of a liquidation event's debt-USD that accrues to the
 * protocol's fee reporting. NOT the full liquidation bonus — that usually
 * goes to liquidators. These are protocol-contribution estimates:
 *
 *   - Aave V3: Liquidation bonus 5-15% (varies by reserve). DefiLlama
 *     counts the full bonus as "fees" (gross). For source-split purposes
 *     we use ~8% as a weighted average and attribute the full bonus to
 *     liquidation source. Protocol treasury's cut is ~10% of that bonus,
 *     but that split is by RECIPIENT not SOURCE — doesn't matter here.
 *   - Spark: same model as Aave V3 (fork).
 *   - Morpho Blue: liquidation bonus = penalty × collateral. Typical
 *     bonuses ~5-15%. Morpho counts this in fees (supply-side = 0, goes
 *     entirely to liquidator). Use 8% weighted.
 *   - Fluid: DEX-like liquidation; the protocol collects a fee on the
 *     swap. Use 5% as a rough estimate.
 */
const LIQUIDATION_BONUS_ESTIMATE: Record<string, number> = {
  "aave-v3": 0.08,
  spark: 0.08,
  "morpho-blue": 0.08,
  fluid: 0.05,
}

export interface WeeklyRecipientPoint {
  /** Week start (Mon 00:00 UTC) */
  timestamp: number
  supplySide: number
  protocol: number
  holders: number
}

export interface ProtocolRevenueBreakdown {
  slug: string
  name: string
  color: string
  /** Total fees (gross) over the selected window */
  totalFees: number
  /** Sum of weekly supply-side revenue over the window */
  supplySideRevenue: number
  /** Sum of weekly protocol revenue */
  protocolRevenue: number
  /** Sum of weekly holders revenue */
  holdersRevenue: number
  /**
   * Fraction of gross fees that flow to the protocol treasury + holders.
   * (protocolRevenue + holdersRevenue) / totalFees. Higher = more value
   * captured internally; lower = more flows to depositors.
   */
  captureRate: number
  /** Estimated liquidation-driven portion of totalFees (USD). */
  estLiquidationFees: number
  /** Fraction of totalFees attributable to liquidation (0-1). */
  liquidationShare: number
  /** Weekly stacked series for charting. Spans `historyDays` (default
   *  365 — 12 months) so a reader can see the full trend rather than
   *  just three-month snapshots. */
  weekly: WeeklyRecipientPoint[]
}

export interface RevenueDecompResponse {
  /** Rolling window used for the per-protocol aggregates (days). */
  windowDays: number
  /** Window used for the per-protocol weekly chart series. Independent
   *  of `windowDays` so the cards stay 90d while the chart shows 12+
   *  months. */
  historyDays: number
  protocols: ProtocolRevenueBreakdown[]
  /** Human-readable methodology note for the estimated source split. */
  methodology: string
  /** True when the liquidator-economy DB is available (controls "source" panel). */
  liquidationDataAvailable: boolean
  fetchedAt: number
}

function bucketWeekly(series: { timestamp: number; usd: number }[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const pt of series) {
    const d = new Date(pt.timestamp * 1000)
    const dow = (d.getUTCDay() + 6) % 7 // Mon = 0
    const weekStart = pt.timestamp - dow * 86400
    out.set(weekStart, (out.get(weekStart) ?? 0) + pt.usd)
  }
  return out
}

function alignWeekly(
  fees: Map<number, number>,
  supply: Map<number, number>,
  protocol: Map<number, number>,
  holders: Map<number, number>,
): WeeklyRecipientPoint[] {
  const all = new Set<number>([
    ...fees.keys(),
    ...supply.keys(),
    ...protocol.keys(),
    ...holders.keys(),
  ])
  return [...all]
    .sort((a, b) => a - b)
    .map((timestamp) => ({
      timestamp,
      supplySide: supply.get(timestamp) ?? 0,
      protocol: protocol.get(timestamp) ?? 0,
      holders: holders.get(timestamp) ?? 0,
    }))
}

async function liquidationVolumeByProtocol(
  windowDays: number,
): Promise<Record<string, number>> {
  if (!hasLiquidatorDb()) return {}
  const now = Math.floor(Date.now() / 1000)
  const since = now - windowDays * 86400
  const rows = await liquidatorSql<{ protocol: string; volume: number }>`
    SELECT protocol, COALESCE(SUM(debt_amount_usd), 0) AS volume
    FROM liquidation_events
    WHERE block_timestamp >= ${since}
    GROUP BY protocol
  `
  const out: Record<string, number> = {}
  for (const r of rows) {
    const slug = PROTOCOL_BY_LIQUIDATOR_SLUG[r.protocol]
    if (!slug) continue
    out[slug] = Number(r.volume)
  }
  return out
}

export async function loadRevenueDecomp(
  windowDays = 90,
  historyDays = 365,
): Promise<RevenueDecompResponse> {
  // Pull DefiLlama fees + liquidation volumes in parallel. The liquidation
  // volume aggregate is keyed off the (shorter) windowDays — that's what
  // feeds the per-protocol cards' liquidation-share number.
  const [breakdowns, liqVolumes] = await Promise.all([
    Promise.all(PROTOCOLS.map((p) => fetchFeeBreakdown(p.defillamaSlug))),
    liquidationVolumeByProtocol(windowDays),
  ])

  const cardCutoff = Math.floor(Date.now() / 1000) - windowDays * 86400
  const chartCutoff = Math.floor(Date.now() / 1000) - historyDays * 86400

  const protocols: ProtocolRevenueBreakdown[] = PROTOCOLS.map((p, i) => {
    const bd = breakdowns[i]
    const inCardWindow = (pt: { timestamp: number }) => pt.timestamp >= cardCutoff
    const inChartWindow = (pt: { timestamp: number }) =>
      pt.timestamp >= chartCutoff

    // Card-side aggregates use the shorter rolling window (default 90d).
    const feesWindow = bd.fees.filter(inCardWindow)
    const supplyWindow = bd.supplySideRevenue.filter(inCardWindow)
    const protocolWindow = bd.protocolRevenue.filter(inCardWindow)
    const holdersWindow = bd.holdersRevenue.filter(inCardWindow)

    const totalFees = feesWindow.reduce((s, pt) => s + pt.usd, 0)
    const supplySide = supplyWindow.reduce((s, pt) => s + pt.usd, 0)
    const protocol = protocolWindow.reduce((s, pt) => s + pt.usd, 0)
    const holders = holdersWindow.reduce((s, pt) => s + pt.usd, 0)

    // Chart series uses the longer history window so the trend is visible.
    const weekly = alignWeekly(
      bucketWeekly(bd.fees.filter(inChartWindow)),
      bucketWeekly(bd.supplySideRevenue.filter(inChartWindow)),
      bucketWeekly(bd.protocolRevenue.filter(inChartWindow)),
      bucketWeekly(bd.holdersRevenue.filter(inChartWindow)),
    )

    const liqVolumeUsd = liqVolumes[p.slug] ?? 0
    const estLiquidationFees = liqVolumeUsd * (LIQUIDATION_BONUS_ESTIMATE[p.slug] ?? 0.08)
    const liquidationShare = totalFees > 0 ? Math.min(estLiquidationFees / totalFees, 1) : 0
    const captureRate = totalFees > 0 ? (protocol + holders) / totalFees : 0

    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      totalFees,
      supplySideRevenue: supplySide,
      protocolRevenue: protocol,
      holdersRevenue: holders,
      captureRate,
      estLiquidationFees,
      liquidationShare,
      weekly,
    }
  })

  return {
    windowDays,
    historyDays,
    protocols,
    methodology:
      "Revenue by recipient is the authoritative DefiLlama split " +
      "(supply-side / protocol treasury / holders). Liquidation-source " +
      "split estimates each protocol's liquidation-driven fees as " +
      "liquidation debt-volume × weighted liquidation bonus (Aave V3 / " +
      "Spark / Morpho Blue: 8%; Fluid: 5%). Residual fees = interest + " +
      "other. Bonus-rate assumptions are averages; true per-reserve values " +
      "vary 5-15%.",
    liquidationDataAvailable: hasLiquidatorDb(),
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
