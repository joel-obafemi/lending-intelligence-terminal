/**
 * Fluid (Liquidity Layer + Vaults) on-chain reads.
 *
 * Fluid's architecture is fundamentally different from Aave V3 / SparkLend:
 *  - There's no single "reserve" struct. Instead each *vault* is a
 *    (collateral, loan) pair with its own contract.
 *  - The shared "Liquidity Layer" sits underneath, providing the actual
 *    deposit pools that vaults plug into.
 *  - Some vaults are "smart" (collateral/debt is a Fluid DEX position) —
 *    we treat those as regular vaults whose collateral/loan are the DEX's
 *    underlying token0.
 *
 * One contract call (`VaultResolver.getVaultsEntireData()`) returns every
 * active vault in one batch — including configs, exchange rates, totals,
 * limits, and constant views (asset addresses, vault id, vault type). We
 * decode just the fields the market detail page consumes.
 *
 * What we extract per vault for `MarketDetail`:
 *  - **Collateral / loan asset addresses** (for DefiLlama poolId routing).
 *  - **Collateral Factor + Liquidation Threshold** (basis points → 0-1).
 *  - **Borrow Fee + Liquidation Penalty** (basis points → 0-1).
 *  - **Caps** (`borrowLimit` / `withdrawLimit` in token units).
 *  - **Vault type** (`vaultType` — for the parameters card label).
 *
 * What we DON'T do (deferred — Fluid's accounting math is involved):
 *  - IRM curve sampling (Fluid uses a different rate model than Aave's
 *    piecewise-linear; rates depend on Liquidity Layer utilization).
 *  - USD-denominated totals (we leave DefiLlama's TVL/borrow USD as-is;
 *    Fluid's `oraclePriceOperate` needs careful interpretation per
 *    vault type to convert raw amounts to USD).
 */
import { type Address } from "viem"
import { getEthClient } from "./eth-rpc"

const VAULT_RESOLVER: Address = "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC"

// ─────────────────────────────────────────────────────────────────────────
// ABI for `getVaultsEntireData()` (no-args batched form). Field order MUST
// match `Structs.VaultEntireData` in fluid-contracts-public/contracts/
// periphery/resolvers/vault/structs.sol exactly.
// ─────────────────────────────────────────────────────────────────────────

const TOKENS_TUPLE = {
  type: "tuple",
  components: [
    { name: "token0", type: "address" },
    { name: "token1", type: "address" },
  ],
} as const

const CONSTANT_VIEWS_TUPLE = {
  type: "tuple",
  components: [
    { name: "liquidity", type: "address" },
    { name: "factory", type: "address" },
    { name: "operateImplementation", type: "address" },
    { name: "adminImplementation", type: "address" },
    { name: "secondaryImplementation", type: "address" },
    { name: "deployer", type: "address" },
    { name: "supply", type: "address" },
    { name: "borrow", type: "address" },
    { ...TOKENS_TUPLE, name: "supplyToken" },
    { ...TOKENS_TUPLE, name: "borrowToken" },
    { name: "vaultId", type: "uint256" },
    { name: "vaultType", type: "uint256" },
    { name: "supplyExchangePriceSlot", type: "bytes32" },
    { name: "borrowExchangePriceSlot", type: "bytes32" },
    { name: "userSupplySlot", type: "bytes32" },
    { name: "userBorrowSlot", type: "bytes32" },
  ],
} as const

const CONFIGS_TUPLE = {
  type: "tuple",
  components: [
    { name: "supplyRateMagnifier", type: "uint16" },
    { name: "borrowRateMagnifier", type: "uint16" },
    { name: "collateralFactor", type: "uint16" },
    { name: "liquidationThreshold", type: "uint16" },
    { name: "liquidationMaxLimit", type: "uint16" },
    { name: "withdrawalGap", type: "uint16" },
    { name: "liquidationPenalty", type: "uint16" },
    { name: "borrowFee", type: "uint16" },
    { name: "oracle", type: "address" },
    { name: "oraclePriceOperate", type: "uint256" },
    { name: "oraclePriceLiquidate", type: "uint256" },
    { name: "rebalancer", type: "address" },
    { name: "lastUpdateTimestamp", type: "uint256" },
  ],
} as const

const EXCHANGE_PRICES_AND_RATES_TUPLE = {
  type: "tuple",
  components: [
    { name: "lastStoredLiquiditySupplyExchangePrice", type: "uint256" },
    { name: "lastStoredLiquidityBorrowExchangePrice", type: "uint256" },
    { name: "lastStoredVaultSupplyExchangePrice", type: "uint256" },
    { name: "lastStoredVaultBorrowExchangePrice", type: "uint256" },
    { name: "liquiditySupplyExchangePrice", type: "uint256" },
    { name: "liquidityBorrowExchangePrice", type: "uint256" },
    { name: "vaultSupplyExchangePrice", type: "uint256" },
    { name: "vaultBorrowExchangePrice", type: "uint256" },
    { name: "supplyRateLiquidity", type: "uint256" },
    { name: "borrowRateLiquidity", type: "uint256" },
    { name: "supplyRateVault", type: "int256" },
    { name: "borrowRateVault", type: "int256" },
    { name: "rewardsOrFeeRateSupply", type: "int256" },
    { name: "rewardsOrFeeRateBorrow", type: "int256" },
  ],
} as const

