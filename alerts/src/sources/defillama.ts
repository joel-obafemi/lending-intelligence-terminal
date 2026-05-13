import type { Protocol } from "../types";
import { DEFILLAMA_PROTOCOL_SLUG, DEFILLAMA_YIELDS_PROJECT } from "../config";

const YIELDS_BASE = "https://yields.llama.fi";
const API_BASE = "https://api.llama.fi";

export interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
  apyBase: number | null;
  apyBaseBorrow: number | null;
  poolMeta: string | null;
}

interface YieldPoolsResponse {
  status?: string;
  data?: Array<{
    pool: string;
    chain: string;
    project: string;
    symbol: string;
    tvlUsd: number;
    totalSupplyUsd?: number | null;
    totalBorrowUsd?: number | null;
    apyBase?: number | null;
    apyBaseBorrow?: number | null;
    poolMeta?: string | null;
  }>;
}

interface LendBorrowRow {
  pool: string;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
  apyBase: number | null;
  apyBaseBorrow: number | null;
}

/**
 * Request-scoped cache that dedupes DefiLlama calls across rule evaluations
 * inside a single Worker invocation (spec 15: "1 request per protocol per
 * evaluation, not per asset").
 */
export class DefiLlamaClient {
  private yieldPoolsPromise: Promise<YieldPool[]> | null = null;
  private protocolTvlPromises = new Map<string, Promise<number | null>>();

  async getEthereumYieldPools(): Promise<YieldPool[]> {
    if (!this.yieldPoolsPromise) {
      this.yieldPoolsPromise = this.fetchYieldPools();
    }
    return this.yieldPoolsPromise;
  }

  private async fetchYieldPools(): Promise<YieldPool[]> {
    const [poolsRes, lendBorrowRes] = await Promise.all([
      fetchJson<YieldPoolsResponse>(`${YIELDS_BASE}/pools`),
      fetchJson<LendBorrowRow[]>(`${YIELDS_BASE}/lendBorrow`).catch(
        () => [] as LendBorrowRow[],
      ),
    ]);
    const lbByPool = new Map(lendBorrowRes.map((r) => [r.pool, r]));
    const allProjects = new Set<string>(
      Object.values(DEFILLAMA_YIELDS_PROJECT).flat(),
    );
    return (poolsRes.data ?? [])
      .filter((p) => p.chain === "Ethereum" && allProjects.has(p.project))
      .map((p) => {
        const lb = lbByPool.get(p.pool);
        const supplyUsd = p.totalSupplyUsd ?? lb?.totalSupplyUsd ?? null;
        const borrowUsd = p.totalBorrowUsd ?? lb?.totalBorrowUsd ?? null;
        // Fluid vault quirk: tvlUsd == totalSupplyUsd. Normalize to mean
        // *unborrowed* liquidity, matching the dashboard's convention.
        const rawTvl = p.tvlUsd;
        const tvlUsd =
          supplyUsd != null &&
          borrowUsd != null &&
          borrowUsd > 0 &&
          Math.abs(supplyUsd - rawTvl) <= Math.max(1, rawTvl * 0.001)
            ? Math.max(0, supplyUsd - borrowUsd)
            : rawTvl;
        return {
          pool: p.pool,
          chain: p.chain,
          project: p.project,
          symbol: (p.symbol ?? "").toUpperCase(),
          tvlUsd,
          totalSupplyUsd: supplyUsd,
          totalBorrowUsd: borrowUsd,
          apyBase: p.apyBase ?? lb?.apyBase ?? null,
          apyBaseBorrow: p.apyBaseBorrow ?? lb?.apyBaseBorrow ?? null,
          poolMeta: p.poolMeta ?? null,
        };
      });
  }

  /**
   * Picks the largest matching pool for (protocol, asset). Many protocols
   * have multiple deployments per asset; we pick the deepest by total supply
   * so the alert reflects the canonical market.
   */
  async findPool(protocol: Protocol, asset: string): Promise<YieldPool | null> {
    const matches = await this.findPools(protocol, asset);
    if (matches.length === 0) return null;
    return matches[0]!;
  }

  /**
   * All matching pools for (protocol, asset), ranked by depth. Used by rules
   * that want to blend (e.g. dispersion across vaults for the same asset).
   */
  async findPools(protocol: Protocol, asset: string): Promise<YieldPool[]> {
    const pools = await this.getEthereumYieldPools();
    const projects = DEFILLAMA_YIELDS_PROJECT[protocol];
    const symbolUpper = asset.toUpperCase();
    return pools
      .filter((p) => projects.includes(p.project) && p.symbol === symbolUpper)
      .sort(
        (a, b) =>
          (b.totalSupplyUsd ?? b.tvlUsd) - (a.totalSupplyUsd ?? a.tvlUsd),
      );
  }

  /**
   * TVL-weighted blended supply APY (apyBase, no incentives) for a
   * (protocol, asset). Returns null if no pool has a non-null apyBase.
   * Matches the dashboard's lib/real-yield.ts blending approach.
   */
  async blendedSupplyApyPct(
    protocol: Protocol,
    asset: string,
  ): Promise<{ apyPct: number; weightUsd: number } | null> {
    const pools = await this.findPools(protocol, asset);
    let weighted = 0;
    let weight = 0;
    for (const p of pools) {
      if (p.apyBase == null || !Number.isFinite(p.apyBase)) continue;
      const w = p.totalSupplyUsd ?? p.tvlUsd ?? 0;
      if (w <= 0) continue;
      weighted += p.apyBase * w;
      weight += w;
    }
    if (weight <= 0) return null;
    return { apyPct: weighted / weight, weightUsd: weight };
  }

  /**
   * Ethereum-chain TVL for a protocol (sum of available liquidity + borrowed,
   * via the protocol summary endpoint). Used by net_flow_24h.
   */
  async getProtocolTvlUsd(protocol: Protocol): Promise<number | null> {
    const slug = DEFILLAMA_PROTOCOL_SLUG[protocol];
    let p = this.protocolTvlPromises.get(slug);
    if (!p) {
      p = this.fetchProtocolTvl(slug);
      this.protocolTvlPromises.set(slug, p);
    }
    return p;
  }

  private async fetchProtocolTvl(slug: string): Promise<number | null> {
    // DefiLlama responses for these protocols are multi-megabyte. /protocol
    // returns the full historical chainTvls; for a current-TVL read we only
    // need the latest point. Cache for the duration of one run.
    try {
      const data = await fetchJson<{
        currentChainTvls?: Record<string, number>;
        chainTvls?: Record<string, { tvl?: Array<{ totalLiquidityUSD?: number }> }>;
      }>(`${API_BASE}/protocol/${slug}`);
      // Prefer the explicit Ethereum chain TVL. Sum the unborrowed + borrowed
      // buckets so the figure matches the dashboard's "Total Supplied".
      const cur = data.currentChainTvls ?? {};
      const eth = cur["Ethereum"] ?? null;
      const ethBorrowed = cur["Ethereum-borrowed"] ?? 0;
      if (eth != null) return eth + ethBorrowed;
      // Fallback: last point of chainTvls.Ethereum.
      const series = data.chainTvls?.["Ethereum"]?.tvl;
      if (series && series.length > 0) {
        const last = series[series.length - 1];
        return last?.totalLiquidityUSD ?? null;
      }
      return null;
    } catch (err) {
      console.error(`DefiLlama protocol fetch failed for ${slug}:`, err);
      return null;
    }
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": "datumlabs-alerts/0.1 (+lending-intelligence-terminal)" },
  });
  if (!res.ok) {
    throw new Error(`DefiLlama ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
