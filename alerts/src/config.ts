import type { Protocol } from "./types";

export interface LiquidityWatchEntry {
  protocol: Protocol;
  asset: string;
  market?: string;
}

export const LIQUIDITY_WATCHLIST: LiquidityWatchEntry[] = [
  { protocol: "aave-v3", asset: "WETH", market: "core" },
  { protocol: "aave-v3", asset: "USDC", market: "core" },
  { protocol: "aave-v3", asset: "USDT", market: "core" },
  { protocol: "spark", asset: "USDS", market: "main" },
  { protocol: "spark", asset: "WETH", market: "main" },
  { protocol: "fluid", asset: "WETH" },
  { protocol: "fluid", asset: "USDC" },
  // Compound V3 (Comet) base assets. Each Comet market has one borrowable
  // base asset with exposed supply/borrow; collateral assets are listed but
  // earn no APY (so they don't qualify for a liquidity-band rule).
  { protocol: "compound-v3", asset: "USDC" },
  { protocol: "compound-v3", asset: "WETH" },
  // Euler V2 vaults are per-pair and individually too small to support a
  // sustained-band rule; omitted for now. Re-evaluate when TVL grows.
];

export const NET_FLOW_PROTOCOLS: Protocol[] = [
  "aave-v3",
  "spark",
  "morpho",
  "fluid",
  "compound-v3",
  "euler-v2",
];

export const NET_FLOW_THRESHOLDS = {
  normalUsd: 500_000_000,
  criticalUsd: 2_000_000_000,
} as const;

export const LIQUIDITY_BAND_STDDEV = 1.5;
// 30-day window (was 7) so the band does not collapse during low-volatility
// stretches and produce 1-2% noise fires.
export const LIQUIDITY_BASELINE_WINDOW_DAYS = 30;
// Metric-key namespace bumped alongside the window so a stale 7-day row in
// baseline_samples can never feed the 30-day band.
export const LIQUIDITY_METRIC_KEY_PREFIX = "liquidity30d";

// Magnitude floors. Both must pass before any fire (stress or normalize):
//   - Relative: |current - 30d mean| / 30d mean >= 10%.
//   - Absolute: |current - last evaluation| >= max($50M, 2% of 30d mean).
export const LIQUIDITY_RELATIVE_FLOOR_PCT = 10;
export const LIQUIDITY_ABSOLUTE_FLOOR_USD = 50_000_000;
export const LIQUIDITY_ABSOLUTE_FLOOR_PCT_OF_MEAN = 2;

// Sustained out-of-band requirements.
//   - Stress: 12 consecutive 5-min samples outside the band (~1 hour).
//   - Normalize: 12 hours back inside the band AND a prior stress fire on
//     the same (protocol, asset) within the previous 7 days.
export const LIQUIDITY_STRESS_CONSECUTIVE_SAMPLES = 12;
export const LIQUIDITY_NORMALIZE_DURATION_MS = 12 * 3600 * 1000;
export const LIQUIDITY_NORMALIZE_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

// Utilization rate-kink watchlist. Spec 5.2: stablecoin markets on Aave V3
// and Spark only. Threshold crossings 90% / 95% from below.
export interface UtilizationWatchEntry {
  protocol: Protocol;
  asset: string;
}
export const UTILIZATION_WATCHLIST: UtilizationWatchEntry[] = [
  { protocol: "aave-v3", asset: "USDC" },
  { protocol: "aave-v3", asset: "USDT" },
  { protocol: "spark", asset: "USDS" },
  // Compound V3 stable bases. Each Comet stable market has a single
  // borrowable base; the 90/95% kink is meaningful on those.
  { protocol: "compound-v3", asset: "USDC" },
  { protocol: "compound-v3", asset: "USDT" },
];
export const UTILIZATION_THRESHOLDS_PCT = [90, 95] as const;

// APY dispersion watchlist. Spec 5.3: USDC, USDT, USDS, DAI across the
// covered protocols. Morpho remains excluded because DefiLlama's
// morpho-blue rows do not expose apyBase for stables (Morpho vault APYs
// live in their GraphQL API). Compound V3 contributes via Comet base
// asset pools; Euler V2 contributes via the TVL-weighted blend across
// its many isolated vaults.
export const DISPERSION_STABLES = ["USDC", "USDT", "USDS", "DAI"] as const;
export const DISPERSION_PROTOCOLS: Protocol[] = [
  "aave-v3",
  "spark",
  "fluid",
  "compound-v3",
  "euler-v2",
];
export const DISPERSION_BASELINE_WINDOW_DAYS = 30;
export const DISPERSION_BAND_STDDEV = 2;
// Floors that prevent thin-TVL outliers (e.g. a single $1M Euler vault
// paying 18% APY) from masquerading as cross-protocol dispersion.
export const DISPERSION_MIN_TVL_USD = 25_000_000;
// Absolute floor: only fire when the headline gap itself is meaningful.
// 30 bps is the threshold where a stablecoin treasury rotation actually
// pays off after gas + slippage.
export const DISPERSION_MIN_ABSOLUTE_BPS = 30;

