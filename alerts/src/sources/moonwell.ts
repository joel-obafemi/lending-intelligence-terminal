/**
 * DefiLlama queries scoped to Moonwell. Separate from sources/defillama.ts
 * because that file's API is Protocol-keyed (lending-terminal protocols),
 * and Moonwell sits outside that union by design (it's a product, not a
 * Protocol value for the lending rules to iterate over).
 *
 * Endpoints used:
 *   GET  https://api.llama.fi/protocol/moonwell           (TVL + chainTvls)
 *   GET  https://api.llama.fi/protocol/moonwell-vaults    (vault TVL split)
 *   GET  https://api.llama.fi/summary/fees/moonwell?dataType=dailyRevenue
 *   GET  https://yields.llama.fi/pools                    (filtered to moonwell-lending)
 *
 * All endpoints are free, no key. Calls are guarded against partial JSON
 * with `?? null` returns so a single 5xx doesn't crash the run.
 */

import {
  MOONWELL_DEFILLAMA_SLUG,
  MOONWELL_FEES_DEFILLAMA_SLUG,
  MOONWELL_VAULTS_DEFILLAMA_SLUG,
  type MoonwellChain,
} from "../config";

const API_BASE = "https://api.llama.fi";
const YIELDS_BASE = "https://yields.llama.fi";

interface DefiLlamaProtocolResponse {
  tvl?: number;
  currentChainTvls?: Record<string, number>;
  chainTvls?: Record<string, { tvl?: Array<{ date: number; totalLiquidityUSD: number }> }>;
}

interface DefiLlamaFeesResponse {
  total24h?: number;
  total7d?: number;
  total30d?: number;
  totalRevenue24h?: number;
  totalRevenue30d?: number;
  totalAllTime?: number;
  totalDataChart?: Array<[number, number]>;
  totalDataChartBreakdown?: unknown;
}

interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
  apyBase: number | null;
  apyReward: number | null;
}

interface YieldPoolsResponse {
  status: string;
  data: Array<{
    pool: string;
    chain: string;
    project: string;
    symbol: string;
    tvlUsd: number;
    totalSupplyUsd?: number | null;
    totalBorrowUsd?: number | null;
    apyBase?: number | null;
    apyReward?: number | null;
  }>;
}

export class MoonwellDefiLlamaClient {
  private protocolPromise: Promise<DefiLlamaProtocolResponse | null> | null = null;
  private vaultsPromise: Promise<DefiLlamaProtocolResponse | null> | null = null;
  private feesPromise: Promise<DefiLlamaFeesResponse | null> | null = null;
  private lendingPoolsPromise: Promise<YieldPool[]> | null = null;

  async getProtocol(): Promise<DefiLlamaProtocolResponse | null> {
    if (!this.protocolPromise) {
      this.protocolPromise = fetchJsonSafe<DefiLlamaProtocolResponse>(
        `${API_BASE}/protocol/${MOONWELL_DEFILLAMA_SLUG}`,
      );
    }
    return this.protocolPromise;
  }

  async getVaultsProtocol(): Promise<DefiLlamaProtocolResponse | null> {
    if (!this.vaultsPromise) {
      this.vaultsPromise = fetchJsonSafe<DefiLlamaProtocolResponse>(
        `${API_BASE}/protocol/${MOONWELL_VAULTS_DEFILLAMA_SLUG}`,
      );
    }
    return this.vaultsPromise;
  }

  async getFeesSummary(): Promise<DefiLlamaFeesResponse | null> {
    if (!this.feesPromise) {
      this.feesPromise = fetchJsonSafe<DefiLlamaFeesResponse>(
        `${API_BASE}/summary/fees/${MOONWELL_FEES_DEFILLAMA_SLUG}?dataType=dailyRevenue`,
      );
    }
    return this.feesPromise;
  }

  /** Combined parent-protocol TVL across all chains. */
  async getTotalTvlUsd(): Promise<number | null> {
    const p = await this.getProtocol();
    if (!p) return null;
    // DefiLlama occasionally returns p.tvl = NaN (e.g. when a per-chain
    // sub-tvl is missing). NaN is non-nullish, so `?? null` falls through
    // and the weekly-recap renders "TVL: $NaN" via fmtUsdCompact(NaN).
    // Number.isFinite catches both NaN and Infinity. Caught 2026-06-29.
    if (Number.isFinite(p.tvl)) return p.tvl as number;
    const summed = sumChainTvls(p.currentChainTvls);
    return Number.isFinite(summed) ? (summed as number) : null;
  }

