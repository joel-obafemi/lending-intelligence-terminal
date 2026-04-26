/**
 * Aave V3-style on-chain reserve reads — shared core for **Aave V3** and any
 * V3 fork (notably **SparkLend**) deployed on Ethereum mainnet.
 *
 * Both protocols use the same `UiPoolDataProviderV3` contract code; only the
 * deployed addresses differ. We expose a generic `loadReservesViaProvider()`
 * keyed on `(addressesProvider, uiPoolDataProvider)` and let per-protocol
 * wrappers (`lib/aave-onchain.ts`, `lib/spark-onchain.ts`) inject their
 * addresses.
 *
 * Field meanings + scaling are documented in `loadReservesViaProvider()`. The
 * IRM curve sampler at the bottom is the standard Aave V3 piecewise-linear
 * formula and applies to Spark unchanged.
 *
 *  - **Caps / RF / LT / LTV**: basis-point fields scaled to 0-1 fractions.
 *  - **IRM params**: ray-scaled (1e27) → 0-1 fractions, then sampled over
 *    [0, 1] to produce the curve the UI renders.
 *  - **Reserves USD**: `accruedToTreasury × liquidityIndex / RAY × price`,
 *    matching how Aave's own UI computes the displayed treasury balance.
 */
import { getEthClient } from "./eth-rpc"
import { type Address } from "viem"

// ─────────────────────────────────────────────────────────────────────────
// ABI — UiPoolDataProviderV3.getReservesData(address provider).
// Spark uses a slightly older fork that DOESN'T include the V3.3+ fields
// (`deficit`, `borrowableInIsolation`); we omit those from the shared ABI
// and only consume them when present. Aave V3 mainnet is V3.3+ but tolerates
// the shorter struct because viem decodes left-to-right and stops at the
// declared end — fields after our last entry just get ignored.
//
// Field order is taken from Aave's `IUiPoolDataProviderV3.AggregatedReserveData`
// (latest at https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/helpers/interfaces/IUiPoolDataProviderV3.sol).
// ─────────────────────────────────────────────────────────────────────────