// Real yield spread blend. Spec 5.5: USDC + USDT + USDS, TVL-weighted, vs
// FRED TB4WK. Same Morpho caveat as the dispersion rule.
export const REAL_YIELD_STABLES = ["USDC", "USDT", "USDS"] as const;
export const REAL_YIELD_PROTOCOLS: Protocol[] = [
  "aave-v3",
  "spark",
  "fluid",
  "compound-v3",
  "euler-v2",
];
export const REAL_YIELD_RAPID_MOVE_BPS = 25;

// Liquidation cascade thresholds. Spec 5.7: WARNING at threshold, CRITICAL
// at 2x threshold, evaluated against 24h liquidation volume in USD. Per
// protocol thresholds scale with current TVL on Ethereum (~1% of TVL is
// the rule of thumb). Compound V3 and Euler V2 thresholds are set
// proportional to their smaller bases. The liquidator-economy Neon DB
// does not currently ingest Compound or Euler, so liquidation_cascade
// will return no rows for either and not fire until that DB extends.
export const LIQUIDATION_THRESHOLDS_USD: Record<Protocol, number> = {
  "aave-v3": 100_000_000,
  morpho: 50_000_000,
  fluid: 30_000_000,
  spark: 20_000_000,
  "compound-v3": 10_000_000,
  "euler-v2": 5_000_000,
};

// Slug used by the liquidator-economy DB's liquidation_events.protocol column.
// Mirrors lib/protocols.ts from the dashboard. Compound and Euler keys are
// set for the eventual ingestion; the rule self-skips while no rows exist
// for those slugs.
export const LIQUIDATOR_DB_SLUG: Record<Protocol, string> = {
  "aave-v3": "aave_v3",
  spark: "spark",
  morpho: "morpho_blue",
  fluid: "fluid",
  "compound-v3": "compound_v3",
  "euler-v2": "euler_v2",
};

// Morpho curator HHI thresholds (spec 5.6, using percentages so a curator
// with 38.8% contributes 1505.44).
export const HHI_HIGHLY_CONCENTRATED = 2500;
export const HHI_DOUBLY_CONCENTRATED = 3000;
export const HHI_7D_DELTA_TRIGGER = 100;
export const HHI_TOP3_SHARE_DELTA_PP = 1;

export const PROTOCOL_DISPLAY_NAME: Record<Protocol, string> = {
  "aave-v3": "Aave V3",
  spark: "Spark",
  morpho: "Morpho",
  fluid: "Fluid",
  "compound-v3": "Compound",
  "euler-v2": "Euler",
};

export const PROTOCOL_HANDLE: Record<Protocol, string> = {
  "aave-v3": "@aave",
  spark: "@sparkdotfi",
  morpho: "@MorphoLabs",
  fluid: "@0xfluid",
  "compound-v3": "@compoundfinance",
  "euler-v2": "@eulerfinance",
};

// DefiLlama protocol slugs. Spark's lending product is "sparklend" on both
// /protocol/{slug} and the Yields /pools project field; the bare "spark"
// slug exists but is a different product (Sparkdex). Verified against the
// dashboard's protocols registry.
export const DEFILLAMA_PROTOCOL_SLUG: Record<Protocol, string> = {
  "aave-v3": "aave-v3",
  spark: "sparklend",
  morpho: "morpho-blue",
  fluid: "fluid-lending",
  "compound-v3": "compound-v3",
  "euler-v2": "euler-v2",
};

// DefiLlama Yields project filter values per protocol. Used to match pools to
// the watchlist entries.
export const DEFILLAMA_YIELDS_PROJECT: Record<Protocol, string[]> = {
  "aave-v3": ["aave-v3"],
  spark: ["sparklend"],
  morpho: ["morpho-blue"],
  fluid: ["fluid-lending"],
  "compound-v3": ["compound-v3"],
  "euler-v2": ["euler-v2"],
};