  /** Per-chain current TVL split, in USD. */
  async getTvlByChain(): Promise<Record<MoonwellChain, number | null>> {
    const p = await this.getProtocol();
    const out: Record<MoonwellChain, number | null> = {
      base: null,
      optimism: null,
      ethereum: null,
      moonbeam: null,
      moonriver: null,
    };
    if (!p?.currentChainTvls) return out;
    for (const [chain, tvl] of Object.entries(p.currentChainTvls)) {
      const k = normalizeChain(chain);
      if (k) out[k] = tvl;
    }
    return out;
  }

  /** Combined Morpho-vault TVL across all chains. */
  async getVaultsTvlUsd(): Promise<number | null> {
    const v = await this.getVaultsProtocol();
    if (!v) return null;
    // Same NaN-vs-nullish guard as getTotalTvlUsd above.
    if (Number.isFinite(v.tvl)) return v.tvl as number;
    const summed = sumChainTvls(v.currentChainTvls);
    return Number.isFinite(summed) ? (summed as number) : null;
  }

  /**
   * Trailing 30-day protocol revenue, in USD. Mirrors what the dashboard's
   * Financials page uses for KR2.1's monthly-revenue metric.
   */
  async getTrailing30dRevenueUsd(): Promise<number | null> {
    const fees = await this.getFeesSummary();
    if (!fees) return null;
    return fees.totalRevenue30d ?? fees.total30d ?? null;
  }

  /**
   * Latest day's protocol revenue + ISO date. Used by the daily-ATH rule.
   * Returns null if the chart is empty.
   */
  async getLatestDailyRevenueUsd(): Promise<{ usd: number; date: string } | null> {
    const fees = await this.getFeesSummary();
    if (!fees?.totalDataChart || fees.totalDataChart.length === 0) return null;
    // DefiLlama emits chart entries as [unixSeconds, usd]. Last entry is
    // the most recent completed day.
    const last = fees.totalDataChart[fees.totalDataChart.length - 1]!;
    const ts = last[0]! * 1000;
    return { usd: last[1]!, date: new Date(ts).toISOString().slice(0, 10) };
  }

  /**
   * Per-pool supply/borrow snapshots for Moonwell lending markets,
   * filtered to the chains we care about and returning the rich fields
   * the Δ-7d rules need.
   */
  async getLendingPools(): Promise<YieldPool[]> {
    if (!this.lendingPoolsPromise) {
      this.lendingPoolsPromise = (async () => {
        const res = await fetchJsonSafe<YieldPoolsResponse>(`${YIELDS_BASE}/pools`);
        if (!res?.data) return [];
        const includedChains = new Set(["Base", "Optimism", "Ethereum"]);
        return res.data
          .filter((row) => row.project === "moonwell-lending" && includedChains.has(row.chain))
          .map<YieldPool>((row) => ({
            pool: row.pool,
            chain: row.chain,
            project: row.project,
            symbol: row.symbol,
            tvlUsd: row.tvlUsd ?? 0,
            totalSupplyUsd: row.totalSupplyUsd ?? null,
            totalBorrowUsd: row.totalBorrowUsd ?? null,
            apyBase: row.apyBase ?? null,
            apyReward: row.apyReward ?? null,
          }));
      })();
    }
    return this.lendingPoolsPromise;
  }
}

function sumChainTvls(record?: Record<string, number>): number | null {
  if (!record) return null;
  let total = 0;
  for (const v of Object.values(record)) total += v;
  return total;
}

function normalizeChain(chain: string): MoonwellChain | null {
  const lower = chain.toLowerCase();
  if (lower === "base") return "base";
  if (lower === "optimism" || lower === "op mainnet" || lower === "op-mainnet") return "optimism";
  if (lower === "ethereum") return "ethereum";
  if (lower === "moonbeam") return "moonbeam";
  if (lower === "moonriver") return "moonriver";
  return null;
}

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      console.warn(`moonwell-defillama: ${url} -> HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`moonwell-defillama: ${url} threw`, err);
    return null;
  }
}

export type { YieldPool };
