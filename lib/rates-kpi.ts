/**
 * Sector-wide KPI extraction from the rate matrix.
 *
 * Surfaces the three numbers worth leading with at the top of the Rate
 * Monitor page: best supply, best borrow, and tightest spread (lender's
 * margin floor) across the entire matrix. Computed server-side from the
 * matrix the page already loads — no extra fetches.
 */

import type { RateMatrixCell } from "./rates"
import { PROTOCOL_BY_SLUG } from "./protocols"

export interface RateKpi {
  label: string
  /** APY in percent. */
  value: number
  /** Asset symbol (USDC / WETH / etc). */
  asset: string
  /** Protocol display name. */
  protocolName: string
  /** Protocol brand color. */
  protocolColor: string
}

export interface RateKpis {
  bestSupply: RateKpi | null
  bestBorrow: RateKpi | null
  tightestSpread: (RateKpi & { spreadPct: number }) | null
}

/** Pull the sector-wide best supply / best borrow / tightest spread out
 *  of the full rate matrix. Skips cells with missing / null APYs. */
export function computeRateKpis(cells: RateMatrixCell[]): RateKpis {
  let bestSupply: RateKpi | null = null
  let bestBorrow: RateKpi | null = null
  let tightestSpread: (RateKpi & { spreadPct: number }) | null = null

  for (const c of cells) {
    const cfg = PROTOCOL_BY_SLUG[c.protocolSlug]
    if (!cfg) continue
    const meta = {
      asset: c.symbol,
      protocolName: cfg.name,
      protocolColor: cfg.color,
    }

    if (
      c.supplyApy != null &&
      Number.isFinite(c.supplyApy) &&
      (!bestSupply || c.supplyApy > bestSupply.value)
    ) {
      bestSupply = { label: "Best supply APY", value: c.supplyApy, ...meta }
    }
    if (
      c.borrowApy != null &&
      Number.isFinite(c.borrowApy) &&
      // Lower borrow rate is "better"; ignore zero / null which usually
      // mean the asset is supply-only on that protocol.
      c.borrowApy > 0 &&
      (!bestBorrow || c.borrowApy < bestBorrow.value)
    ) {
      bestBorrow = { label: "Best borrow APY", value: c.borrowApy, ...meta }
    }
    if (
      c.spread != null &&
      Number.isFinite(c.spread) &&
      // Spread = borrow − supply. Tighter (smaller positive) = better for
      // the user. Negative spreads typically mean the cell is incentive-
      // distorted; skip those as outliers.
      c.spread > 0 &&
      (!tightestSpread || c.spread < tightestSpread.spreadPct)
    ) {
      tightestSpread = {
        label: "Tightest spread",
        value: c.spread,
        spreadPct: c.spread,
        ...meta,
      }
    }
  }

  return { bestSupply, bestBorrow, tightestSpread }
}
