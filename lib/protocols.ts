/**
 * Central protocol registry. Mirrored in schema.sql `protocols` table but kept
 * here as the canonical source for client-side labeling, colors, and links.
 *
 * Keep slug + defillamaSlug in sync with the DB row.
 */
export type ProtocolArchitecture = "pool" | "isolated" | "vault"

export interface ProtocolConfig {
  slug: string
  name: string
  architecture: ProtocolArchitecture
  defillamaSlug: string
  /** Slug used by the liquidator-economy Neon DB `liquidation_events.protocol`. */
  liquidatorSlug: string
  chain: "ethereum"
  color: string
  website: string
  /** Short blurb shown on protocol pages */
  description: string
}

export const PROTOCOLS: ProtocolConfig[] = [
  {
    slug: "aave-v3",
    name: "Aave V3",
    architecture: "pool",
    defillamaSlug: "aave-v3",
    liquidatorSlug: "aave_v3",
    chain: "ethereum",
    color: "#B44AFF",
    website: "https://aave.com",
    description: "The canonical multi-asset lending pool. Shared liquidity, isolation mode for risky assets, E-mode for correlated pairs.",
  },
  {
    slug: "spark",
    name: "Spark",
    architecture: "pool",
    defillamaSlug: "sparklend",
    liquidatorSlug: "spark",
    chain: "ethereum",
    color: "#FF6B35",
    website: "https://spark.fi",
    description: "Aave V3 fork by the Sky (MakerDAO) team, tightly integrated with DAI/USDS and sDAI/sUSDS savings rates.",
  },
  {
    slug: "morpho-blue",
    name: "Morpho",
    architecture: "isolated",
    defillamaSlug: "morpho-blue",
    liquidatorSlug: "morpho_blue",
    chain: "ethereum",
    color: "#5B7FFF",
    website: "https://morpho.org",
    description: "Permissionless isolated lending primitives. Each market is a single (loan, collateral, LLTV, oracle, IRM) tuple. Vaults aggregate across markets.",
  },
  {
    slug: "fluid",
    name: "Fluid",
    architecture: "vault",
    // DefiLlama tracks Fluid under "fluid-lending". The bare "fluid" slug
    // exists too but returns empty history — `fluid-lending` is the one
    // that actually populates per-asset supply/borrow tokens.
    defillamaSlug: "fluid-lending",
    liquidatorSlug: "fluid",
    chain: "ethereum",
    color: "#10B981",
    website: "https://fluid.io",
    description: "Instadapp's vault-based lending with smart collateral and smart debt, enabling DEX-like capital efficiency on paired assets.",
  },
  {
    slug: "compound-v3",
    name: "Compound",
    // Comet is one-base-many-collaterals per market — the base asset is
    // pooled across borrowers, so 'pool' is the closest architecture tag.
    // Collateral assets do not earn interest in Comet.
    architecture: "pool",
    defillamaSlug: "compound-v3",
    // The liquidator-economy DB does not currently ingest Compound; this
    // slug is set for the eventual ingestion but the dashboard tolerates
    // a missing slug gracefully (liquidation panels render "—").
    liquidatorSlug: "compound_v3",
    chain: "ethereum",
    color: "#06B6D4",
    website: "https://compound.finance",
    description: "Comet architecture. Each market has one borrowable base asset (USDC, USDT, ETH, USDS) and many collateral assets; collateral does not earn interest.",
  },
  {
    slug: "euler-v2",
    name: "Euler",
    // EVK vaults are isolated markets with their own risk parameters;
    // the closest existing architecture tag is 'vault' (matches Fluid).
    architecture: "vault",
    defillamaSlug: "euler-v2",
    liquidatorSlug: "euler_v2",
    chain: "ethereum",
    color: "#D946EF",
    website: "https://euler.finance",
    description: "Modular vault-based lending. Each EVK vault is an isolated market with its own risk parameters, oracle, and IRM.",
  },
]

/** Reverse lookup: liquidator-economy slug → our canonical slug. */
export const PROTOCOL_BY_LIQUIDATOR_SLUG: Record<string, string> = Object.fromEntries(
  PROTOCOLS.map((p) => [p.liquidatorSlug, p.slug]),
)

export const PROTOCOL_BY_SLUG: Record<string, ProtocolConfig> = Object.fromEntries(
  PROTOCOLS.map((p) => [p.slug, p]),
)

export function getProtocolColor(slug: string): string {
  return PROTOCOL_BY_SLUG[slug]?.color ?? "#6B7280"
}
