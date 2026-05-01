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
      "How much yield the sector is producing per dollar of TVL, annualized. We sum each protocol's last 30 days of gross fees, scale that up to a year (×365/30), then divide by current TVL. A higher take rate means deposits are working harder across the system.",
    source: "DefiLlama /summary/fees + /protocol/<slug>.",
  },
  "sector-utilization-headline": {
    text:
      "Sector-wide utilization = total active borrows ÷ total supplied (TVL + borrows), aggregated across all four tracked protocols. Tracks how full the lending market is overall.",
    source: "DefiLlama-derived.",
  },
  "sector-share-borrows": {
    text:
      "Share of total cross-protocol active borrows held by each protocol over time. 24-month stacked area, labelled annotations call out depegs, parameter changes, and liquidation cascades. Sums to 100% per day. Borrows is the most direct read on which protocol is doing the actual lending business.",
    source: "DefiLlama /protocol/<slug> Ethereum-borrowed.",
  },
  "sector-share-supply": {
    text:
      "Share of total cross-protocol supply (deposits + active borrows) held by each protocol over time. 24-month stacked area; sums to 100% per day. Wider than the Borrows view because it includes idle deposit capacity that hasn't been borrowed against yet.",
    source: "DefiLlama /protocol/<slug>: chainTvls.Ethereum + Ethereum-borrowed.",
  },
  "sector-share-available": {
    text:
      "Share of available liquidity (DefiLlama's net-liquidity TVL — deposits minus active borrows) held by each protocol over time. 24-month stacked area; sums to 100% per day. Reads as the unborrowed-capacity slice the protocols are competing on; can shift with borrow demand even when deposits don't move.",
    source: "DefiLlama /protocol/<slug>.chainTvls.Ethereum.tvl.",
  },
  /** @deprecated Use sector-share-borrows. Retained as an alias so any
   *  outside link to the old key still resolves to the (now lens-specific)
   *  borrows methodology. */
  "sector-borrows-share": {
    text:
      "Share of total cross-protocol active borrows held by each protocol over time. 24-month stacked area, labelled annotations call out depegs, parameter changes, and liquidation cascades. Sums to 100% per day.",
    source: "DefiLlama /protocol/<slug> Ethereum-borrowed.",
  },
  "sector-net-flows": {
    text:
      "Per-bucket change in supplied USD per protocol over the last 24 months, stacked vertically. Default bucket is monthly; the toggle re-aggregates into weekly or quarterly. Daily flows are price-stripped (token-quantity deltas valued at the latest observed price) so the chart isolates real flow from price moves. Bars above zero are net deposits, below zero are net withdrawals; the stack height is the protocols' summed contribution for that period.",
    source: "DefiLlama /protocol/<slug> token-quantity deltas, weekly bucketed, re-aggregated to W / M / Q.",
  },
  /** @deprecated Use sector-net-flows. The previous trailing-30d
   *  Organic-vs-Interest split was retired when the chart moved to a
   *  time-series view. */
  "sector-net-flows-30d": {
    text:
      "Per-protocol net change in supplied USD over the selected window. The chart now shows the trend over time (W / M / Q toggle) rather than a single trailing-30d snapshot.",
    source: "DefiLlama /protocol/<slug>.",
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
      "Three-year supply APY history per protocol for this asset (DefiLlama Yields /chart endpoint). The dashed line is the daily Federal Funds Rate (FRED DFF) for cross-reference. It sets the floor depositors are competing against.",
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

  // ─── Aave V3 protocol-specific lens ─────────────────────────────────
  "aave-multi-chain-footprint": {
    text:
      "Aave V3's Available Liquidity (DefiLlama net-liquidity TVL) on every chain it's deployed on. Sourced from /protocol/aave-v3 currentChainTvls. The chart's job is to show whether Aave's center of gravity is shifting off mainnet — track this monthly. The long tail past the top 7 is folded into 'Other chains'.",
    source: "DefiLlama /protocol/aave-v3 currentChainTvls.",
  },
  "aave-isolation-mode-watch": {
    text:
      "Every Aave V3 reserve currently configured with a non-zero debt ceiling (i.e. in isolation mode), with the on-chain ceiling, the current isolation-mode debt against that ceiling, and % used. Sorted by % used descending so reserves nearest a ceiling — the early-stress signals — surface first. Frozen / paused reserves are tagged but kept in the list so the reader can see the full isolation universe.",
    source: "On-chain UiPoolDataProviderV3 (debtCeiling + isolationModeTotalDebt).",
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
  "risk-stablecoin-debt-share": {
    text:
      "Share of total cross-protocol active borrows denominated in stablecoins (USDC, USDT, DAI, USDS, GHO, PYUSD, USDe, etc.). A higher number means the system is more rate-sensitive and less directional. A drop usually signals leverage-on, with traders borrowing volatile assets against stables.",
    source: "DefiLlama-derived per-asset borrow USD.",
  },
  "risk-stablecoin-debt-share-trend": {
    text:
      "Stablecoin debt share over the last 24 months, monthly. Same metric as the Verdict card; this view shows the trajectory and the 50% midpoint as a visual anchor.",
    source: "DefiLlama-derived.",
  },
  "risk-oracle-concentration": {
    text:
      "Share of cross-protocol priced collateral that depends on a single oracle vendor. Computed by walking the latest-day top collateral assets and attributing each to its primary oracle in the curated map. A high number means a single price-feed outage or manipulation can hit a large slice of the sector at once.",
    source: "Curated lib/oracles.ts × DefiLlama topCollateralAssets.",
  },
  "risk-oracle-map": {
    text:
      "Per-protocol per-asset oracle assignments across Aave V3, Spark, Morpho, and Fluid. Assets not yet in the curated map render as 'Other'. Composite feeds (e.g. wstETH = Lido exchange rate × Chainlink ETH/USD) are attributed to their root price source.",
    source: "Curated lib/oracles.ts.",
  },
  "risk-liquidation-intensity": {
    text:
      "Per-protocol 90-day liquidation volume divided by current TVL. Reads as 'how much of this protocol's deposit base went through forced liquidation in the last quarter'. Fluid typically runs hotter than Aave V3 here because of how its smart-collateral mechanics interact with volatile pairs.",
    source: "Liquidator Economy DB · liquidation_events ÷ DefiLlama TVL.",
  },
  "risk-liquidation-volume-weekly": {
    text:
      "Weekly liquidation volume per protocol over the trailing 90 days. Stacked bars; correlation across protocols on the same week is a systemic-stress fingerprint.",
    source: "Liquidator Economy DB · liquidation_events.",
  },

  // ─── Compare page ───────────────────────────────────────────────────
  "compare-supply-history": {
    text:
      "Daily base supply APY for the selected asset on each tracked protocol over the last 90 days. Reward APYs (incentive programs) are excluded so the line reads as pure interest yield. The dashed Fed Funds (DFF) overlay only appears for stablecoins, where it's the right risk-free benchmark.",
    source: "DefiLlama Yields /chart/{poolId} + FRED DFF.",
  },
  "compare-supply-spread": {
    text:
      "Cross-protocol dispersion in base supply APY for the selected asset, day by day. Computed as max minus min across the four protocols. Wider dispersion means an arbitrage gap is opening; tighter means the market has converged.",
    source: "DefiLlama Yields /chart/{poolId}.",
  },
  "compare-parameters": {
    text:
      "Side-by-side risk parameter snapshot for the selected asset. Aave V3 + Spark numbers come from the live UiPoolDataProviderV3 reads; Fluid from on-chain vault reads; Morpho parameters vary per market and surface here as 'varies by market' until the Compare page's Pass B adds a per-market range view.",
    source: "On-chain UiPoolDataProviderV3 + DefiLlama Yields.",
  },
  "compare-ltv": {
    text:
      "Maximum loan-to-value at which a position can be opened against this asset, in percent. The cell with the highest LTV gets an ↑ badge.",
  },
  "compare-liq-threshold": {
    text:
      "The LTV at which a position becomes eligible for liquidation. The gap between Max LTV and Liquidation Threshold is the natural buffer a borrower has before forced liquidation.",
  },
  "compare-liq-bonus": {
    text:
      "Discount that liquidators receive on seized collateral, relative to oracle price. Lower is better for borrowers. Aave-style protocols quote this as a multiplier minus 1 (e.g. 1.05 → 5% bonus); Fluid quotes the penalty directly.",
  },
  "compare-oracle": {
    text:
      "The price feed each protocol uses to price this asset. Vendor color matches the curated Oracle Map on the Risk page. Where the on-chain reads expose an oracle address (Aave, Spark), the row links to Etherscan; otherwise the vendor classification comes from the curated map.",
    source: "On-chain UiPoolDataProviderV3 + curated lib/oracles.ts.",
  },
  "compare-capital-efficiency": {
    text:
      "Each bar is the maximum dollar of borrow that $1 of the selected collateral asset supports on that protocol — i.e. its Max LTV at face value. The leverage stat below each bar is 1 / (1 − LTV), the corresponding maximum recursive-loop leverage. E-Mode (Aave) / Smart Collateral (Fluid) lift these numbers on specific paired-asset tracks; that lens lands in Pass B.",
    source: "On-chain UiPoolDataProviderV3 + Fluid / Morpho APIs.",
  },
  "risk-bad-debt-time": {
    text:
      "Cumulative bad debt accrued per protocol over time. Currently driven by Morpho only. Aave V3, Spark, and Fluid don't surface bad-debt rows in our DB consistently.",
    source: "Liquidator Economy DB · liquidation_events (bad_debt > 0).",
  },
}

export function getMethodology(key: string | undefined): MethodologyEntry | null {
  if (!key) return null
  return METHODOLOGY[key] ?? null
}
