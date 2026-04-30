/**
 * Methodology copy for every chart in the dashboard.
 *
 * Each chart component accepts a `methodologyKey?: string` prop. When set,
 * the chart's header renders a `<MethodologyTooltip>` populated from this
 * config — so methodology copy lives in one place and chart components
 * stay shape-only.
 *
 * Keys are stable strings (kebab-case). Adding a new chart? Add an entry
 * here, pass the key from the consumer page, done.
 */

export interface MethodologyEntry {
  /** Plain-language definition + how it's computed. 1-3 sentences. */
  text: string
  /** Where the underlying numbers come from. Surface attribution. */
  source?: string
  /** Optional deeper-dive URL. */
  href?: string
}

export const METHODOLOGY: Record<string, MethodologyEntry> = {
  // ─── Sector Overview ────────────────────────────────────────────────
  "sector-supply-by-protocol": {
    text:
      "Total supplied = available liquidity (TVL) plus active borrows, summed per protocol per day. Stacked by protocol so you can see which is gaining or losing share.",
    source: "DefiLlama /protocol/<slug> chainTvls.Ethereum + Ethereum-borrowed.",
  },
  "sector-borrows-by-protocol": {
    text:
      "Outstanding debt principal in USD per protocol. Daily DefiLlama snapshot of `Ethereum-borrowed`. Excludes paused / deprecated reserves.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "sector-tvl-by-protocol": {
    text:
      "TVL = unborrowed deposits sitting in the protocol on Ethereum mainnet. Different from total supply (which adds active borrows back).",
    source: "DefiLlama /protocol/<slug> chainTvls.Ethereum.tvl.",
  },
  "sector-utilization": {
    text:
      "Utilization = active borrows ÷ total supplied, weighted by deposits at the aggregate. The bigger this is, the more capital is being put to work.",
    source: "DefiLlama-derived.",
  },
  "sector-market-share-tvl": {
    text:
      "Share of total Ethereum lending TVL held by each protocol over time. Stacked area; sums to 100%.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "sector-net-supply-flows": {
    text:
      "Net new deposits per protocol, isolating flows from price moves. Daily flows are computed as the change in supplied-token-quantity × latest observed price, then summed into monthly buckets. Fluid uses a USD-delta fallback because DefiLlama doesn't expose its per-token quantities.",
    source: "DefiLlama /protocol/<slug> + price-stripped delta.",
  },
  "sector-real-yield-spread": {
    text:
      "TVL-weighted blended supply APY across the four largest stablecoins (USDC / USDT / DAI / USDS) minus the 4-week T-bill yield (FRED TB4WK). Above zero = depositors earn more than the risk-free rate.",
    source: "DefiLlama Yields + FRED TB4WK.",
  },
  "sector-stablecoin-debt-share": {
    text:
      "% of total cross-protocol active borrows denominated in stablecoins (USDC / USDT / DAI / USDS / GHO / etc.). Rising share = the system is more rate-sensitive (borrowing dollars), falling share = more directional (borrowing against stables to leverage longs).",
    source: "DefiLlama-derived per-asset borrow USD.",
  },
  "sector-take-rate": {
    text:
      "Sector take rate = annualized protocol revenue ÷ TVL. Sums each protocol's last-30-day fees, multiplies by 365/30, and divides by current TVL. A higher number means lenders/protocols are extracting more yield per dollar of deposits in the system.",
    source: "DefiLlama /summary/fees + /protocol/<slug>.",
  },
  "sector-utilization-headline": {
    text:
      "Sector-wide utilization = total active borrows ÷ total supplied (TVL + borrows), aggregated across all four tracked protocols. Tracks how full the lending market is overall.",
    source: "DefiLlama-derived.",
  },
  "sector-borrows-share": {
    text:
      "Share of total cross-protocol active borrows held by each protocol over time. 24-month stacked area, labelled annotations call out depegs, parameter changes, and liquidation cascades. Sums to 100% per day.",
    source: "DefiLlama /protocol/<slug> Ethereum-borrowed.",
  },
  "sector-net-flows-30d": {
    text:
      "Trailing-30-day net change in supplied USD per protocol, decomposed into (a) interest accrual — mechanical growth from borrowers paying interest, sourced from DefiLlama's dailyUserFees (or dailyFees fallback) — and (b) organic deposits / withdrawals = total net flow − interest accrual. Negative organic = depositors are net withdrawing.",
    source: "DefiLlama net-flow + dailyUserFees.",
  },
  "sector-collateral-mix-donut": {
    text:
      "Latest-day USD share of total supplied collateral across the four protocols, top-7 individual assets plus an 'Other' bucket.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "sector-borrow-mix-donut": {
    text:
      "Latest-day USD share of total active borrows across the four protocols, top-7 individual debt assets plus an 'Other' bucket.",
    source: "DefiLlama /protocol/<slug>.",
  },

  // ─── Collateral / composition ───────────────────────────────────────
  "collateral-by-asset-type": {
    text:
      "All Ethereum-mainnet collateral grouped by asset class: native ETH, liquid-staking tokens (LSTs), restaked tokens (LRTs), stablecoins, and other. Sums match total supplied per day.",
    source: "DefiLlama-derived; classification in lib/assets.ts.",
  },
  "collateral-composition-by-asset": {
    text:
      "Per-asset USD supplied across the four protocols, top-7 individual assets plus an 'Other' bucket. Stacked area.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "borrowed-composition-by-asset": {
    text:
      "Per-asset USD borrowed across the four protocols, top-7 plus 'Other'. Reveals which debt assets dominate the system.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "utilization-by-asset": {
    text:
      "Per-asset utilization = borrowed[asset] / supplied[asset], averaged across protocols. WETH and stablecoins typically run high; LSTs / LRTs are collateral-only and run near zero.",
    source: "DefiLlama-derived.",
  },

  // ─── Rates ──────────────────────────────────────────────────────────
  "rate-matrix": {
    text:
      "Live supply / borrow APY for the 10 largest assets across the four protocols. Aave V3 and SparkLend cells are read live on-chain via UiPoolDataProviderV3; Morpho and Fluid use DefiLlama Yields. The 30d row is DefiLlama's `apyMean30d`. Spread = borrow − supply. The +rew row appears when the pool has incentive APY layered on top.",
    source: "On-chain Aave/Spark + DefiLlama Yields.",
  },
  "rate-history": {
    text:
      "Three-year supply APY history per protocol for this asset (DefiLlama Yields /chart endpoint). The dashed line is the daily Federal Funds Rate (FRED DFF) for cross-reference — it sets the floor depositors are competing against.",
    source: "DefiLlama Yields + FRED DFF.",
  },

  // ─── Revenue ────────────────────────────────────────────────────────
  "revenue-weekly-fees": {
    text:
      "Weekly gross fees per protocol (sum of dailyFees from DefiLlama). Includes interest, flash-loan fees, and any liquidation cuts the protocol takes. Stacked by protocol.",
    source: "DefiLlama /summary/fees/<slug>.",
  },
  "revenue-cumulative": {
    text:
      "Cumulative gross fees by protocol since each protocol's first DefiLlama-tracked day. Shows compounding revenue, not weekly cadence.",
    source: "DefiLlama /summary/fees/<slug>.",
  },
  "revenue-by-recipient": {
    text:
      "Weekly fees split into where they go: supply-side (depositors), protocol treasury, and token holders (where the protocol distributes a portion to holders, e.g. AAVE buybacks). DefiLlama's authoritative split.",
    source: "DefiLlama /summary/fees/<slug>?dataType=...",
  },
  "revenue-liquidation-volume": {
    text:
      "Weekly total liquidation volume per protocol from the Liquidator Economy DB. Matched against fee spikes to read how much of a given week's revenue came from liquidations vs. organic interest.",
    source: "Liquidator Economy DB · liquidation_events.",
  },

  // ─── Per-protocol pages ─────────────────────────────────────────────
  "protocol-supply-by-asset": {
    text:
      "Per-asset supplied USD over time within a single protocol. Top-7 by latest-day value plus 'Other'. Reveals how the protocol's deposit base is composed.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "protocol-borrows-by-asset": {
    text:
      "Per-asset borrowed USD over time within a single protocol. Reveals which debt assets dominate this protocol's book.",
    source: "DefiLlama /protocol/<slug>.",
  },
  "protocol-top-markets": {
    text:
      "Top markets in this protocol ranked by total supply (TVL + borrowed). Bars are colored on a gradient so the dominant market is unmistakable.",
    source: "DefiLlama Yields /pools.",
  },

  // ─── Market detail ──────────────────────────────────────────────────
  "market-supply-borrow-vs-caps": {
    text:
      "Total supplied and borrowed USD over time for this market, with the on-chain supply / borrow caps drawn as dashed reference lines when available. Aave and Spark expose caps via UiPoolDataProviderV3; some Spark stablecoins are uncapped on-chain.",
    source: "DefiLlama + on-chain UiPoolDataProviderV3.",
  },
  "market-rate-history": {
    text:
      "Supply and borrow APY history for this market. Borrow APY is derived from the standard pool-based identity (supplyAPY ≈ borrowAPY × utilization × (1 − reserveFactor)) when no direct history is available.",
    source: "DefiLlama Yields + derived.",
  },
  "market-utilization": {
    text:
      "Utilization = borrowed ÷ total supplied for this market. Tracks how full the market is and how close it is to its kink rate.",
    source: "DefiLlama-derived.",
  },
  "market-irm-curve": {
    text:
      "The interest-rate model for this market, sampled across the [0, 100%] utilization range. The 'kink' is where the slope steepens; the green dashed line marks the current utilization. Aave/Spark use the standard V3 piecewise-linear formula.",
    source: "On-chain UiPoolDataProviderV3.",
  },
  "market-vault-allocation": {
    text:
      "How a Morpho vault deploys deposits across underlying Morpho Blue markets. Donut sums to total assets. The breakdown table on the right shows per-market state (supply / borrow / APY / utilization).",
    source: "Morpho blue-api.morpho.org.",
  },

  // ─── Risk page ──────────────────────────────────────────────────────
  "risk-stablecoin-debt-share-trend": {
    text:
      "% of total sector borrows that are stablecoin-denominated, monthly history. Same metric as the Sector Verdict card; this view shows the trajectory.",
    source: "DefiLlama-derived.",
  },
  "risk-liquidation-volume-weekly": {
    text:
      "Weekly liquidation volume per protocol over the trailing window. Stacked bars; spike correlation across protocols indicates systemic stress.",
    source: "Liquidator Economy DB · liquidation_events.",
  },
  "risk-bad-debt-time": {
    text:
      "Cumulative bad debt accrued per protocol over time. Currently driven by Morpho only — Aave V3, Spark, and Fluid don't surface bad-debt rows in our DB consistently.",
    source: "Liquidator Economy DB · liquidation_events (bad_debt > 0).",
  },
}

export function getMethodology(key: string | undefined): MethodologyEntry | null {
  if (!key) return null
  return METHODOLOGY[key] ?? null
}
