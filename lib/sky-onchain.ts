/**
 * Sky / Maker on-chain reads — Sky Savings Rate (SSR).
 *
 * The SSR is the rate USDS earns when staked into Sky's sUSDS savings
 * vault. Stored on-chain as a per-second compound rate (ray-scaled,
 * 1e27 = 1.0 = 0% APR). The sUSDS contract exposes it via `ssr()`.
 *
 * Conversion to displayable APY:
 *   - rate_per_sec = ssr / 1e27
 *   - APY = (rate_per_sec ^ SECONDS_PER_YEAR - 1) × 100
 *
 * This fallback exists because DefiLlama Yields' indexing of sUSDS is
 * inconsistent — sometimes the project / symbol combo we look up is
 * missing or wrongly attributed to a Spark lending pool. The SSR is a
 * single contract slot; reading it on-chain is more reliable than the
 * Yields aggregation path.
 */
import { type Address } from "viem"
import { getEthClient } from "./eth-rpc"

/** sUSDS proxy on Ethereum mainnet — Sky's USDS savings vault. */
const SUSDS_ADDRESS: Address = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD"

const SUSDS_ABI = [
  {
    type: "function",
    name: "ssr",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

const RAY = 1e27
const SECONDS_PER_YEAR = 31_536_000

export interface SkySavingsRate {
  /** APY in PERCENT (matches the codebase's APY convention). */
  apyPct: number
  /** Raw per-second rate, ray-scaled (1e27 base). Useful for downstream
   *  on-chain math. */
  ssrRay: bigint
  /** Unix seconds when the read completed. */
  fetchedAt: number
}

const CACHE_TTL_MS = 5 * 60_000
let cache: { value: SkySavingsRate; fetchedAt: number } | null = null

/** Read sUSDS.ssr() and convert to APY %. Returns null on RPC failure
 *  or when `ssr()` reverts (older deployments). */
export async function loadSkySavingsRate(): Promise<SkySavingsRate | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value
  }
  try {
    const client = getEthClient()
    const ssrRay = (await client.readContract({
      address: SUSDS_ADDRESS,
      abi: SUSDS_ABI,
      functionName: "ssr",
    })) as bigint
    if (ssrRay <= 0n) return null
    const ratePerSec = Number(ssrRay) / RAY
    // Per-second compound → annual:
    //   APR_continuous = ln(ratePerSec) × SECONDS_PER_YEAR
    //   APY = exp(APR_continuous) − 1, rendered as percent
    // Equivalent to (ratePerSec ^ SECONDS_PER_YEAR − 1) but more
    // numerically stable for tiny per-second rates.
    if (ratePerSec <= 1) return null
    const lnRate = Math.log(ratePerSec)
    const aprContinuous = lnRate * SECONDS_PER_YEAR
    const apy = (Math.exp(aprContinuous) - 1) * 100
    if (!Number.isFinite(apy) || apy <= 0) return null
    const result: SkySavingsRate = {
      apyPct: apy,
      ssrRay,
      fetchedAt: Math.floor(Date.now() / 1000),
    }
    cache = { value: result, fetchedAt: Date.now() }
    return result
  } catch (err: any) {
    console.error("[sky-onchain] SSR load failed:", err?.message ?? err)
    return null
  }
}