const TOTAL_SUPPLY_AND_BORROW_TUPLE = {
  type: "tuple",
  components: [
    { name: "totalSupplyVault", type: "uint256" },
    { name: "totalBorrowVault", type: "uint256" },
    { name: "totalSupplyLiquidityOrDex", type: "uint256" },
    { name: "totalBorrowLiquidityOrDex", type: "uint256" },
    { name: "absorbedSupply", type: "uint256" },
    { name: "absorbedBorrow", type: "uint256" },
  ],
} as const

const LIMITS_TUPLE = {
  type: "tuple",
  components: [
    { name: "withdrawLimit", type: "uint256" },
    { name: "withdrawableUntilLimit", type: "uint256" },
    { name: "withdrawable", type: "uint256" },
    { name: "borrowLimit", type: "uint256" },
    { name: "borrowableUntilLimit", type: "uint256" },
    { name: "borrowable", type: "uint256" },
    { name: "borrowLimitUtilization", type: "uint256" },
    { name: "minimumBorrowing", type: "uint256" },
  ],
} as const

const CURRENT_BRANCH_TUPLE = {
  type: "tuple",
  components: [
    { name: "status", type: "uint256" },
    { name: "minimaTick", type: "int256" },
    { name: "debtFactor", type: "uint256" },
    { name: "partials", type: "uint256" },
    { name: "debtLiquidity", type: "uint256" },
    { name: "baseBranchId", type: "uint256" },
    { name: "baseBranchMinima", type: "int256" },
  ],
} as const

const VAULT_STATE_TUPLE = {
  type: "tuple",
  components: [
    { name: "totalPositions", type: "uint256" },
    { name: "topTick", type: "int256" },
    { name: "currentBranch", type: "uint256" },
    { name: "totalBranch", type: "uint256" },
    { name: "totalBorrow", type: "uint256" },
    { name: "totalSupply", type: "uint256" },
    { ...CURRENT_BRANCH_TUPLE, name: "currentBranchState" },
  ],
} as const

const USER_SUPPLY_DATA_TUPLE = {
  type: "tuple",
  components: [
    { name: "modeWithInterest", type: "bool" },
    { name: "supply", type: "uint256" },
    { name: "withdrawalLimit", type: "uint256" },
    { name: "lastUpdateTimestamp", type: "uint256" },
    { name: "expandPercent", type: "uint256" },
    { name: "expandDuration", type: "uint256" },
    { name: "baseWithdrawalLimit", type: "uint256" },
    { name: "withdrawableUntilLimit", type: "uint256" },
    { name: "withdrawable", type: "uint256" },
    { name: "decayEndTimestamp", type: "uint256" },
    { name: "decayAmount", type: "uint256" },
  ],
} as const

const USER_BORROW_DATA_TUPLE = {
  type: "tuple",
  components: [
    { name: "modeWithInterest", type: "bool" },
    { name: "borrow", type: "uint256" },
    { name: "borrowLimit", type: "uint256" },
    { name: "lastUpdateTimestamp", type: "uint256" },
    { name: "expandPercent", type: "uint256" },
    { name: "expandDuration", type: "uint256" },
    { name: "baseBorrowLimit", type: "uint256" },
    { name: "maxBorrowLimit", type: "uint256" },
    { name: "borrowableUntilLimit", type: "uint256" },
    { name: "borrowable", type: "uint256" },
    { name: "borrowLimitUtilization", type: "uint256" },
  ],
} as const

const VAULT_RESOLVER_ABI = [
  {
    type: "function",
    name: "getVaultsEntireData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "vaultsData",
        type: "tuple[]",
        components: [
          { name: "vault", type: "address" },
          { name: "isSmartCol", type: "bool" },
          { name: "isSmartDebt", type: "bool" },
          { ...CONSTANT_VIEWS_TUPLE, name: "constantVariables" },
          { ...CONFIGS_TUPLE, name: "configs" },
          { ...EXCHANGE_PRICES_AND_RATES_TUPLE, name: "exchangePricesAndRates" },
          { ...TOTAL_SUPPLY_AND_BORROW_TUPLE, name: "totalSupplyAndBorrow" },
          { ...LIMITS_TUPLE, name: "limitsAndAvailability" },
          { ...VAULT_STATE_TUPLE, name: "vaultState" },
          { ...USER_SUPPLY_DATA_TUPLE, name: "liquidityUserSupplyData" },
          { ...USER_BORROW_DATA_TUPLE, name: "liquidityUserBorrowData" },
        ],
      },
    ],
  },
] as const

// ─────────────────────────────────────────────────────────────────────────
// Public types — clean shape after decoding.
// ─────────────────────────────────────────────────────────────────────────