// ─── Moonwell ──────────────────────────────────────────────────────────
// Moonwell is NOT part of the Protocol union because the lending-terminal
// rules iterate over Protocol values and Moonwell is its own product with
// its own dashboard. All Moonwell-keyed constants live in this block so
// the lending rules ignore them, and the Moonwell rules don't need to
// fan out across the Protocol union.

export const MOONWELL_HANDLE = "@MoonwellDeFi";
export const MOONWELL_DISPLAY_NAME = "Moonwell";

/** DefiLlama protocol slug for parent (lending + vaults combined TVL). */
export const MOONWELL_DEFILLAMA_SLUG = "moonwell";
/** DefiLlama slug for Moonwell vault TVL only. */
export const MOONWELL_VAULTS_DEFILLAMA_SLUG = "moonwell-vaults";
/** DefiLlama slug for monthly fees + revenue endpoint. */
export const MOONWELL_FEES_DEFILLAMA_SLUG = "moonwell";

/** Chains Moonwell currently runs on. Display labels mirror dashboard styling. */
export type MoonwellChain = "base" | "optimism" | "ethereum" | "moonbeam" | "moonriver";
export const MOONWELL_CHAINS: MoonwellChain[] = ["base", "optimism", "ethereum"];
export const MOONWELL_CHAIN_DISPLAY: Record<MoonwellChain, string> = {
  base: "Base",
  optimism: "Optimism",
  ethereum: "Ethereum",
  moonbeam: "Moonbeam",
  moonriver: "Moonriver",
};

/**
 * TVL threshold crossings, in USD. One-shot per threshold (cooldown is
 * managed by the rule's per-threshold key). Pick round numbers that make
 * good tweets and are spaced wide enough to avoid noise.
 */
export const MOONWELL_TVL_THRESHOLDS_USD: number[] = [
  70_000_000, 75_000_000, 80_000_000, 90_000_000, 100_000_000, 125_000_000, 150_000_000,
];

/** Cumulative V2 OEV protocol revenue thresholds (since MIP-X56). */
export const MOONWELL_OEV_REVENUE_THRESHOLDS_USD: number[] = [
  1_000, 5_000, 10_000, 25_000, 50_000, 100_000,
];

/** Per-wrapper capture-rate one-shot threshold, in percent. */
export const MOONWELL_OEV_CAPTURE_TARGET_PCT = 70;

/** Combined Morpho-vault TVL milestones. Matches OKR KR4.3. */
export const MOONWELL_VAULT_TVL_THRESHOLDS_USD: number[] = [
  25_000_000, 30_000_000, 35_000_000, 40_000_000, 50_000_000,
];

/** Single vault deposit/withdraw spike floor — fires per-tx above this. */
export const MOONWELL_VAULT_TX_SPIKE_USD = 1_000_000;

/**
 * Monthly (trailing-30d) protocol-revenue threshold crossings.
 * Matches OKR KR2.1 (baseline 200K, target 350K).
 */
export const MOONWELL_MONTHLY_REVENUE_THRESHOLDS_USD: number[] = [
  225_000, 250_000, 275_000, 300_000, 325_000, 350_000, 400_000,
];

/** Whale liquidation severity floors. */
export const MOONWELL_LIQ_WHALE_NORMAL_USD = 100_000;
export const MOONWELL_LIQ_WHALE_CRITICAL_USD = 500_000;

/**
 * Per-market 7-day Δ thresholds for supply/borrow alerts.
 * Below NORMAL → silent; NORMAL ≤ |Δ%| < CRITICAL → NORMAL severity;
 * |Δ%| ≥ CRITICAL → CRITICAL severity.
 */
export const MOONWELL_MARKET_DELTA_NORMAL_PCT = 10;
export const MOONWELL_MARKET_DELTA_CRITICAL_PCT = 25;
/** A market needs at least this many days of accumulated snapshots before its Δ7d can fire. */
export const MOONWELL_MARKET_DELTA_MIN_SAMPLE_DAYS = 7;

/**
 * Liquidation count daily-spike threshold: fires when today's count is
 * at least this many σ above the 30d rolling mean.
 */
export const MOONWELL_LIQ_SPIKE_STDDEV = 3;
export const MOONWELL_LIQ_SPIKE_BASELINE_WINDOW_DAYS = 30;
/** Don't fire spike alerts unless the absolute count itself is meaningful. */
export const MOONWELL_LIQ_SPIKE_MIN_COUNT = 10;
