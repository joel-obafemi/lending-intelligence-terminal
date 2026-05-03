/**
 * Curated E-Mode / Smart Collateral / max-LTV-mode registry.
 *
 * Each protocol has a different way to lift LTV beyond the per-reserve
 * baseline:
 *   - Aave V3 / Spark: E-Mode categories for correlated pairs (stables,
 *     ETH-correlated, BTC-correlated). Boosts both LTV and liquidation
 *     threshold for assets in that category.
 *   - Morpho Blue: per-market LLTV — max LLTV is set when each isolated
 *     market is created. We surface "highest LLTV market" as the
 *     theoretical ceiling.
 *   - Fluid: Smart Collateral mechanic — collateral can be a Fluid DEX
 *     position rather than a single token. The advertised cap is ~95%
 *     for paired-asset configurations.
 *
 * The numbers below are curated rather than read from on-chain because:
 *   (a) on-chain E-Mode categories shift slowly and a curated map
 *       is acceptable through the Compare page's "max theoretical"
 *       framing.
 *   (b) per-market Morpho LLTVs vary widely; we use the highest
 *       observed value across all matching MetaMorpho vaults at
 *       page-load time.
 *
 * Update when Aave / Spark add a new category, or when Fluid's max
 * Smart Collateral LLTV is bumped. Spark mirrors Aave's E-Mode policy
 * by inheritance.
 */

import { classifyAsset } from "./assets"

export interface EModeEligibility {
  /** Display label rendered in the parameter row. */
  label: string
  /** Optional max LTV available under this lift (0-1). Null when the
   *  protocol doesn't have a pre-known headline number. */
  liftedLtv: number | null
  /** Short tooltip explaining how the lift applies. */
  tooltip: string
}

const STABLE_EMODE: EModeEligibility = {
  label: "E-Mode: stablecoins",
  liftedLtv: 0.93,
  tooltip:
    "Stablecoin E-Mode category. Bumps LTV for stable→stable borrows beyond the per-reserve baseline; ~93% on Aave V3 / Spark.",
}

const ETH_EMODE: EModeEligibility = {
  label: "E-Mode: ETH-correlated",
  liftedLtv: 0.93,
  tooltip:
    "ETH-correlated E-Mode category (WETH / wstETH / weETH / cbETH and similar). Lifts LTV for paired-ETH borrows; ~93% on Aave V3 / Spark.",
}

const BTC_EMODE: EModeEligibility = {
  label: "E-Mode: BTC-correlated",
  liftedLtv: 0.78,
  tooltip:
    "BTC-correlated E-Mode category (WBTC / cbBTC / tBTC and similar). Smaller LTV lift than stables/ETH because of typical BTC volatility.",
}

const NO_EMODE: EModeEligibility = {
  label: "—",
  liftedLtv: null,
  tooltip: "No E-Mode category for this asset on this protocol.",
}

const SPARK_NO_EMODE: EModeEligibility = {
  label: "Standard LTV",
  liftedLtv: null,
  tooltip:
    "Spark inherits Aave V3's E-Mode model but only enables it on a subset of assets; this asset uses the standard reserve LTV.",
}

const MORPHO_PER_MARKET: EModeEligibility = {
  label: "Per-market LLTV",
  liftedLtv: null,
  tooltip:
    "Morpho Blue's LLTV is set per market. Highest LLTV is whichever isolated market with this asset as collateral was created with the most aggressive parameter — typically 91-94.5% for blue-chip stables / WETH / wstETH.",
}

const FLUID_SMART_COL: EModeEligibility = {
  label: "Smart Collateral",
  liftedLtv: 0.95,
  tooltip:
    "Fluid's Smart Collateral lets a paired-asset DEX position serve as collateral, lifting effective LTV to ~95% on supported pairs.",
}

const FLUID_STANDARD: EModeEligibility = {
  label: "Standard vault",
  liftedLtv: null,
  tooltip:
    "Fluid lists this asset in standard (non-Smart-Collateral) vaults at the per-vault LTV.",
}

const BTC_SYMBOLS = new Set(["WBTC", "CBBTC", "TBTC", "TBTCV2", "LBTC"])
const ETH_FAMILY = new Set([
  "WETH", "ETH", "WSTETH", "WEETH", "RETH", "CBETH", "EZETH", "RSETH", "OSETH",
])
const STABLE_FAMILY = new Set([
  "USDC", "USDT", "DAI", "USDS", "GHO", "PYUSD", "USDE", "FRAX",
])

/** Which E-Mode / Smart-Col / market-level lift applies for the given
 *  asset on the given protocol. */
export function eModeFor(symbol: string, protocolSlug: string): EModeEligibility {
  const sym = symbol.toUpperCase()
  if (protocolSlug === "aave-v3") {
    if (STABLE_FAMILY.has(sym)) return STABLE_EMODE
    if (ETH_FAMILY.has(sym)) return ETH_EMODE
    if (BTC_SYMBOLS.has(sym)) return BTC_EMODE
    return NO_EMODE
  }
  if (protocolSlug === "spark") {
    if (STABLE_FAMILY.has(sym)) return STABLE_EMODE
    if (ETH_FAMILY.has(sym)) return ETH_EMODE
    return SPARK_NO_EMODE
  }
  if (protocolSlug === "morpho-blue") {
    return MORPHO_PER_MARKET
  }
  if (protocolSlug === "fluid") {
    if (
      STABLE_FAMILY.has(sym) ||
      ETH_FAMILY.has(sym) ||
      BTC_SYMBOLS.has(sym)
    ) {
      return FLUID_SMART_COL
    }
    const t = classifyAsset(sym)
    if (t === "lst" || t === "lrt") return FLUID_SMART_COL
    return FLUID_STANDARD
  }
  return NO_EMODE
}