const UI_POOL_DATA_PROVIDER_ABI = [
  {
    type: "function",
    name: "getReservesData",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [
      {
        name: "reserves",
        type: "tuple[]",
        components: [
          { name: "underlyingAsset", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "decimals", type: "uint256" },
          { name: "baseLTVasCollateral", type: "uint256" },
          { name: "reserveLiquidationThreshold", type: "uint256" },
          { name: "reserveLiquidationBonus", type: "uint256" },
          { name: "reserveFactor", type: "uint256" },
          { name: "usageAsCollateralEnabled", type: "bool" },
          { name: "borrowingEnabled", type: "bool" },
          { name: "isActive", type: "bool" },
          { name: "isFrozen", type: "bool" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "liquidityRate", type: "uint128" },
          { name: "variableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "aTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "availableLiquidity", type: "uint256" },
          { name: "totalScaledVariableDebt", type: "uint256" },
          { name: "priceInMarketReferenceCurrency", type: "uint256" },
          { name: "priceOracle", type: "address" },
          { name: "variableRateSlope1", type: "uint256" },
          { name: "variableRateSlope2", type: "uint256" },
          { name: "baseVariableBorrowRate", type: "uint256" },
          { name: "optimalUsageRatio", type: "uint256" },
          { name: "isPaused", type: "bool" },
          { name: "isSiloedBorrowing", type: "bool" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
          { name: "flashLoanEnabled", type: "bool" },
          { name: "debtCeiling", type: "uint256" },
          { name: "debtCeilingDecimals", type: "uint256" },
          { name: "borrowCap", type: "uint256" },
          { name: "supplyCap", type: "uint256" },
          { name: "borrowableInIsolation", type: "bool" },
          { name: "virtualUnderlyingBalance", type: "uint128" },
          { name: "deficit", type: "uint128" },
        ],
      },
      {
        name: "baseCurrency",
        type: "tuple",
        components: [
          { name: "marketReferenceCurrencyUnit", type: "uint256" },
          { name: "marketReferenceCurrencyPriceInUsd", type: "int256" },
          { name: "networkBaseTokenPriceInUsd", type: "int256" },
          { name: "networkBaseTokenPriceDecimals", type: "uint8" },
        ],
      },
    ],
  },
] as const

/** Older Aave V3 forks (Spark) don't have `deficit` / `borrowableInIsolation` /
 *  `virtualUnderlyingBalance`. This shorter ABI matches that struct exactly. */
const UI_POOL_DATA_PROVIDER_ABI_LEGACY = [
  {
    type: "function",
    name: "getReservesData",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [
      {
        name: "reserves",
        type: "tuple[]",
        components: [
          { name: "underlyingAsset", type: "address" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "decimals", type: "uint256" },
          { name: "baseLTVasCollateral", type: "uint256" },
          { name: "reserveLiquidationThreshold", type: "uint256" },
          { name: "reserveLiquidationBonus", type: "uint256" },
          { name: "reserveFactor", type: "uint256" },
          { name: "usageAsCollateralEnabled", type: "bool" },
          { name: "borrowingEnabled", type: "bool" },
          { name: "stableBorrowRateEnabled", type: "bool" },
          { name: "isActive", type: "bool" },
          { name: "isFrozen", type: "bool" },
          { name: "liquidityIndex", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "liquidityRate", type: "uint128" },
          { name: "variableBorrowRate", type: "uint128" },
          { name: "stableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "availableLiquidity", type: "uint256" },
          { name: "totalPrincipalStableDebt", type: "uint256" },
          { name: "averageStableRate", type: "uint256" },
          { name: "stableDebtLastUpdateTimestamp", type: "uint256" },
          { name: "totalScaledVariableDebt", type: "uint256" },
          { name: "priceInMarketReferenceCurrency", type: "uint256" },
          { name: "priceOracle", type: "address" },
          { name: "variableRateSlope1", type: "uint256" },
          { name: "variableRateSlope2", type: "uint256" },
          { name: "stableRateSlope1", type: "uint256" },
          { name: "stableRateSlope2", type: "uint256" },
          { name: "baseStableBorrowRate", type: "uint256" },
          { name: "baseVariableBorrowRate", type: "uint256" },
          { name: "optimalUsageRatio", type: "uint256" },
          { name: "isPaused", type: "bool" },
          { name: "isSiloedBorrowing", type: "bool" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
          { name: "flashLoanEnabled", type: "bool" },
          { name: "debtCeiling", type: "uint256" },
          { name: "debtCeilingDecimals", type: "uint256" },
          { name: "eModeCategoryId", type: "uint8" },
          { name: "borrowCap", type: "uint256" },
          { name: "supplyCap", type: "uint256" },
          { name: "eModeLtv", type: "uint16" },
          { name: "eModeLiquidationThreshold", type: "uint16" },
          { name: "eModeLiquidationBonus", type: "uint16" },
          { name: "eModePriceSource", type: "address" },
          { name: "eModeLabel", type: "string" },
          { name: "borrowableInIsolation", type: "bool" },
        ],
      },
      {
        name: "baseCurrency",
        type: "tuple",
        components: [
          { name: "marketReferenceCurrencyUnit", type: "uint256" },
          { name: "marketReferenceCurrencyPriceInUsd", type: "int256" },
          { name: "networkBaseTokenPriceInUsd", type: "int256" },
          { name: "networkBaseTokenPriceDecimals", type: "uint8" },
        ],
      },
    ],
  },
] as const

// ─────────────────────────────────────────────────────────────────────────
// Public types — same shape across protocols. Consumers don't care which
// provider supplied the reserve.
// ─────────────────────────────────────────────────────────────────────────

export interface AaveStyleReserve {
  underlyingAsset: string
  symbol: string
  decimals: number
  isActive: boolean
  isFrozen: boolean
  isPaused: boolean

  priceUsd: number
  totalSupplyToken: number
  totalSupplyUsd: number
  totalBorrowToken: number
  totalBorrowUsd: number
  availableLiquidityToken: number
  availableLiquidityUsd: number
  /** Treasury-accrued reserves (the "reserves" headline number). */
  reservesToken: number
  reservesUsd: number

  ltv: number                       // 0-1 fraction
  liquidationThreshold: number      // 0-1
  liquidationBonus: number          // 0-1 (e.g. 0.05 = +5% bonus to liquidators)
  reserveFactor: number             // 0-1
  utilization: number               // 0-1

  supplyApy: number                 // PERCENT (matches rest of codebase)
  borrowApy: number

  baseVariableBorrowRate: number    // 0-1 fraction
  variableRateSlope1: number
  variableRateSlope2: number
  optimalUsageRatio: number         // The "kink"

  supplyCapToken: number            // Token units; 0 = no cap
  borrowCapToken: number
  supplyCapUsd: number | null
  borrowCapUsd: number | null

  borrowingEnabled: boolean
  flashLoanEnabled: boolean
  /** V3.3+ field; undefined for older deployments (Spark). */
  deficitToken: number | null
  deficitUsd: number | null
}

export interface AaveStyleAddresses {
  /** Stable debug label — `"Aave V3"`, `"SparkLend"`. */
  protocolLabel: string
  /** PoolAddressesProvider — the argument passed to getReservesData. */
  addressesProvider: Address
  /** UiPoolDataProvider deployment for this protocol. */
  uiPoolDataProvider: Address
  /** When true, decode with the legacy (pre-V3.3) struct shape. */
  legacy?: boolean
}

const RAY = 1e27
const SECONDS_PER_YEAR = 31_536_000

function bigToNumber(v: bigint, decimals: number): number {
  if (v === 0n) return 0
  if (decimals === 0) return Number(v)
  const divisor = 10n ** BigInt(decimals)
  const whole = v / divisor
  const frac = v % divisor
  return Number(whole) + Number(frac) / Number(divisor)
}

function rayRateToApy(rayApr: bigint): number {
  if (rayApr === 0n) return 0
  const apr = Number(rayApr) / RAY
  return (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100
}

// ─────────────────────────────────────────────────────────────────────────
// Single-flight cache, keyed by UiPoolDataProvider address so Aave + Spark
// each get their own slot.
// ─────────────────────────────────────────────────────────────────────────

const SNAPSHOT_TTL_MS = 30_000
const snapshotCache = new Map<string, { fetchedAt: number; data: AaveStyleReserve[] }>()

export async function loadReservesViaProvider(
  addresses: AaveStyleAddresses,
): Promise<AaveStyleReserve[]> {
  const cacheKey = addresses.uiPoolDataProvider.toLowerCase()
  const cached = snapshotCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_TTL_MS) return cached.data

  const client = getEthClient()
  // Cast the result to the union of the two ABI shapes we accept; we only
  // read fields present in BOTH so the typing stays sound either way.
  const result = await client.readContract({
    address: addresses.uiPoolDataProvider,
    abi: addresses.legacy ? UI_POOL_DATA_PROVIDER_ABI_LEGACY : UI_POOL_DATA_PROVIDER_ABI,
    functionName: "getReservesData",
    args: [addresses.addressesProvider],
  } as never)
  // viem returns [reserves, baseCurrency] for both ABIs.
  const [reservesRaw, baseCurrency] = result as unknown as [Array<Record<string, any>>, Record<string, any>]

  const refUnit = Number(baseCurrency.marketReferenceCurrencyUnit) // typically 1e8
  const refPriceUsd =
    Number(baseCurrency.marketReferenceCurrencyPriceInUsd) /
    Math.pow(10, baseCurrency.networkBaseTokenPriceDecimals)

  const reserves: AaveStyleReserve[] = reservesRaw.map((r) => {
    const decimals = Number(r.decimals)
    const availableLiquidityToken = bigToNumber(r.availableLiquidity, decimals)
    const variableBorrowIndex = Number(r.variableBorrowIndex) / RAY
    const liquidityIndex = Number(r.liquidityIndex) / RAY
    const totalScaledDebt = bigToNumber(r.totalScaledVariableDebt, decimals)
    const totalBorrowToken = totalScaledDebt * variableBorrowIndex
    const totalSupplyToken = availableLiquidityToken + totalBorrowToken
    const accruedToTreasuryScaled = bigToNumber(r.accruedToTreasury, decimals)
    const reservesToken = accruedToTreasuryScaled * liquidityIndex
    const priceUsd = (Number(r.priceInMarketReferenceCurrency) / refUnit) * refPriceUsd

    const ltv = Number(r.baseLTVasCollateral) / 10_000
    const liquidationThreshold = Number(r.reserveLiquidationThreshold) / 10_000
    const liquidationBonus = Math.max(0, (Number(r.reserveLiquidationBonus) - 10_000) / 10_000)
    const reserveFactor = Number(r.reserveFactor) / 10_000

    const baseVariableBorrowRate = Number(r.baseVariableBorrowRate) / RAY
    const variableRateSlope1 = Number(r.variableRateSlope1) / RAY
    const variableRateSlope2 = Number(r.variableRateSlope2) / RAY
    const optimalUsageRatio = Number(r.optimalUsageRatio) / RAY

    const supplyCapToken = Number(r.supplyCap)
    const borrowCapToken = Number(r.borrowCap)

    const utilization = totalSupplyToken > 0 ? totalBorrowToken / totalSupplyToken : 0

    // `deficit` only exists on V3.3+ (Aave). Spark won't have it.
    const hasDeficit = r.deficit !== undefined
    const deficitToken = hasDeficit ? bigToNumber(r.deficit as bigint, decimals) : null
    const deficitUsd = deficitToken != null ? deficitToken * priceUsd : null

    return {
      underlyingAsset: r.underlyingAsset,
      symbol: r.symbol,
      decimals,
      isActive: r.isActive,
      isFrozen: r.isFrozen,
      isPaused: r.isPaused,
      priceUsd,
      totalSupplyToken,
      totalSupplyUsd: totalSupplyToken * priceUsd,
      totalBorrowToken,
      totalBorrowUsd: totalBorrowToken * priceUsd,
      availableLiquidityToken,
      availableLiquidityUsd: availableLiquidityToken * priceUsd,
      reservesToken,
      reservesUsd: reservesToken * priceUsd,
      ltv,
      liquidationThreshold,
      liquidationBonus,
      reserveFactor,
      utilization,
      supplyApy: rayRateToApy(r.liquidityRate),
      borrowApy: rayRateToApy(r.variableBorrowRate),
      baseVariableBorrowRate,
      variableRateSlope1,
      variableRateSlope2,
      optimalUsageRatio,
      supplyCapToken,
      borrowCapToken,
      supplyCapUsd: supplyCapToken > 0 ? supplyCapToken * priceUsd : null,
      borrowCapUsd: borrowCapToken > 0 ? borrowCapToken * priceUsd : null,
      borrowingEnabled: r.borrowingEnabled,
      flashLoanEnabled: r.flashLoanEnabled,
      deficitToken,
      deficitUsd,
    }
  })

  snapshotCache.set(cacheKey, { fetchedAt: Date.now(), data: reserves })
  return reserves
}

export async function findReserveByUnderlying(
  addresses: AaveStyleAddresses,
  underlyingAddress: string,
): Promise<AaveStyleReserve | null> {
  const reserves = await loadReservesViaProvider(addresses)
  const target = underlyingAddress.toLowerCase()
  return reserves.find((r) => r.underlyingAsset.toLowerCase() === target) ?? null
}

// ─────────────────────────────────────────────────────────────────────────
// IRM curve sampler — the Aave V3 piecewise-linear formula. Spark uses the
// same formula since it forks the same InterestRateStrategy contract.
// ─────────────────────────────────────────────────────────────────────────

export interface IrmCurvePoint {
  utilization: number  // 0-1
  supplyApy: number    // percent
  borrowApy: number    // percent
}

export function sampleIrmCurve(
  reserve: Pick<
    AaveStyleReserve,
    | "baseVariableBorrowRate"
    | "variableRateSlope1"
    | "variableRateSlope2"
    | "optimalUsageRatio"
    | "reserveFactor"
  >,
  pointCount = 60,
): IrmCurvePoint[] {
  const { baseVariableBorrowRate, variableRateSlope1, variableRateSlope2, optimalUsageRatio, reserveFactor } =
    reserve
  const points: IrmCurvePoint[] = []
  const utils = new Set<number>()
  for (let i = 0; i <= pointCount; i++) utils.add(i / pointCount)
  utils.add(optimalUsageRatio)
  utils.add(Math.max(0, optimalUsageRatio - 0.001))
  utils.add(Math.min(1, optimalUsageRatio + 0.001))

  for (const u of [...utils].sort((a, b) => a - b)) {
    let borrowAprAtU: number
    if (u <= optimalUsageRatio) {
      borrowAprAtU =
        baseVariableBorrowRate +
        (optimalUsageRatio > 0 ? (u / optimalUsageRatio) * variableRateSlope1 : 0)
    } else {
      const excess = (u - optimalUsageRatio) / Math.max(1e-9, 1 - optimalUsageRatio)
      borrowAprAtU = baseVariableBorrowRate + variableRateSlope1 + excess * variableRateSlope2
    }
    const borrowApy = (Math.pow(1 + borrowAprAtU / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100
    const supplyApy =
      (Math.pow(
        1 + (borrowAprAtU * u * (1 - reserveFactor)) / SECONDS_PER_YEAR,
        SECONDS_PER_YEAR,
      ) -
        1) *
      100
    points.push({ utilization: u, supplyApy, borrowApy })
  }
  return points
}