export interface FluidVaultLive {
  address: string
  isSmartCol: boolean
  isSmartDebt: boolean
  vaultId: number
  vaultType: number
  /** Collateral asset address. For smart collateral this is `token0` of the
   *  DEX position (the side most users would search by). */
  collateralAsset: string
  /** Loan asset address. Same caveat for smart debt. */
  loanAsset: string

  // Risk parameters — all 0-1 fractions, decoded from Fluid's basis-point
  // (1e4) encoding.
  collateralFactor: number     // = "LTV" in Aave terms
  liquidationThreshold: number
  liquidationPenalty: number   // = liquidation bonus to the liquidator
  borrowFee: number            // ≈ reserve factor; protocol take on borrow

  // Caps in TOKEN units (raw, decimal-adjusted is the caller's job — we
  // don't have decimals at this layer).
  supplyCapRaw: bigint         // withdrawLimit (Liquidity Layer cap on this vault's deposits)
  borrowCapRaw: bigint         // borrowLimit (Liquidity Layer cap on this vault's borrows)
  /** Available headroom — useful to surface "X% used" in the UI. */
  withdrawableRaw: bigint
  borrowableRaw: bigint

  /** Total supply / borrow at the vault layer, raw token units (need decimals). */
  totalSupplyRaw: bigint
  totalBorrowRaw: bigint
}

// ─────────────────────────────────────────────────────────────────────────
// Single-flight cache. Fluid vault state moves slowly; 5-minute TTL is fine.
// ─────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60_000
let cache: { fetchedAt: number; vaults: FluidVaultLive[] } | null = null

function bpsToFraction(bps: number): number {
  return bps / 10_000
}

export async function loadAllFluidVaultsLive(): Promise<FluidVaultLive[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.vaults

  const client = getEthClient()
  const raw = (await client.readContract({
    address: VAULT_RESOLVER,
    abi: VAULT_RESOLVER_ABI,
    functionName: "getVaultsEntireData",
  })) as unknown as Array<Record<string, any>>

  const vaults: FluidVaultLive[] = raw.map((v) => {
    const cv = v.constantVariables
    const cf = v.configs
    const lim = v.limitsAndAvailability
    const sb = v.totalSupplyAndBorrow

    // For smart vaults, the "primary" asset is token0 of supplyToken /
    // borrowToken — that's what users find when searching by asset symbol.
    const collateralAsset = cv.supplyToken.token0 as string
    const loanAsset = cv.borrowToken.token0 as string

    return {
      address: v.vault as string,
      isSmartCol: v.isSmartCol as boolean,
      isSmartDebt: v.isSmartDebt as boolean,
      vaultId: Number(cv.vaultId),
      vaultType: Number(cv.vaultType),
      collateralAsset,
      loanAsset,
      collateralFactor: bpsToFraction(Number(cf.collateralFactor)),
      liquidationThreshold: bpsToFraction(Number(cf.liquidationThreshold)),
      liquidationPenalty: bpsToFraction(Number(cf.liquidationPenalty)),
      borrowFee: bpsToFraction(Number(cf.borrowFee)),
      supplyCapRaw: lim.withdrawLimit as bigint,
      borrowCapRaw: lim.borrowLimit as bigint,
      withdrawableRaw: lim.withdrawable as bigint,
      borrowableRaw: lim.borrowable as bigint,
      totalSupplyRaw: sb.totalSupplyVault as bigint,
      totalBorrowRaw: sb.totalBorrowVault as bigint,
    }
  })

  cache = { fetchedAt: Date.now(), vaults }
  return vaults
}

/** Native-ETH sentinels used by different protocols. We treat them all as
 *  equal so DefiLlama's `0x0000…0000` matches Fluid's `0xEEEE…EEEE`. */
const ETH_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
])

function normalizeAssetAddress(addr: string): string {
  const lower = addr.toLowerCase()
  return ETH_SENTINELS.has(lower) ? "ETH" : lower
}

/**
 * Find a Fluid vault matching a (collateral, loan) asset-address pair.
 *
 * Multiple vaults may share the same pair with different LTV settings. We
 * pick the one with the highest total supply, matching DefiLlama's
 * convention of representing the dominant pool per asset pair.
 *
 * Address comparison normalizes ETH sentinels — Fluid uses ERC-7528's
 * `0xEEEE…EEEE` for native ETH, DefiLlama uses `0x0000…0000`. Either form
 * passed in resolves correctly.
 */
export async function findFluidVaultForPair(
  collateralAddress: string,
  loanAddress: string,
): Promise<FluidVaultLive | null> {
  const vaults = await loadAllFluidVaultsLive()
  const col = normalizeAssetAddress(collateralAddress)
  const loan = normalizeAssetAddress(loanAddress)
  const matches = vaults.filter(
    (v) =>
      normalizeAssetAddress(v.collateralAsset) === col &&
      normalizeAssetAddress(v.loanAsset) === loan,
  )
  if (matches.length === 0) return null
  // Pick the largest-supply matching vault (DefiLlama's chosen "the" pool).
  matches.sort((a, b) => Number(b.totalSupplyRaw - a.totalSupplyRaw))
  return matches[0]
}
