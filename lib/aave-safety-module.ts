/**
 * Aave V3 Safety Module — on-chain reads.
 *
 * The Safety Module (SM) is the staked-AAVE pool that backstops protocol
 * insolvency risk. Stakers deposit AAVE, receive `stkAAVE` 1:1, and earn
 * a share of protocol revenue + AAVE incentives. In return, up to 30% of
 * the SM can be slashed to cover bad debt — that's the cap the
 * SAFETY_MODULE_MAX_SLASH constant tracks.
 *
 * V1 reads:
 *   - stkAAVE.totalSupply()  → total stkAAVE in circulation
 *   - AAVE.balanceOf(stkAAVE) → underlying AAVE held by the SM
 *   - backing ratio = AAVE balance / stkAAVE supply (ideally 1.0)
 *
 * The newer "Umbrella" multi-asset Safety Module is rolling out across
 * Aave deployments. When it lands the canonical address book entry
 * here, this file gets a sibling loader and the page surfaces both —
 * for now the original stkAAVE pool is the metric institutional readers
 * actually track.
 */

import { type Address } from "viem"
import { getEthClient } from "./eth-rpc"

// stkAAVE-v3 (the canonical Safety Module on Ethereum mainnet).
const STK_AAVE_ADDRESS: Address = "0x4da27a545c0c5B758a6BA100e3a049001de870f5"
// AAVE governance token.
const AAVE_TOKEN_ADDRESS: Address = "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9"
// Maximum slashable portion of the SM, set on-chain via governance proposals.
// This was raised from 30% → 30% across multiple votes; treat as a
// methodology constant rather than re-reading on every call.
export const SAFETY_MODULE_MAX_SLASH_PCT = 30

// Minimal ERC20 ABI fragment — totalSupply + balanceOf are all we need.
const ERC20_ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export interface SafetyModuleStatus {
  /** stkAAVE total supply in whole AAVE units (decimals: 18). */
  stkAaveSupply: number
  /** AAVE token balance held by the stkAAVE contract (decimals: 18). */
  aaveBacking: number
  /** AAVE per stkAAVE — 1.0 means full 1:1 backing. */
  backingRatio: number
  /** Maximum dollar amount the SM is theoretically permitted to slash —
   *  computed as `aaveBacking × maxSlashPct × aavePriceUsd` when the
   *  caller passes a price. Returned in USD when `aavePriceUsd` is
   *  provided, null otherwise. */
  maxSlashableUsd: number | null
  /** Total SM size in USD (full backing × current price), null when
   *  price isn't available. */
  smTotalUsd: number | null
  /** AAVE/USD price used in the USD calculations, null when missing. */
  aavePriceUsd: number | null
  /** Unix seconds when the on-chain reads completed. */
  fetchedAt: number
}

const SCALE_18 = 1e18

/** Cache stkAAVE state for 5 minutes — slow-moving data, no need to call
 *  on every page render. */
const CACHE_TTL_MS = 5 * 60_000
let cache: { value: SafetyModuleStatus; fetchedAt: number } | null = null

/**
 * Pull current SM state on-chain. `aavePriceUsd` is optional; pass it from
 * the page (DefiLlama price feed) to surface the USD-denominated SM size.
 */
export async function loadSafetyModuleStatus(
  aavePriceUsd: number | null = null,
): Promise<SafetyModuleStatus> {
  // Fast path: serve cache when fresh, but re-stamp the USD figures with the
  // caller's latest price (the AAVE balance + stkAAVE supply move slowly,
  // the price doesn't).
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return withPrice(cache.value, aavePriceUsd)
  }
  const client = getEthClient()
  const [stkSupplyRaw, aaveBalanceRaw] = await Promise.all([
    client.readContract({
      address: STK_AAVE_ADDRESS,
      abi: ERC20_ABI,
      functionName: "totalSupply",
    }),
    client.readContract({
      address: AAVE_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [STK_AAVE_ADDRESS],
    }),
  ])

  const stkAaveSupply = Number(stkSupplyRaw) / SCALE_18
  const aaveBacking = Number(aaveBalanceRaw) / SCALE_18
  const backingRatio = stkAaveSupply > 0 ? aaveBacking / stkAaveSupply : 0
  const baseStatus: SafetyModuleStatus = {
    stkAaveSupply,
    aaveBacking,
    backingRatio,
    maxSlashableUsd: null,
    smTotalUsd: null,
    aavePriceUsd: null,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
  cache = { value: baseStatus, fetchedAt: Date.now() }
  return withPrice(baseStatus, aavePriceUsd)
}

function withPrice(
  base: SafetyModuleStatus,
  aavePriceUsd: number | null,
): SafetyModuleStatus {
  if (aavePriceUsd == null || !Number.isFinite(aavePriceUsd) || aavePriceUsd <= 0) {
    return { ...base, aavePriceUsd: null, maxSlashableUsd: null, smTotalUsd: null }
  }
  const smTotalUsd = base.aaveBacking * aavePriceUsd
  const maxSlashableUsd = smTotalUsd * (SAFETY_MODULE_MAX_SLASH_PCT / 100)
  return { ...base, aavePriceUsd, smTotalUsd, maxSlashableUsd }
}
