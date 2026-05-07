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
  "aave-multi-chain-available": {
    text:
      "Aave V3's Available Liquidity (DefiLlama net-liquidity TVL = deposits minus active borrows) on every chain it's deployed on. The story this view answers is 'where is unborrowed capacity sitting' — the supply-side competition between deployments. Long tail past the top 7 individual chains is folded into 'Other (N chains)'.",
    source: "DefiLlama /protocol/aave-v3 currentChainTvls.",
  },
  "aave-multi-chain-borrows": {
    text:
      "Aave V3's active Borrows (outstanding debt principal in USD) on every chain it's deployed on. The story this view answers is 'where is the actual lending business happening' — borrows are the truer read on a deployment's economic activity than headline TVL. Long tail past the top 7 individual chains is folded into 'Other (N chains)'.",
    source: "DefiLlama /protocol/aave-v3 chainTvls.<chain>-borrowed.",
  },
  /** @deprecated Use `aave-multi-chain-available`. Retained as an alias so
   *  any external link to the original methodology key still resolves. */
  "aave-multi-chain-footprint": {
    text:
      "Aave V3's Available Liquidity (DefiLlama net-liquidity TVL) on every chain it's deployed on. The chart's job is to show whether Aave's center of gravity is shifting off mainnet — track this monthly. Long tail past the top 7 is folded into 'Other chains'.",
    source: "DefiLlama /protocol/aave-v3 currentChainTvls.",
  },
  // ─── Morpho protocol-specific lens ──────────────────────────────────
  "morpho-markets-table": {
    text:
      "Morpho's underlying isolated markets — the lending primitive itself, separate from the MetaMorpho vaults that aggregate across them. Each row is a single (loan asset, collateral asset, LLTV, oracle, IRM) tuple. We surface the top 50 by supply USD; the full universe is ~545 on Ethereum mainnet. Sortable on every numeric column. Click a row for the per-market detail page (cap utilization, IRM curve, etc).",
    source: "Morpho blue-api.morpho.org · markets query.",
  },
  "morpho-curator-concentration": {
    text:
      "How concentrated the Morpho curator economy is right now. The horizontal bar shows the top 5 curators' shares of curated TVL plus an 'Other' segment. The HHI (Herfindahl-Hirschman Index) is the sum of squared market shares — antitrust convention treats <1,500 as competitive, 1,500-2,500 as moderately concentrated, and >2,500 as highly concentrated. The 'Uncurated' bucket of permissionless markets is excluded from this calculation; that's a separate long-tail story.",
    source: "Morpho blue-api.morpho.org via lib/morpho-api.ts.",
  },

  // ─── Revenue page ───────────────────────────────────────────────────
  "revenue-take-rate-comparison": {
    text:
      "Per-protocol annualized Rev/TVL on a trailing-30-day rolling basis, plotted across the trailing 12 months. Each day's reading is sum of the prior 30 days of fees ÷ that day's TVL × 365/30. Smoothes weekly noise without losing recent dynamics. Reads as 'how efficiently is each protocol extracting from depositors?' — a sentence the per-card snapshot can't tell.",
    source: "DefiLlama /protocol/<slug> daily fees + chainTvls.Ethereum.tvl.",
  },
  "revenue-source-split-row": {
    text:
      "Per-protocol gross fees (90d) decomposed into Interest + other (residual) and Liquidation-driven (estimated). Bar width = gross fees so a reader can see absolute scale and split simultaneously. Liquidation share is sum(debt_amount_usd) × weighted bonus rate (Aave V3 / Spark / Morpho: 8%; Fluid: 5%) ÷ gross fees.",
    source: "DefiLlama /summary/fees + Liquidator Economy DB.",
  },

  // ─── Rate Monitor ───────────────────────────────────────────────────
  "rates-real-yield-spread-hero": {
    text:
      "Blended stablecoin supply APY (USDC + USDT + DAI + USDS, TVL-weighted across the four protocols) minus the FRED 4-week T-bill yield (TB4WK), daily over the trailing 18 months. Above zero = stablecoin lenders are earning a premium to short Treasuries; below zero = parking capital in T-bills pays better. Excludes incentive token rewards so the line is the pure interest spread.",
    source: "DefiLlama Yields /chart/{poolId} per stablecoin pool + FRED TB4WK.",
  },
  "rates-dispersion": {
    text:
      "Cross-protocol max-minus-min supply APY for the selected asset, plotted weekly over the trailing 18 months. Reads as 'how much arbitrage opportunity is there?' Wide dispersion = capital movement across protocols is paying off; narrow dispersion = the market is pricing the asset uniformly. Filters out timestamps where fewer than two protocols have data.",
    source: "DefiLlama Yields /chart/{poolId} per (asset × protocol).",
  },
  "rates-matrix": {
    text:
      "Live supply / borrow APY for every (protocol, asset) pair we cover. Aave V3 + Spark cells come from on-chain UiPoolDataProviderV3 reads; Morpho cells are TVL-weighted blends across MetaMorpho vaults that hold the asset; Fluid cells use DefiLlama Yields. The 30d-avg row beneath each cell is DefiLlama's apyMean30d. Spread = borrow − supply. Toggle Reward-adjusted to fold incentive APYs into the base rates and re-rank the Best Supply / Best Borrow columns.",
    source: "On-chain UiPoolDataProviderV3 + DefiLlama Yields + DefiLlama Coins.",
  },

  // ─── Fluid protocol-specific lens ───────────────────────────────────
  "fluid-capital-efficiency": {
    text:
      "Total active borrows ÷ total supplied (TVL + borrows) per protocol on Ethereum. Reads as 'cents of debt supported per dollar of capital deposited'. Fluid's higher LLTVs and smart-collateral mechanic typically push this ratio above peers. Excludes wrapped lending-pool fTokens that aren't pair-borrowable.",
    source: "DefiLlama /protocol/<slug> chainTvls.Ethereum + Ethereum-borrowed.",
  },
  "fluid-liquidation-penalty": {
    text:
      "Effective liquidation penalty paid out per protocol over the lookback window: Σ(collateral_seized − debt_repaid) ÷ Σ(debt_repaid), weighted by event size. This is what borrowers actually paid when liquidated — strictly empirical, not the headline parameter. Fluid advertises ~0.10%; this chart makes the gap to other protocols measurable.",
    source: "Liquidator-economy DB · liquidation_events table.",
  },

  // ─── Spark protocol-specific lens ───────────────────────────────────
  "spark-yield-panel": {
    text:
      "Three rates that map Spark's role as Sky's on-chain distribution arm. (1) Sky Savings Rate (SSR) — what USDS savers earn parking into Sky's sUSDS vault, identical to the headline rate on app.spark.fi/savings. Sourced from DefiLlama Yields' largest sUSDS pool. (2) Spark USDS Borrow APY — what borrowers pay on Spark's USDS LENDING market (a different product from the savings vault). Supply APY history comes from DefiLlama; borrow APY is derived via the standard pool-based identity (lib/derived-rates.ts) from utilization + the on-chain reserve factor. (3) 4-week T-bill (FRED TB4WK). The wedge between Borrow and SSR is the captured spread funding Spark's revenue; the wedge between SSR and T-bill is the depositor's premium over Treasuries.",
    source: "DefiLlama Yields (sUSDS savings + Spark USDS lending pool) + FRED TB4WK + lib/derived-rates.",
  },

  "aave-safety-module": {
    text:
      "The Safety Module (SM) is the staked-AAVE pool that backstops Aave protocol insolvency risk globally — slashable to cover bad debt on ANY reserve. SM Size is the AAVE held by the stkAAVE contract × current AAVE/USD. Max Slashable is the on-chain governance-set portion (currently 30%) that can be drained to cover bad debt. Backing Ratio is AAVE balance ÷ stkAAVE supply — drift below 100% is the signature of a recent slash event. The Umbrella card to the right tracks the newer per-reserve risk-capital layer that runs alongside the SM.",
    source: "On-chain stkAAVE.totalSupply + AAVE.balanceOf(stkAAVE) + AAVE/USD via Aave V3 reserve price feed.",
  },

  "aave-umbrella": {
    text:
      "Umbrella is Aave's per-reserve staking layer — slashable only against bad debt on the matching reserve, not protocol-wide. Stakers deposit aTokens (waUSDC, waUSDT, waWETH) or GHO directly into reserve-specific stake-token contracts. Coverage USD is the on-chain underlying-asset balance × current price. Lives alongside the legacy Safety Module, not in place of it. Numbers reconcile within snapshot drift against Chaos Labs' Umbrella table and TokenLogic's per-asset coverage donut.",
    source:
      "On-chain UmbrellaStakeToken.totalAssets() per reserve (addresses from BGD Labs aave-address-book). Underlying USD: stables + GHO at $1, WETH from Aave V3 reserve oracle.",
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
      "Top markets in this protocol ranked by total supply (Available Liquidity + active Borrows). Bars are colored on a gradient so the dominant market is unmistakable. Toggle the filter to see the ranking by Available Liquidity or by Borrows instead.",
    source: "DefiLlama Yields /pools.",
  },
  "protocol-top-markets-available": {
    text:
      "Top markets in this protocol ranked by Available Liquidity (DefiLlama's `tvlUsd`, the unborrowed deposit balance). Reads as 'where is the most idle supply sitting' — the markets a fresh borrower could draw from without crowding the rate.",
    source: "DefiLlama Yields /pools.tvlUsd.",
  },
  "protocol-top-markets-borrows": {
    text:
      "Top markets in this protocol ranked by active Borrows. Reads as 'where is the actual lending business happening' — the markets driving most of the protocol's interest revenue.",
    source: "DefiLlama Yields /pools.totalBorrowUsd.",
  },

  // ─── Market detail ──────────────────────────────────────────────────
  "market-supply-borrow-vs-caps": {
    text:
      "Total supplied and borrowed USD over time for this market, with the on-chain supply / borrow caps drawn as dashed reference lines when available. Aave and Spark expose caps via UiPoolDataProviderV3; some Spark stablecoins are uncapped on-chain.",
    source: "DefiLlama + on-chain UiPoolDataProviderV3.",
  },
  "market-cross-protocol-rate": {
    text:
      "Daily supply APY for the same underlying asset on every protocol that lists it, over the last 90 days. Reads as 'where has the best yield been historically?' — a question the snapshot table beneath answers for today only. The current market's protocol line is drawn at full saturation; siblings get a faded variant so visual focus stays on the page the reader came from. Rewards are excluded so the line is pure interest yield.",
    source: "DefiLlama Yields /chart/{poolId} for each sibling pool.",
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
      "Weekly liquidation volume per protocol over the trailing 12 months. Stacked bars; correlation across protocols on the same week is a systemic-stress fingerprint.",
    source: "Liquidator Economy DB · liquidation_events.",
  },
  "risk-days-since-bad-debt": {
    text:
      "Days elapsed since the most recent recorded bad-debt incident across the four protocols. Source is a curated registry (content/bad-debt-incidents.json) — append a row when an incident occurs and the next render picks it up. Counter increments daily. The streak length is the empirical part of the protocol-level safety story; longer is better.",
    source: "Curated content/bad-debt-incidents.json + lib/bad-debt.ts.",
  },
  "risk-liquidation-efficiency": {
    text:
      "Effective dollars of collateral seized per dollar of debt repaid on each protocol over the trailing 90 days, weighted by event size. Lower = cheaper liquidation for borrowers. Fluid's smart-collateral mechanic targets near-1.0; Aave V3 / Spark sit ~1.05-1.08 (the standard liquidation bonus).",
    source: "Liquidator Economy DB · liquidation_events.",
  },
  "risk-liquidator-leaderboard": {
    text:
      "Top 10 liquidator wallets ranked by trailing-90-day gross profit (collateral_amount_usd − debt_amount_usd, summed). Wallets show as truncated addresses; events count is the number of liquidations the wallet executed in the window.",
    source: "Liquidator Economy DB · liquidation_events.",
  },
  "compare-best-venue-history": {
    text:
      "For each day in the trailing 12 months, the protocol with the highest supply APY for the selected asset 'wins' that day. The stripe colors each day by the winning protocol; the readout below sums days won. Days without cross-protocol data render as a neutral gap. Reads as 'where has the best supply yield been over the past year?' — a different lens from the level chart above and the dispersion chart below.",
    source: "DefiLlama Yields /chart/{poolId} per (asset × protocol).",
  },
  "compare-emode": {
    text:
      "Curated registry (lib/emode-registry.ts) of E-Mode / Smart Collateral / max-LLTV-mode eligibility per protocol per asset. Aave V3 / Spark have stable / ETH-correlated / BTC-correlated E-Mode categories that lift LTV above the per-reserve baseline. Fluid's Smart Collateral mechanic targets ~95% on supported pairs. Morpho's per-market LLTV varies by isolated market — the registry surfaces 'highest LLTV market' as the theoretical ceiling.",
    source: "Curated lib/emode-registry.ts.",
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
