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

/** Cells with less than this much in active borrows are excluded from the
 *  KPI picks — they're typically frozen / deprecated reserves where the
 *  IRM has settled at near-zero and the rate isn't actionable for any
 *  realistic borrower. */
const MIN_BORROW_USD_FOR_KPI = 5_000_000
/** Borrow APY below this floor reads as "0.00%" in the matrix and is almost
 *  certainly a frozen market (e.g. Spark's wstETH reserve, capped at 1
 *  wstETH against 11.54 already borrowed). */
const MIN_BORROW_APY_PCT = 0.1

function isLiveBorrowable(c: RateMatrixCell): boolean {
  if (c.borrowApy == null || !Number.isFinite(c.borrowApy)) return false
  if (c.borrowApy < MIN_BORROW_APY_PCT) return false
  if ((c.totalBorrowUsd ?? 0) < MIN_BORROW_USD_FOR_KPI) return false
  return true
}

/** Pull the sector-wide best supply / best borrow / tightest spread out
 *  of the full rate matrix. Skips cells with missing / null APYs and any
 *  reserve that's too small or rate-frozen to be a real signal. */
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
      // Same noise floor on the supply side — a 0.00% supply APY usually
      // means the reserve has no real activity, not that it's "best".
      c.supplyApy > 0.05 &&
      (c.totalSupplyUsd ?? 0) >= MIN_BORROW_USD_FOR_KPI &&
      (!bestSupply || c.supplyApy > bestSupply.value)
    ) {
      bestSupply = { label: "Best supply APY", value: c.supplyApy, ...meta }
    }
    if (
      isLiveBorrowable(c) &&
      // Lower borrow rate is "better"; ignore zero / null which usually
      // mean the asset is supply-only on that protocol.
      (!bestBorrow || c.borrowApy! < bestBorrow.value)
    ) {
      bestBorrow = { label: "Best borrow APY", value: c.borrowApy!, ...meta }
    }
    if (
      c.spread != null &&
      Number.isFinite(c.spread) &&
      // Spread is only meaningful on a market that's actually borrowable
      // and where supply earns something. Reuse the same liquidity floor
      // so we don't elect frozen reserves.
      isLiveBorrowable(c) &&
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
