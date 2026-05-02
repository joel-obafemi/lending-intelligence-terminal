/**
 * Cross-protocol comparison aggregates for the Fluid page.
 *
 * Two modules anchor the Fluid pitch:
 *  - **Capital Efficiency** — borrows ÷ supplied (TVL + borrows) by
 *    protocol. The ratio approximates "borrow supported per dollar
 *    deposited", the headline empirical Fluid claim.
 *  - **Liquidation Penalty** — weighted-average effective penalty paid
 *    on liquidation events, per protocol over the chosen window. Fluid
 *    advertises ~0.10%; this module makes the gap to other protocols
 *    measurable from the same liquidator-economy DB the Risk page reads.
 *
 * Each loader is pure aggregation over data we already fetch elsewhere
 * (overview + liquidator DB). No new external calls.
 */
import { loadOverview } from "./overview"
import { liquidatorSql, hasLiquidatorDb } from "./liquidator-db"
import { PROTOCOLS, PROTOCOL_BY_LIQUIDATOR_SLUG } from "./protocols"

export interface ProtocolEfficiencyRow {
  slug: string
  name: string
  color: string
  /** Total Borrowed ÷ Total Supplied (0-1). Higher = more borrow per
   *  $ deposited. */
  efficiency: number
  totalBorrowedUsd: number
  totalSuppliedUsd: number
}

export interface ProtocolLiquidationPenaltyRow {
  slug: string
  name: string
  color: string
  /** Weighted-average effective penalty: Σ(collateral − debt) ÷ Σ(debt).
   *  Returns null when the protocol had no liquidations in the window
   *  (rare, but happens for low-volume periods). */
  effectivePenaltyPct: number | null
  /** Number of events used in the average. */
  eventCount: number
  /** Total debt repaid in USD. */
  totalDebtUsd: number
}

export interface FluidComparisonResponse {
  efficiency: ProtocolEfficiencyRow[]
  liquidationPenalty: ProtocolLiquidationPenaltyRow[]
  /** Days lookback used for liquidation-penalty aggregation. */
  liquidationPeriodDays: number
}

/**
 * Build the per-protocol comparison rows used by the Fluid lens cards.
 * `liquidationPeriodDays` defaults to 90, matching the rest of the
 * dashboard's stress-window convention.
 */
export async function loadFluidComparisons(
  liquidationPeriodDays = 90,
): Promise<FluidComparisonResponse> {
  const [overview, penalties] = await Promise.all([
    loadOverview(),
    loadLiquidationPenaltyByProtocol(liquidationPeriodDays),
  ])

  const efficiency: ProtocolEfficiencyRow[] = overview.protocols.map((p) => {
    const supplied = p.tvl + p.borrowed
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      efficiency: supplied > 0 ? p.borrowed / supplied : 0,
      totalBorrowedUsd: p.borrowed,
      totalSuppliedUsd: supplied,
    }
  })

  return {
    efficiency,
    liquidationPenalty: penalties,
    liquidationPeriodDays,
  }
}

async function loadLiquidationPenaltyByProtocol(
  periodDays: number,
): Promise<ProtocolLiquidationPenaltyRow[]> {
  const blank: ProtocolLiquidationPenaltyRow[] = PROTOCOLS.map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    effectivePenaltyPct: null,
    eventCount: 0,
    totalDebtUsd: 0,
  }))
  if (!hasLiquidatorDb()) return blank

  const periodStart =
    periodDays <= 0 ? 0 : Math.floor(Date.now() / 1000) - periodDays * 86400

  // Sum collateral_seized − debt_repaid (the "bonus" paid to liquidators)
  // and the debt-repaid base, weighted by event size. Filter rows where
  // either side is null or the debt is zero — those would poison the ratio.
  const rows = await liquidatorSql<{
    protocol: string
    n: string
    debt: number
    bonus: number
  }>`
    SELECT
      protocol,
      COUNT(*)::bigint AS n,
      COALESCE(SUM(debt_amount_usd), 0) AS debt,
      COALESCE(
        SUM(collateral_amount_usd - debt_amount_usd),
        0
      ) AS bonus
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
      AND debt_amount_usd IS NOT NULL
      AND debt_amount_usd > 0
      AND collateral_amount_usd IS NOT NULL
    GROUP BY protocol
  `

  const byProtocol = new Map<string, { n: number; debt: number; bonus: number }>()
  for (const r of rows) {
    const slug = PROTOCOL_BY_LIQUIDATOR_SLUG[r.protocol]
    if (!slug) continue
    byProtocol.set(slug, {
      n: Number(r.n),
      debt: Number(r.debt),
      bonus: Number(r.bonus),
    })
  }

  return blank.map((row) => {
    const agg = byProtocol.get(row.slug)
    if (!agg || agg.debt <= 0) return row
    return {
      ...row,
      effectivePenaltyPct: (agg.bonus / agg.debt) * 100,
      eventCount: agg.n,
      totalDebtUsd: agg.debt,
    }
  })
}
