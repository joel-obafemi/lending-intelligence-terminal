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
];

export const NET_FLOW_PROTOCOLS: Protocol[] = ["aave-v3", "spark", "morpho", "fluid"];

export const NET_FLOW_THRESHOLDS = {
  normalUsd: 500_000_000,
  criticalUsd: 2_000_000_000,
} as const;

export const LIQUIDITY_BAND_STDDEV = 1.5;
export const LIQUIDITY_BASELINE_WINDOW_DAYS = 7;

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
];
export const UTILIZATION_THRESHOLDS_PCT = [90, 95] as const;

// APY dispersion watchlist. Spec 5.3: USDC, USDT, USDS, DAI across the four
// protocols. Morpho is excluded for now: DefiLlama's morpho-blue pools
// don't expose meaningful apyBase for stables (vault APYs live in the
// Morpho GraphQL API). Falling back to Aave V3 + Spark + Fluid.
export const DISPERSION_STABLES = ["USDC", "USDT", "USDS", "DAI"] as const;
export const DISPERSION_PROTOCOLS: Protocol[] = ["aave-v3", "spark", "fluid"];
export const DISPERSION_BASELINE_WINDOW_DAYS = 30;
export const DISPERSION_BAND_STDDEV = 2;

// Real yield spread blend. Spec 5.5: USDC + USDT + USDS across the four
// protocols, TVL-weighted, vs FRED TB4WK. Same Morpho caveat applies.
export const REAL_YIELD_STABLES = ["USDC", "USDT", "USDS"] as const;
export const REAL_YIELD_PROTOCOLS: Protocol[] = ["aave-v3", "spark", "fluid"];
export const REAL_YIELD_RAPID_MOVE_BPS = 25;

// Liquidation cascade thresholds. Spec 5.7: WARNING at threshold, CRITICAL
// at 2x threshold, evaluated against 24h liquidation volume in USD.
export const LIQUIDATION_THRESHOLDS_USD: Record<Protocol, number> = {
  "aave-v3": 100_000_000,
  morpho: 50_000_000,
  fluid: 30_000_000,
  spark: 20_000_000,
};

// Slug used by the liquidator-economy DB's liquidation_events.protocol column.
// Mirrors lib/protocols.ts from the dashboard.
export const LIQUIDATOR_DB_SLUG: Record<Protocol, string> = {
  "aave-v3": "aave_v3",
  spark: "spark",
  morpho: "morpho_blue",
  fluid: "fluid",
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
};

export const PROTOCOL_HANDLE: Record<Protocol, string> = {
  "aave-v3": "@aave",
  spark: "@sparkdotfi",
  morpho: "@MorphoLabs",
  fluid: "@0xfluid",
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
};

// DefiLlama Yields project filter values per protocol. Used to match pools to
// the watchlist entries.
export const DEFILLAMA_YIELDS_PROJECT: Record<Protocol, string[]> = {
  "aave-v3": ["aave-v3"],
  spark: ["sparklend"],
  morpho: ["morpho-blue"],
  fluid: ["fluid-lending"],
};
