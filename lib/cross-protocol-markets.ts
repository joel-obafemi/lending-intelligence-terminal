/**
 * Top markets across all four protocols, ranked by any of: total supply,
 * total borrows, supply APY, borrow APY, or TVL (unborrowed liquidity).
 *
 * Used by the Sector Overview's "Top 10 markets" module (Section 7.2 of the
 * blueprint). Pools the same DefiLlama Yields data we already fetch for the
 * Protocol Deep Dive page; just doesn't filter by project.
 *
 * Server returns the top-N "interesting" markets (by total supply) so the
 * client has enough universe to re-sort by alternative metrics without
 * needing another fetch.
 */
import { fetchAllYieldPools, type YieldPool } from "./defillama"
import { PROTOCOL_BY_SLUG } from "./protocols"
import { YIELDS_PROJECT_BY_PROTOCOL } from "./rates"

export interface CrossProtocolMarket {
  poolId: string
  protocolSlug: string
  protocolName: string
  protocolColor: string
  asset: string
  poolMeta: string | null
  /** TVL = unborrowed liquidity (DefiLlama /pools tvlUsd). */
  tvlUsd: number
  /** Total supplied = TVL + borrowed (the full deposit base). */
  totalSupplyUsd: number
  totalBorrowUsd: number
  utilizationPct: number | null
  supplyApy: number | null
  borrowApy: number | null
}

/** Reverse map: yields project slug → our canonical slug. */
function ourSlugForYieldsProject(project: string): string | null {
  for (const [slug, arr] of Object.entries(YIELDS_PROJECT_BY_PROTOCOL)) {
    if (arr.includes(project)) return slug
  }
  return null
}

function totalSupplyOf(p: YieldPool): number {
  if (p.totalSupplyUsd != null && p.totalSupplyUsd > 0) return p.totalSupplyUsd
  return (p.tvlUsd ?? 0) + (p.totalBorrowUsd ?? 0)
}

/**
 * Returns up to `universeLimit` markets across the four tracked protocols
 * on Ethereum, sorted by total supply descending. The client component then
 * re-sorts this universe by whichever metric the user picks (supply, borrow,
 * supply APY, borrow APY, TVL) and slices the top 10.
 */
export async function loadTopMarketsAcrossProtocols(
  universeLimit = 50,
): Promise<CrossProtocolMarket[]> {
  const pools = await fetchAllYieldPools()
  const eligible = pools
    .filter((p) => p.chain === "Ethereum")
    .map((p) => {
      const slug = ourSlugForYieldsProject(p.project)
      if (!slug) return null
      // Morpho: skip raw collateral-market rows that have no supply APY.
      if (slug === "morpho-blue" && p.apyBase == null) return null
      const cfg = PROTOCOL_BY_SLUG[slug]
      if (!cfg) return null
      const totalSupply = totalSupplyOf(p)
      const totalBorrow = p.totalBorrowUsd ?? 0
      const tvl = p.tvlUsd ?? 0
      const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : null
      return {
        poolId: p.pool,
        protocolSlug: slug,
        protocolName: cfg.name,
        protocolColor: cfg.color,
        asset: p.symbol,
        poolMeta: p.poolMeta,
        tvlUsd: tvl,
        totalSupplyUsd: totalSupply,
        totalBorrowUsd: totalBorrow,
        utilizationPct: utilization,
        supplyApy: p.apyBase,
        borrowApy: p.apyBaseBorrow,
      } as CrossProtocolMarket
    })
    .filter((m): m is CrossProtocolMarket => m !== null)

  return [...eligible]
    .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd)
    .slice(0, universeLimit)
}
