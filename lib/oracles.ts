/**
 * Curated oracle map for the Risk page Verdict strip + Oracle Map table.
 *
 * Each asset symbol maps to its primary oracle as deployed on the four
 * tracked protocols on Ethereum mainnet. Composite feeds (e.g. wstETH
 * priced via Lido's exchange rate × Chainlink ETH/USD) get attributed to
 * their root price source — Chainlink in that case — because that's the
 * actual market data dependency. Per-protocol overrides exist for the
 * handful of assets where one of the four diverges (typically Spark using
 * Maker's price modules instead of the Chainlink feed Aave V3 uses).
 *
 * Update once per Lending Pulse edition as markets get listed and oracles
 * change. Symbols match the uppercase normalization in lib/assets.ts.
 */
export type OracleVendor = "Chainlink" | "Redstone" | "Pyth" | "Lido" | "Maker" | "Curve EMA" | "Other"

export interface OracleMapEntry {
  /** Default oracle vendor across the four protocols. */
  primary: OracleVendor
  /** One-line note: composite feeds, conditional behavior, etc. */
  notes?: string
  /** Per-protocol overrides where one or more diverge from `primary`. */
  byProtocol?: Partial<Record<string, OracleVendor>>
}

export const ORACLE_MAP: Record<string, OracleMapEntry> = {
  // ─── Native + ETH derivatives ─────────────────────────────────────────
  WETH: { primary: "Chainlink", notes: "ETH / USD Chainlink mainnet feed." },
  ETH: { primary: "Chainlink" },
  WBTC: { primary: "Chainlink", notes: "BTC / USD Chainlink." },
  CBBTC: { primary: "Chainlink", notes: "BTC / USD Chainlink (cbBTC has its own feed too on some markets)." },
  TBTC: { primary: "Chainlink" },
  LBTC: { primary: "Redstone", notes: "Lombard's bridged BTC; Redstone EMA on most listings." },
  // ─── Liquid staking tokens ────────────────────────────────────────────
  WSTETH: {
    primary: "Chainlink",
    notes: "Composite: Lido exchange rate × Chainlink ETH/USD. Aave V3 also has a stETH/ETH safety check.",
  },
  CBETH: { primary: "Chainlink" },
  RETH: { primary: "Chainlink", notes: "Composite: Rocket Pool exchange rate × Chainlink ETH/USD." },
  OSETH: { primary: "Chainlink" },
  // ─── Restaked ETH ─────────────────────────────────────────────────────
  WEETH: {
    primary: "Chainlink",
    notes: "Composite: ether.fi exchange rate × Chainlink ETH/USD on Aave V3. Redstone on Spark.",
    byProtocol: { spark: "Redstone" },
  },
  RSETH: {
    primary: "Redstone",
    notes: "Kelp DAO restaked ETH. Some Morpho markets use Chainlink composite.",
  },
  EZETH: {
    primary: "Redstone",
    notes: "Renzo restaked ETH. Aave V3 uses Chainlink composite, Morpho markets vary.",
    byProtocol: { "aave-v3": "Chainlink" },
  },
  PUFETH: { primary: "Redstone", notes: "Puffer restaked ETH." },
  EETH: { primary: "Chainlink" },
  // ─── Stablecoins ──────────────────────────────────────────────────────
  USDC: { primary: "Chainlink" },
  USDT: { primary: "Chainlink" },
  DAI: { primary: "Chainlink", notes: "Spark uses Maker's price-1 module for DAI." },
  USDS: {
    primary: "Chainlink",
    notes: "Sky's USD stable. Spark prices it at $1 via Maker's PSM module.",
    byProtocol: { spark: "Maker" },
  },
  GHO: { primary: "Chainlink", notes: "Aave's stable. Pegged at $1 by aggregator." },
  PYUSD: { primary: "Chainlink" },
  USDE: { primary: "Chainlink" },
  SUSDE: { primary: "Chainlink", notes: "Composite: Ethena exchange rate × Chainlink USDE/USD." },
  USDTB: { primary: "Pyth", notes: "Ethena Tether-Black; Pyth on Aave, Chainlink on Spark." },
  CRVUSD: { primary: "Curve EMA", notes: "Curve's internal EMA oracle on Morpho markets." },
  LUSD: { primary: "Chainlink" },
  TUSD: { primary: "Chainlink" },
  FRAX: { primary: "Chainlink" },
  USD0: { primary: "Chainlink" },
  "USD0++": { primary: "Curve EMA", notes: "Curve EMA on most Morpho markets." },
  MKUSD: { primary: "Chainlink" },
  // ─── Long tail ────────────────────────────────────────────────────────
  // Anything not in this map falls into `Other` for concentration math, and
  // shows up in the table as "Unknown" so the curator can fill it in.
}

/** Lookup with per-protocol override. */
export function oracleFor(asset: string, protocolSlug?: string): OracleVendor {
  const entry = ORACLE_MAP[asset.toUpperCase()]
  if (!entry) return "Other"
  if (protocolSlug && entry.byProtocol?.[protocolSlug]) {
    return entry.byProtocol[protocolSlug]!
  }
  return entry.primary
}

export function oracleNotes(asset: string): string | undefined {
  return ORACLE_MAP[asset.toUpperCase()]?.notes
}

/** Brand color per oracle vendor — used by the Map table + Verdict caption. */
export const ORACLE_COLOR: Record<OracleVendor, string> = {
  Chainlink: "#375BD2",
  Redstone: "#FF7A22",
  Pyth: "#7B3FE4",
  Lido: "#00A3FF",
  Maker: "#1AAB9B",
  "Curve EMA": "#0F9D58",
  Other: "#6B7280",
}
