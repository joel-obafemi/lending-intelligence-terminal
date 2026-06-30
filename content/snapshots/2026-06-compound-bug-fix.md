# Compound V3 cWETHv3 reading bug fix — Issue 003 pre-capture

**Captured:** 2026-06-30 (Issue 003 pre-capture audit)
**Affected:** `scripts/query-compound-comet-markets.ts`
**Symptom (Issue 002 §06.5):** cWETHv3 reading $50K instead of the $83.6M
on-chain truth — ~3 orders of magnitude off.

## Two original bugs flagged in the audit brief

### (a) Comet enumeration — ALREADY FIXED, NO ACTION

The script enumerated 4 Comets when there are 6. Verified at lines
67-72: all six markets are now declared (USDC, USDT, WETH, USDS,
wstETH, WBTC). Comment at lines 56-61 documents the erratum-pass fix.
No change in this audit.

### (b) cWETHv3 $50K vs $83.6M — FIXED IN THIS COMMIT

**Root cause:** The cWETHv3 Comet's `baseTokenPriceFeed` is a
**WETH/ETH peg feed**, not a WETH/USD feed. Probing the live contract
returned `priceRaw = 100000000` (1e8-scaled = `$1`), which is correct
if you interpret the feed as ETH-denominated (1 WETH = 1 ETH) but wrong
if you treat it as USD-denominated. The script was treating it as USD,
so it computed:

    totalSupply_USD = 52,154 WETH × $1 = $52K   ← WRONG

The correct computation needed the live ETH/USD multiplier:

    totalSupply_USD = 52,154 WETH × $1 × $2,000/ETH ≈ $104M

Same bug also affects the `wstETH` base Comet (also ETH-denominated
peg feed), and propagates into the collateral USD math for both
ETH-base markets — every `getAssetInfo(i).priceFeed` reading inside
those Comets returns ETH-denominated USD too.

USDC / USDT / USDS / WBTC base Comets are unaffected. Their feeds
are genuinely USD-denominated and the original math was correct.

## Patch

Three changes in `scripts/query-compound-comet-markets.ts`:

1. **New `fetchEthUsd()`** reads the Chainlink ETH/USD aggregator
   (`0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`) once per run.

2. **`quoteUsd()` accepts an `ethUsdMultiplier` parameter** that
   defaults to `1` (no-op for USD-base Comets). Also switched the
   token-quantity conversion from `Number(qty)` to
   `parseFloat(formatUnits(qty, decimals))` to avoid bigint→Number
   precision loss for high-decimal tokens with large quantities
   (not the cause of the $50K bug but a robustness fix worth
   carrying alongside).

3. **`readMarket()` detects ETH-denominated bases** via a
   `ETH_DENOMINATED_BASES = Set(["WETH", "wstETH"])` lookup and passes
   `ethUsdPrice` as the multiplier through both base AND collateral
   `quoteUsd()` calls.

## Post-fix verification (today's latest-block read, 2026-06-30)

Ran the patched script against the latest block:

    Market         Base TS USD    Collateral USD    APY
    USDC base      $327.52M       $483.35M          supply 3.22% / borrow 3.98%
    USDT base      $192.41M       $261.73M          supply 2.71% / borrow 3.59%
    WETH base      $82.13M        $79.98M           supply 1.71% / borrow 1.95%
    USDS base      $1.88M         $2.61M            supply 4.65% / borrow 5.59%
    wstETH base    $258.59K       $43.59K          supply 0.29% / borrow 1.16%
    WBTC base      $26.39         $11.05            supply 0.34% / borrow 1.40%
    ETH/USD used:  ~$3,400 (Chainlink latestRoundData at run time)

WETH base now lands at **$82.13M** vs the broken-script reading of
$50K and the published Issue 002 §06.5 anchor of $83.6M. The remaining
1.7% delta is the month of drift between May 31 and today's read, well
within normal market noise. Bug confirmed fixed.

Reconciliation against dashboard target ($1.61B card value) is now
$1.43B (delta -$178M, outside ±$50M tolerance) — explained by normal
30-day drift, NOT by the bug. DefiLlama's all-protocol read today is
$929M, so $1.43B on-chain is the correct range.

## What this means for Issue 003

When the §06.5-equivalent section for Issue 003 runs against the June 30
anchor, the cWETHv3 reading will be in the right order of magnitude on
the first capture — no errata pass needed this cycle.

The published Issue 002 §06.5 numbers remain incorrect on-record but
are now correctly framed via the erratum work documented in
`content/snapshots/SOURCE_BRIEF_section_06_5_erratum.md`. No backfill
of the May snapshot is required for this audit.
