/**
 * Aave V3 Umbrella — on-chain reads.
 *
 * Umbrella is Aave's per-asset staking layer that backstops bad debt on
 * each reserve individually (vs the legacy Safety Module's single
 * AAVE-token pool that backstops the protocol globally). Stakers
 * deposit aTokens (waUSDC, waUSDT, waWETH) or GHO directly and earn
 * coverage rewards in exchange for slashing risk on the matching
 * reserve.
 *
 * Each per-asset stake token is an ERC-4626 vault:
 *   - totalAssets()  → underlying-asset units backing the vault
 *   - asset()        → underlying token (waUSDC / waUSDT / waWETH / GHO)
 *
 * Coverage USD = totalAssets() × underlying USD price. Stables and GHO
 * track $1; WETH price is pulled from the live Aave V3 reserves snapshot
 * the page is already loading.
 *
 * Addresses sourced from BGD Labs' canonical aave-address-book:
 *   https://github.com/bgd-labs/aave-address-book/blob/main/src/UmbrellaEthereum.sol
 *
 * The pattern matches Chaos Labs' "Reserves" table on the Aave Umbrella
 * dashboard and TokenLogic's per-asset coverage donut. Coverage numbers
 * here should reconcile with theirs within snapshot drift.
 */
import { type Address } from "viem"
import { getEthClient } from "./eth-rpc"

interface StakeTokenConfig {
  /** Display symbol on the dashboard (matches Chaos / TokenLogic labels). */
  symbol: "USDC" | "USDT" | "WETH" | "GHO"
  /** UmbrellaStakeToken contract address on Ethereum mainnet. */
  address: Address
  /** Underlying-asset decimals — needed to convert totalAssets() to a
   *  human-readable amount. waUSDC + waUSDT inherit USDC/USDT's 6 decs;
   *  waWETH and GHO are 18. */
  decimals: number
}

const STAKE_TOKENS: StakeTokenConfig[] = [
  {
    symbol: "USDC",
    address: "0x6bf183243FdD1e306ad2C4450BC7dcf6f0bf8Aa6",
    decimals: 6,
  },
  {
    symbol: "USDT",
    address: "0xA484Ab92fe32B143AEE7019fC1502b1dAA522D31",
    decimals: 6,
  },
  {
    symbol: "WETH",
    address: "0xaAFD07D53A7365D3e9fb6F3a3B09EC19676B73Ce",
    decimals: 18,
  },
  {
    symbol: "GHO",
    address: "0x4f827A63755855cDf3e8f3bcD20265C833f15033",
    decimals: 18,
  },
]

/** Minimal ERC-4626 ABI for the reads we need. */
const UMBRELLA_STAKE_TOKEN_ABI = [
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const

export interface UmbrellaReserveCoverage {
  symbol: "USDC" | "USDT" | "WETH" | "GHO"
  /** Underlying-asset units staked (waUSDC / waUSDT / waWETH or GHO). */
  totalAssets: number
  /** Total stkToken shares minted (for the backing-ratio computation). */
  totalSupply: number
  /** Underlying USD price used to convert totalAssets to USD. */
  priceUsd: number
  /** USD coverage = totalAssets × priceUsd. */
  coverageUsd: number
}

export interface UmbrellaStatus {
  reserves: UmbrellaReserveCoverage[]
  /** Sum of coverageUsd across all four reserves. */
  totalCoverageUsd: number
  /** Unix-second timestamp when the on-chain reads were taken. */
  fetchedAt: number
}

/** Cache the snapshot for 5 minutes — Umbrella stake balances move slowly
 *  (deposits / withdrawals during cooldown windows), so re-fetching on
 *  every request just adds latency. Same TTL as the Safety Module
 *  cache. */
const CACHE_TTL_MS = 5 * 60_000
let cache: { value: UmbrellaStatus; fetchedAt: number } | null = null

/**
 * Read per-asset Umbrella coverage on-chain.
 *
 * Pricing strategy:
 *   - Stables (USDC, USDT, GHO) are pegged to $1 within tight bounds; we
 *     use $1 directly. Re-pegs and depeg events would skew the number,
 *     but Umbrella coverage as a metric is read in USD-of-coverage terms
 *     with the same approximation by both Chaos Labs and TokenLogic.
 *   - WETH price is passed in by the caller. The /protocols page is
 *     already calling `loadAllAaveReservesLive` (for the Markets table
 *     + AAVE price), so we re-use that data instead of issuing a second
 *     oracle round-trip.
 */
export async function loadUmbrellaStatus(
  wethPriceUsd: number | null,
): Promise<UmbrellaStatus | null> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value
  }
  const client = getEthClient()
  const ethPrice = wethPriceUsd ?? 0

  // Multicall via Promise.all — viem's batching collapses these into one
  // JSON-RPC request when the public client has multicall enabled, which
  // it is by default on mainnet.
  try {
    const results = await Promise.all(
      STAKE_TOKENS.map(async (cfg) => {
        const [totalAssets, totalSupply] = await Promise.all([
          client.readContract({
            address: cfg.address,
            abi: UMBRELLA_STAKE_TOKEN_ABI,
            functionName: "totalAssets",
          }),
          client.readContract({
            address: cfg.address,
            abi: UMBRELLA_STAKE_TOKEN_ABI,
            functionName: "totalSupply",
          }),
        ])
        const decimalsDivisor = 10 ** cfg.decimals
        const totalAssetsNum = Number(totalAssets) / decimalsDivisor
        const totalSupplyNum = Number(totalSupply) / decimalsDivisor
        const priceUsd =
          cfg.symbol === "WETH" ? ethPrice : 1
        return {
          symbol: cfg.symbol,
          totalAssets: totalAssetsNum,
          totalSupply: totalSupplyNum,
          priceUsd,
          coverageUsd: totalAssetsNum * priceUsd,
        } satisfies UmbrellaReserveCoverage
      }),
    )

    const totalCoverageUsd = results.reduce((s, r) => s + r.coverageUsd, 0)
    const status: UmbrellaStatus = {
      reserves: results,
      totalCoverageUsd,
      fetchedAt: Math.floor(now / 1000),
    }
    cache = { value: status, fetchedAt: now }
    return status
  } catch (err: any) {
    console.error("[aave-umbrella] load failed:", err?.message ?? err)
    return null
  }
}
