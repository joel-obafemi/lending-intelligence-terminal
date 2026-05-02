/**
 * Sector-wide KPI extraction from the rate matrix.
 *
 * Powers the Verdict strip at the top of the Rate Monitor page. The KPIs
 * are deliberately scoped to **stablecoins and ETH-family** assets,
 * because long-tail BTC markets (CBBTC, WBTC) routinely produce 0.10%
 * "best borrow" picks that look like opportunities but are really
 * artefacts of borrow demand near zero. The previous version surfaced
 * those and the resulting cards looked broken.
 */

import type { RateMatrixCell } from "./rates"
import { PROTOCOL_BY_SLUG } from "./protocols"
import { classifyAsset } from "./assets"

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

/** Cross-protocol max-minus-min APY for one asset — the dispersion
 *  signal. When dispersion widens, arbitrage is appearing; when it
 *  narrows the market is converging. */
export interface RateDispersionKpi {
  /** APY span in percent (max − min). */
  spreadPct: number
  /** Asset symbol with the widest dispersion. */
  asset: string
  /** Protocol with the highest supply APY for the asset. */
  topProtocolName: string
  /** Protocol with the lowest supply APY for the asset. */
  bottomProtocolName: string
  topApyPct: number
  bottomApyPct: number
}

export interface RateKpis {
  bestSupply: RateKpi | null
  bestBorrow: RateKpi | null
  tightestSpread: (RateKpi & { spreadPct: number }) | null
  /** Stablecoin supply-rate dispersion across protocols. */
  stableDispersion: RateDispersionKpi | null
}

/** Cells below this active-borrow floor are excluded from the borrow /
 *  spread picks — typically frozen or deprecated reserves where the IRM
 *  has settled near zero and the rate isn't actionable. */
const MIN_BORROW_USD_FOR_KPI = 5_000_000
/** Borrow APY below this reads as "0.00%" in the matrix and is almost
 *  certainly a rate-frozen market (e.g. Spark's wstETH reserve at
 *  cap-utilization). */
const MIN_BORROW_APY_PCT = 0.1
/** Floor under the supply pick. Same logic as borrow — a 0.00% supply
 *  APY usually means no real activity, not "best". */
const MIN_SUPPLY_APY_PCT = 0.05

/** Asset families that produce *actionable* picks. BTC markets are
 *  excluded because near-zero borrow demand on long-tail BTC routinely
 *  yields a 0.10% "best borrow" that's not a real opportunity. */
function isActionableAsset(symbol: string): boolean {
  const t = classifyAsset(symbol)
  return t === "stable" || t === "native" || t === "lst" || t === "lrt"
}

/** Stablecoin-only filter, used by the dispersion metric and the
 *  attribution copy on the supply / borrow cards (we lead with
 *  "Best stablecoin …" since that's the comparable rate set). */
function isStable(symbol: string): boolean {
  return classifyAsset(symbol) === "stable"
}

function isLiveBorrowable(c: RateMatrixCell): boolean {
  if (c.borrowApy == null || !Number.isFinite(c.borrowApy)) return false
  if (c.borrowApy < MIN_BORROW_APY_PCT) return false
  if ((c.totalBorrowUsd ?? 0) < MIN_BORROW_USD_FOR_KPI) return false
  return true
}

/** Pull the sector-wide KPIs out of the rate matrix. */
export function computeRateKpis(cells: RateMatrixCell[]): RateKpis {
  let bestSupply: RateKpi | null = null
  let bestBorrow: RateKpi | null = null
  let tightestSpread: (RateKpi & { spreadPct: number }) | null = null

  for (const c of cells) {
    const cfg = PROTOCOL_BY_SLUG[c.protocolSlug]
    if (!cfg) continue
    if (!isActionableAsset(c.symbol)) continue
    const meta = {
      asset: c.symbol,
      protocolName: cfg.name,
      protocolColor: cfg.color,
    }

    if (
      c.supplyApy != null &&
      Number.isFinite(c.supplyApy) &&
      c.supplyApy > MIN_SUPPLY_APY_PCT &&
      (c.totalSupplyUsd ?? 0) >= MIN_BORROW_USD_FOR_KPI &&
      (!bestSupply || c.supplyApy > bestSupply.value)
    ) {
      bestSupply = { label: "Best supply APY", value: c.supplyApy, ...meta }
    }
    if (
      isLiveBorrowable(c) &&
      (!bestBorrow || c.borrowApy! < bestBorrow.value)
    ) {
      bestBorrow = { label: "Best borrow APY", value: c.borrowApy!, ...meta }
    }
    if (
      c.spread != null &&
      Number.isFinite(c.spread) &&
      isLiveBorrowable(c) &&
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

  return {
    bestSupply,
    bestBorrow,
    tightestSpread,
    stableDispersion: computeStableDispersion(cells),
  }
}

/** Find the stablecoin with the widest cross-protocol supply-APY span.
 *  Skips assets with fewer than 2 valid quotes (can't compare). */
function computeStableDispersion(cells: RateMatrixCell[]): RateDispersionKpi | null {
  const bySymbol = new Map<string, RateMatrixCell[]>()
  for (const c of cells) {
    if (!isStable(c.symbol)) continue
    if (
      c.supplyApy == null ||
      !Number.isFinite(c.supplyApy) ||
      c.supplyApy < MIN_SUPPLY_APY_PCT
    ) {
      continue
    }
    if ((c.totalSupplyUsd ?? 0) < MIN_BORROW_USD_FOR_KPI) continue
    const arr = bySymbol.get(c.symbol) ?? []
    arr.push(c)
    bySymbol.set(c.symbol, arr)
  }

  let best: RateDispersionKpi | null = null
  for (const [symbol, group] of bySymbol.entries()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => b.supplyApy! - a.supplyApy!)
    const top = sorted[0]
    const bottom = sorted[sorted.length - 1]
    const spreadPct = top.supplyApy! - bottom.supplyApy!
    if (!Number.isFinite(spreadPct) || spreadPct <= 0) continue
    if (best == null || spreadPct > best.spreadPct) {
      best = {
        spreadPct,
        asset: symbol,
        topProtocolName: PROTOCOL_BY_SLUG[top.protocolSlug]?.name ?? top.protocolSlug,
        bottomProtocolName: PROTOCOL_BY_SLUG[bottom.protocolSlug]?.name ?? bottom.protocolSlug,
        topApyPct: top.supplyApy!,
        bottomApyPct: bottom.supplyApy!,
      }
    }
  }
  return best
}
