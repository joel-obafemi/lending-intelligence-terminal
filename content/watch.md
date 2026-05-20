# What to Watch

A curated list of items to monitor across the tracked Ethereum lending
protocols. Edit this file once per Lending Pulse edition (usually Sunday
night before Monday publish). Each `## Heading` becomes a watch item;
the paragraph below it becomes the body.

Last updated: 2026-04-25

## Aave V3 stablecoin utilization pinned at 100%

USDC and USDT on Aave V3 are running at 98 to 100% utilization with $1.8B
in supply each. Any meaningful borrow increase triggers the interest-rate
model's kink and pushes supply APY past 12%, a condition that
historically precedes forced withdrawals and cascading liquidations in
adjacent markets. Watch for rate decay once borrows unwind.

## Fluid's outsized liquidation intensity

Fluid liquidated 14.12% of its TVL in the last 90 days versus Aave V3's
3.92%. On a $666M TVL base, that's a notable velocity, and it's concentrated
in WBTC and WEETH vaults. If the pattern continues, expect governance
discussion about liquidation-bonus calibration.

## Restaked ETH collateral concentration

WEETH and RSETH together represent ~$5B of collateral across the four
protocols. Both rely on third-party restaking operators with opaque
unbonding timelines. An oracle misprice or withdrawal queue stall on
either asset can propagate to Aave and Morpho in the same block.

## Morpho market share creep

Morpho's share of aggregate Ethereum lending TVL ticked from 16.0% to
17.1% over the last month, mostly on the back of isolated WEETH markets.
Watch whether vault allocators continue to rotate away from Aave's
shared-liquidity model as isolated-market LTVs loosen.
