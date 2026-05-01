/**
 * Morpho Blue GraphQL client — `blue-api.morpho.org/graphql`.
 *
 * Public, no-auth, generous rate limit (we cap each query at ~625 complexity
 * points; the daily limit is 1M). Used for the market detail page when the
 * pool maps to a MetaMorpho vault or a raw Morpho Blue market — the API
 * exposes data DefiLlama doesn't (full IRM curve, vault allocations, fee,
 * curator, accurate utilization history).
 *
 * Architecture conventions:
 *  - One GraphQL POST per page-load, server-side (cache: 'no-store' +
 *    `dynamic = "force-dynamic"` on the page route — same as DefiLlama).
 *  - Two main entry points:
 *      * `loadMorphoVaultByAddress(addr)` — for MetaMorpho vault detail
 *        pages (the bulk of Morpho rows in our markets table).
 *      * `loadMorphoMarketById(uniqueKey)` — for raw Morpho Blue market
 *        detail pages (used when the pool is a market primitive, not a
 *        vault).
 *  - `findMorphoVaultForDefillamaPool(pool)` resolves the DefiLlama-side
 *    `YieldPool` → Morpho vault address. DefiLlama's pool symbol is the
 *    upper-cased vault symbol (`STEAKUSDC` → `steakUSDC` on Morpho), so we
 *    filter by `assetAddress` first then case-insensitive symbol match.
 */
import type { YieldPool } from "./defillama"

const ENDPOINT = "https://blue-api.morpho.org/graphql"
const ETH_CHAIN_ID = 1

// ─────────────────────────────────────────────────────────────────────────
// Public types — a Morpho-native shape. Callers (lib/market-detail.ts)
// translate these into the unified MarketSourcedData.
// ─────────────────────────────────────────────────────────────────────────

export interface MorphoTimeseriesPoint {
  timestamp: number
  value: number
}

export interface MorphoVaultDetail {
  address: string
  symbol: string
  name: string
  asset: {
    address: string
    symbol: string
    decimals: number
    logoURI: string | null
  }
  /** Live state */
  totalAssetsUnderlying: number   // Underlying-token units, decimal-adjusted
  totalAssetsUsd: number
  apy: number                     // Gross APY (0-1)
  netApy: number                  // After fee/rewards (0-1)
  netApyExcludingRewards: number  // After fee, before rewards (0-1)
  fee: number                     // Performance fee (0-1)
  liquidityUsd: number
  /** Allocation across underlying Morpho markets (sums to ~totalAssetsUsd). */
  allocation: MorphoVaultAllocation[]
  /** Vault admin / governance addresses. Used by the Vault Details panel. */
  meta: MorphoVaultMeta
  /** History — daily resolution unless `interval` is overridden upstream. */
  history: {
    totalAssetsUsd: MorphoTimeseriesPoint[]
    apy: MorphoTimeseriesPoint[]
    netApy: MorphoTimeseriesPoint[]
  }
}

export interface MorphoVaultMeta {
  ownerAddress: string | null
  curatorAddress: string | null
  /** First allocator if multiple; null if none. */
  allocatorAddress: string | null
  allocatorCount: number
  guardianAddress: string | null
  feeRecipientAddress: string | null
  /** Timelock duration in seconds (e.g. 604800 = 7 days). */
  timelockSeconds: number | null
  /** MetaMorpho factory contract address — proxy for the vault "version". */
  factoryAddress: string | null
  /** Block when the vault was deployed; useful for "age" displays. */
  creationBlockNumber: number | null
  /** Curator name + image when Morpho's metadata index has it. */
  curatorMetadata: { name: string | null; image: string | null } | null
}

export interface MorphoVaultAllocation {
  marketUniqueKey: string
  marketName: string             // e.g. "WBTC / USDC", or "Idle / USDC"
  collateralSymbol: string | null
  collateralLogoURI: string | null
  loanSymbol: string
  /** LLTV as a 0-1 fraction; null for the Idle bucket. */
  lltv: number | null
  /** Market-level state — useful for the "Market Allocation" table that
   *  Moonwell's vault page shows under the donut. */
  marketSupplyAssetsUsd: number
  marketBorrowAssetsUsd: number
  marketLiquidityAssetsUsd: number
  /** Vault's own supply into this market in USD. */
  vaultSupplyUsd: number
  vaultSharePct: number          // 0-100, what % of the vault is in this market
  marketSupplyApy: number        // 0-1 fraction (caller normalizes if needed)
  marketBorrowApy: number        // 0-1 fraction
  marketUtilization: number      // 0-1 fraction
}

export interface MorphoMarketDetail {
  uniqueKey: string
  collateralAsset: {
    address: string
    symbol: string
    decimals: number
    logoURI: string | null
  } | null
  loanAsset: {
    address: string
    symbol: string
    decimals: number
    logoURI: string | null
  }
  lltv: number                   // 0-1, max LTV before liquidation
  /** Live state */
  supplyAssetsUsd: number
  borrowAssetsUsd: number
  collateralAssetsUsd: number
  liquidityAssetsUsd: number     // Available to borrow (supply - borrow)
  utilization: number            // 0-1
  supplyApy: number              // 0-1
  borrowApy: number              // 0-1
  fee: number                    // Protocol fee on interest (0-1)
  /** Adaptive Curve IRM target params. */
  rateAtTarget: number           // 0-1
  apyAtTarget: number            // 0-1
  /** Sampled IRM curve — list of {utilization, supplyApy, borrowApy} points. */
  currentIrmCurve: Array<{ utilization: number; supplyApy: number; borrowApy: number }>
  /** History — daily resolution. */
  history: {
    supplyAssetsUsd: MorphoTimeseriesPoint[]
    borrowAssetsUsd: MorphoTimeseriesPoint[]
    utilization: MorphoTimeseriesPoint[]
    supplyApy: MorphoTimeseriesPoint[]
    borrowApy: MorphoTimeseriesPoint[]
  }
  /** MetaMorpho vaults that allocate to this market (top by supply). */
  supplyingVaults: Array<{ address: string; name: string; symbol: string; supplyAssetsUsd: number }>
}

// ─────────────────────────────────────────────────────────────────────────
// GraphQL transport
// ─────────────────────────────────────────────────────────────────────────

interface GraphQLResponse<T> {
  data: T
  errors?: Array<{ message: string }>
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Morpho GraphQL ${res.status}: ${await res.text().catch(() => "")}`)
  }
  const json = (await res.json()) as GraphQLResponse<T>
  if (json.errors?.length) {
    throw new Error(`Morpho GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`)
  }
  return json.data
}

// ─────────────────────────────────────────────────────────────────────────
// Time-series helpers — Morpho returns FloatDataPoint / IntDataPoint with
// shape { x: timestamp, y: value }. Use last 90 days at daily resolution.
// ─────────────────────────────────────────────────────────────────────────

interface TimeseriesPointRaw {
  x: number  // unix seconds
  y: number | string | null
}

function tsOptionsLast90d(): { startTimestamp: number; endTimestamp: number; interval: string } {
  const now = Math.floor(Date.now() / 1000)
  return {
    startTimestamp: now - 90 * 86400,
    endTimestamp: now,
    interval: "DAY",
  }
}

function toSeries(raw: TimeseriesPointRaw[] | null | undefined): MorphoTimeseriesPoint[] {
  if (!raw) return []
  return raw
    .map((p) => ({ timestamp: p.x, value: p.y == null ? 0 : Number(p.y) }))
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/** BigInt-string → number, scaled by `decimals`. Morpho returns BigInts for
 *  raw amounts; we usually want a human-readable token quantity. */
function bigIntToNumber(s: string | number | null | undefined, decimals: number): number {
  if (s == null) return 0
  // Use string math to avoid precision loss on values > 2^53.
  const str = String(s)
  if (str === "0") return 0
  if (decimals === 0) return Number(str)
  if (str.length <= decimals) {
    return Number("0." + str.padStart(decimals, "0"))
  }
  const intPart = str.slice(0, str.length - decimals)
  const fracPart = str.slice(str.length - decimals).slice(0, 6) // 6 frac digits is plenty
  return Number(`${intPart}.${fracPart}`)
}

/** Convert Morpho's `lltv` BigInt (1e18-scaled) → 0-1 fraction. */
function lltvToFraction(lltvStr: string): number {
  // 1e18 = 10^18. lltv "860000000000000000" = 0.86
  return bigIntToNumber(lltvStr, 18)
}

// ─────────────────────────────────────────────────────────────────────────
// Vault detail
// ─────────────────────────────────────────────────────────────────────────

const VAULT_DETAIL_QUERY = /* GraphQL */ `
  query VaultDetail($address: String!, $chainId: Int!, $opts: TimeseriesOptions) {
    vaultByAddress(address: $address, chainId: $chainId) {
      address
      symbol
      name
      creatorAddress
      factory {
        address
        creationBlockNumber
      }
      allocators {
        address
      }
      asset {
        address
        symbol
        decimals
        logoURI
      }
      state {
        totalAssets
        totalAssetsUsd
        apy
        netApy
        netApyExcludingRewards
        fee
        curator
        owner
        guardian
        feeRecipient
        timelock
        allocation {
          market {
            uniqueKey
            collateralAsset { symbol logoURI address }
            loanAsset { symbol logoURI address }
            lltv
            state {
              supplyAssetsUsd
              borrowAssetsUsd
              liquidityAssetsUsd
              utilization
              supplyApy
              borrowApy
            }
          }
          supplyAssetsUsd
          supplyAssets
        }
      }
      liquidity {
        usd
      }
      metadata {
        curators { name image }
      }
      historicalState {
        totalAssetsUsd(options: $opts) { x y }
        apy(options: $opts) { x y }
        netApy(options: $opts) { x y }
      }
    }
  }
`

interface VaultDetailRaw {
  vaultByAddress: {
    address: string
    symbol: string
    name: string
    creatorAddress: string | null
    factory: { address: string; creationBlockNumber: number | null } | null
    allocators: Array<{ address: string }>
    asset: {
      address: string
      symbol: string
      decimals: number
      logoURI: string | null
    }
    state: {
      totalAssets: string
      totalAssetsUsd: number
      apy: number
      netApy: number
      netApyExcludingRewards: number
      fee: number
      curator: string | null
      owner: string | null
      guardian: string | null
      feeRecipient: string | null
      timelock: string | null
      allocation: Array<{
        market: {
          uniqueKey: string
          collateralAsset: { symbol: string; logoURI: string | null; address: string } | null
          loanAsset: { symbol: string; logoURI: string | null; address: string }
          lltv: string | null
          state: {
            supplyAssetsUsd: number
            borrowAssetsUsd: number
            liquidityAssetsUsd: number
            utilization: number
            supplyApy: number
            borrowApy: number
          }
        }
        supplyAssetsUsd: number
        supplyAssets: string
      }>
    }
    liquidity: { usd: number } | null
    metadata: { curators: Array<{ name: string | null; image: string | null }> } | null
    historicalState: {
      totalAssetsUsd: TimeseriesPointRaw[]
      apy: TimeseriesPointRaw[]
      netApy: TimeseriesPointRaw[]
    } | null
  } | null
}

export async function loadMorphoVaultByAddress(
  address: string,
): Promise<MorphoVaultDetail | null> {
  const data = await gql<VaultDetailRaw>(VAULT_DETAIL_QUERY, {
    address: address.toLowerCase(),
    chainId: ETH_CHAIN_ID,
    opts: tsOptionsLast90d(),
  }).catch((err) => {
    console.error("[morpho-api] loadMorphoVaultByAddress failed:", err.message)
    return null
  })
  if (!data?.vaultByAddress) return null
  const v = data.vaultByAddress
  const allocation: MorphoVaultAllocation[] = (v.state.allocation ?? [])
    // Keep zero-allocation entries — they're meaningful in the markets table
    // even when the vault hasn't deposited anything yet.
    .map((a) => {
      const collat = a.market.collateralAsset?.symbol ?? null
      const loan = a.market.loanAsset.symbol
      const name = collat ? `${collat} / ${loan}` : `Idle / ${loan}`
      const sharePct = v.state.totalAssetsUsd > 0
        ? (a.supplyAssetsUsd / v.state.totalAssetsUsd) * 100
        : 0
      const lltv = a.market.lltv ? bigIntToNumber(a.market.lltv, 18) : null
      return {
        marketUniqueKey: a.market.uniqueKey,
        marketName: name,
        collateralSymbol: collat,
        collateralLogoURI: a.market.collateralAsset?.logoURI ?? null,
        loanSymbol: loan,
        lltv,
        marketSupplyAssetsUsd: a.market.state.supplyAssetsUsd,
        marketBorrowAssetsUsd: a.market.state.borrowAssetsUsd,
        marketLiquidityAssetsUsd: a.market.state.liquidityAssetsUsd,
        vaultSupplyUsd: a.supplyAssetsUsd,
        vaultSharePct: sharePct,
        marketSupplyApy: a.market.state.supplyApy,
        marketBorrowApy: a.market.state.borrowApy,
        marketUtilization: a.market.state.utilization,
      }
    })
    .sort((a, b) => b.vaultSupplyUsd - a.vaultSupplyUsd)

  const meta: MorphoVaultMeta = {
    ownerAddress: v.state.owner,
    curatorAddress: v.state.curator,
    allocatorAddress: v.allocators?.[0]?.address ?? null,
    allocatorCount: v.allocators?.length ?? 0,
    guardianAddress: v.state.guardian,
    feeRecipientAddress: v.state.feeRecipient,
    timelockSeconds: v.state.timelock != null ? Number(v.state.timelock) : null,
    factoryAddress: v.factory?.address ?? null,
    creationBlockNumber: v.factory?.creationBlockNumber ?? null,
    curatorMetadata: v.metadata?.curators?.[0] ?? null,
  }

  return {
    address: v.address,
    symbol: v.symbol,
    name: v.name,
    asset: v.asset,
    totalAssetsUnderlying: bigIntToNumber(v.state.totalAssets, v.asset.decimals),
    totalAssetsUsd: v.state.totalAssetsUsd,
    apy: v.state.apy,
    netApy: v.state.netApy,
    netApyExcludingRewards: v.state.netApyExcludingRewards,
    fee: v.state.fee,
    liquidityUsd: v.liquidity?.usd ?? 0,
    allocation,
    meta,
    history: {
      totalAssetsUsd: toSeries(v.historicalState?.totalAssetsUsd),
      apy: toSeries(v.historicalState?.apy),
      netApy: toSeries(v.historicalState?.netApy),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Raw Morpho Blue market detail
// ─────────────────────────────────────────────────────────────────────────

const MARKET_DETAIL_QUERY = /* GraphQL */ `
  query MarketDetail($marketId: String!, $chainId: Int!, $opts: TimeseriesOptions) {
    marketById(marketId: $marketId, chainId: $chainId) {
      marketId
      lltv
      collateralAsset { address symbol decimals logoURI }
      loanAsset { address symbol decimals logoURI }
      state {
        supplyAssetsUsd
        borrowAssetsUsd
        collateralAssetsUsd
        liquidityAssetsUsd
        utilization
        supplyApy
        borrowApy
        fee
        rateAtTarget
        apyAtTarget
      }
      currentIrmCurve {
        utilization
        supplyApy
        borrowApy
      }
      historicalState {
        supplyAssetsUsd(options: $opts) { x y }
        borrowAssetsUsd(options: $opts) { x y }
        utilization(options: $opts) { x y }
        supplyApy(options: $opts) { x y }
        borrowApy(options: $opts) { x y }
      }
      supplyingVaults {
        address
        name
        symbol
        state { totalAssetsUsd }
      }
    }
  }
`

interface MarketDetailRaw {
  marketById: {
    marketId: string
    lltv: string
    collateralAsset: { address: string; symbol: string; decimals: number; logoURI: string | null } | null
    loanAsset: { address: string; symbol: string; decimals: number; logoURI: string | null }
    state: {
      supplyAssetsUsd: number
      borrowAssetsUsd: number
      collateralAssetsUsd: number
      liquidityAssetsUsd: number
      utilization: number
      supplyApy: number
      borrowApy: number
      fee: number
      rateAtTarget: string
      apyAtTarget: number
    }
    currentIrmCurve: Array<{ utilization: number; supplyApy: number; borrowApy: number }> | null
    historicalState: {
      supplyAssetsUsd: TimeseriesPointRaw[]
      borrowAssetsUsd: TimeseriesPointRaw[]
      utilization: TimeseriesPointRaw[]
      supplyApy: TimeseriesPointRaw[]
      borrowApy: TimeseriesPointRaw[]
    } | null
    supplyingVaults: Array<{
      address: string
      name: string
      symbol: string
      state: { totalAssetsUsd: number }
    }> | null
  } | null
}

export async function loadMorphoMarketById(
  marketId: string,
): Promise<MorphoMarketDetail | null> {
  const data = await gql<MarketDetailRaw>(MARKET_DETAIL_QUERY, {
    marketId,
    chainId: ETH_CHAIN_ID,
    opts: tsOptionsLast90d(),
  }).catch((err) => {
    console.error("[morpho-api] loadMorphoMarketById failed:", err.message)
    return null
  })
  if (!data?.marketById) return null
  const m = data.marketById
  return {
    uniqueKey: m.marketId,
    collateralAsset: m.collateralAsset,
    loanAsset: m.loanAsset,
    lltv: lltvToFraction(m.lltv),
    supplyAssetsUsd: m.state.supplyAssetsUsd,
    borrowAssetsUsd: m.state.borrowAssetsUsd,
    collateralAssetsUsd: m.state.collateralAssetsUsd,
    liquidityAssetsUsd: m.state.liquidityAssetsUsd,
    utilization: m.state.utilization,
    supplyApy: m.state.supplyApy,
    borrowApy: m.state.borrowApy,
    fee: m.state.fee,
    rateAtTarget: bigIntToNumber(m.state.rateAtTarget, 18),
    apyAtTarget: m.state.apyAtTarget,
    currentIrmCurve: m.currentIrmCurve ?? [],
    history: {
      supplyAssetsUsd: toSeries(m.historicalState?.supplyAssetsUsd),
      borrowAssetsUsd: toSeries(m.historicalState?.borrowAssetsUsd),
      utilization: toSeries(m.historicalState?.utilization),
      supplyApy: toSeries(m.historicalState?.supplyApy),
      borrowApy: toSeries(m.historicalState?.borrowApy),
    },
    supplyingVaults: (m.supplyingVaults ?? [])
      .map((v) => ({
        address: v.address,
        name: v.name,
        symbol: v.symbol,
        supplyAssetsUsd: v.state.totalAssetsUsd,
      }))
      .sort((a, b) => b.supplyAssetsUsd - a.supplyAssetsUsd)
      .slice(0, 10),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Vault activity (deposits + withdrawals) — recent first
// ─────────────────────────────────────────────────────────────────────────

export interface MorphoVaultActivity {
  txHash: string
  timestamp: number
  blockNumber: number
  type: "Deposit" | "Withdraw" | "Transfer"
  /** Underlying-asset amount (decimal-adjusted). Negative for withdrawals. */
  amountToken: number
  /** USD value of amountToken at the time of the transaction (best-effort). */
  amountUsd: number
  /** Wallet that supplied/received funds. For Transfer, this is `from`. */
  walletAddress: string | null
}

const VAULT_ACTIVITY_QUERY = /* GraphQL */ `
  query VaultActivity($vaultAddress: String!, $chainId: Int!, $first: Int!) {
    vaultV1Transactions(
      first: $first
      orderBy: Time
      orderDirection: Desc
      where: { vaultAddress_in: [$vaultAddress], chainId_in: [$chainId] }
    ) {
      items {
        txHash
        timestamp
        blockNumber
        type
        assets
        data {
          ... on VaultV1DepositData { sender onBehalf }
          ... on VaultV1WithdrawData { sender receiver onBehalf }
          ... on VaultV1TransferData { from to }
        }
      }
    }
  }
`

interface VaultActivityRaw {
  vaultV1Transactions: {
    items: Array<{
      txHash: string
      timestamp: string
      blockNumber: string
      type: "Deposit" | "Withdraw" | "Transfer"
      assets: string | null
      data:
        | { sender: string; onBehalf: string; receiver?: string }
        | { from: string; to: string }
        | null
    }>
  }
}

export async function loadMorphoVaultActivity(
  vaultAddress: string,
  /** Underlying-asset decimals — needed to convert BigInt assets → human number. */
  assetDecimals: number,
  /** Live underlying price for USD conversion. Best-effort; if 0/null, USD = 0. */
  priceUsd: number,
  first = 10,
): Promise<MorphoVaultActivity[]> {
  const data = await gql<VaultActivityRaw>(VAULT_ACTIVITY_QUERY, {
    vaultAddress: vaultAddress.toLowerCase(),
    chainId: ETH_CHAIN_ID,
    first,
  }).catch((err) => {
    console.error("[morpho-api] loadMorphoVaultActivity failed:", err.message)
    return null
  })
  if (!data?.vaultV1Transactions?.items) return []
  return data.vaultV1Transactions.items.map((row) => {
    const amount = bigIntToNumber(row.assets, assetDecimals)
    let walletAddress: string | null = null
    if (row.data && "onBehalf" in row.data && row.data.onBehalf) {
      walletAddress = row.data.onBehalf
    } else if (row.data && "from" in row.data) {
      walletAddress = row.data.from
    } else if (row.data && "sender" in row.data) {
      walletAddress = row.data.sender
    }
    return {
      txHash: row.txHash,
      timestamp: Number(row.timestamp),
      blockNumber: Number(row.blockNumber),
      type: row.type,
      // For withdrawals we keep `amount` positive in token units; the UI
      // styles withdrawals red. Negative would over-encode the meaning.
      amountToken: amount,
      amountUsd: amount * priceUsd,
      walletAddress,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Liquidation events on the vault's underlying markets — recent first
// ─────────────────────────────────────────────────────────────────────────

export interface MorphoMarketLiquidation {
  txHash: string
  timestamp: number
  marketUniqueKey: string
  collateralSymbol: string | null
  collateralLogoURI: string | null
  loanSymbol: string
  /** Loan asset repaid (token units, decimal-adjusted). */
  repaidAssets: number
  repaidAssetsUsd: number
  /** Collateral seized (token units of collateral asset). */
  seizedAssets: number
  seizedAssetsUsd: number
  /** Bad debt left behind, if any. */
  badDebtAssetsUsd: number
  liquidator: string | null
}

const LIQUIDATIONS_QUERY = /* GraphQL */ `
  query VaultLiquidations($marketIds: [String!]!, $chainId: Int!, $first: Int!) {
    marketTransactions(
      first: $first
      orderBy: Timestamp
      orderDirection: Desc
      where: {
        marketUniqueKey_in: $marketIds
        type_in: [Liquidation]
        chainId_in: [$chainId]
      }
    ) {
      items {
        txHash
        timestamp
        market {
          uniqueKey
          collateralAsset { symbol logoURI decimals price { usd } }
          loanAsset { symbol decimals price { usd } }
        }
        data {
          ... on MarketTransactionLiquidationData {
            repaidAssets
            seizedAssets
            badDebtAssets
            liquidator
          }
        }
      }
    }
  }
`

interface LiquidationsRaw {
  marketTransactions: {
    items: Array<{
      txHash: string
      timestamp: string
      market: {
        uniqueKey: string
        collateralAsset:
          | { symbol: string; logoURI: string | null; decimals: number; price: { usd: number | null } | null }
          | null
        loanAsset: {
          symbol: string
          decimals: number
          price: { usd: number | null } | null
        }
      }
      data:
        | {
            repaidAssets: string | null
            seizedAssets: string | null
            badDebtAssets: string | null
            liquidator: string | null
          }
        | null
    }>
  }
}

export async function loadMorphoMarketLiquidations(
  marketUniqueKeys: string[],
  first = 10,
): Promise<MorphoMarketLiquidation[]> {
  if (marketUniqueKeys.length === 0) return []
  const data = await gql<LiquidationsRaw>(LIQUIDATIONS_QUERY, {
    marketIds: marketUniqueKeys,
    chainId: ETH_CHAIN_ID,
    first,
  }).catch((err) => {
    console.error("[morpho-api] loadMorphoMarketLiquidations failed:", err.message)
    return null
  })
  if (!data?.marketTransactions?.items) return []
  return data.marketTransactions.items
    .filter((row) => row.data != null)
    .map((row) => {
      const d = row.data!
      const collatDecimals = row.market.collateralAsset?.decimals ?? 18
      const loanDecimals = row.market.loanAsset.decimals
      const loanPrice = row.market.loanAsset.price?.usd ?? 0
      const collatPrice = row.market.collateralAsset?.price?.usd ?? 0
      // Liquidation USD values are computed from the latest asset price —
      // approximate (intra-day price moves not captured) but better than
      // missing. Better than DefiLlama's pipeline which omits this entirely.
      const repaidAssets = bigIntToNumber(d.repaidAssets, loanDecimals)
      const seizedAssets = bigIntToNumber(d.seizedAssets, collatDecimals)
      const badDebtAssets = bigIntToNumber(d.badDebtAssets, loanDecimals)
      return {
        txHash: row.txHash,
        timestamp: Number(row.timestamp),
        marketUniqueKey: row.market.uniqueKey,
        collateralSymbol: row.market.collateralAsset?.symbol ?? null,
        collateralLogoURI: row.market.collateralAsset?.logoURI ?? null,
        loanSymbol: row.market.loanAsset.symbol,
        repaidAssets,
        repaidAssetsUsd: repaidAssets * loanPrice,
        seizedAssets,
        seizedAssetsUsd: seizedAssets * collatPrice,
        badDebtAssetsUsd: badDebtAssets * loanPrice,
        liquidator: d.liquidator,
      }
    })
}

// ─────────────────────────────────────────────────────────────────────────
// Top depositors — biggest holders of vault shares
// ─────────────────────────────────────────────────────────────────────────

export interface MorphoVaultDepositor {
  walletAddress: string
  assetsUsd: number
  /** Underlying-token quantity of the position. */
  assetsToken: number
}

const TOP_DEPOSITORS_QUERY = /* GraphQL */ `
  query TopDepositors($vaultAddress: String!, $chainId: Int!, $first: Int!) {
    vaultPositions(
      first: $first
      orderBy: Shares
      orderDirection: Desc
      where: { vaultAddress_in: [$vaultAddress], chainId_in: [$chainId] }
    ) {
      items {
        user { address }
        state { assets assetsUsd shares }
      }
    }
  }
`

interface TopDepositorsRaw {
  vaultPositions: {
    items: Array<{
      user: { address: string }
      state: { assets: string | null; assetsUsd: number | null; shares: string | null } | null
    }>
  }
}

export async function loadMorphoVaultTopDepositors(
  vaultAddress: string,
  assetDecimals: number,
  first = 10,
): Promise<MorphoVaultDepositor[]> {
  const data = await gql<TopDepositorsRaw>(TOP_DEPOSITORS_QUERY, {
    vaultAddress: vaultAddress.toLowerCase(),
    chainId: ETH_CHAIN_ID,
    first,
  }).catch((err) => {
    console.error("[morpho-api] loadMorphoVaultTopDepositors failed:", err.message)
    return null
  })
  if (!data?.vaultPositions?.items) return []
  return data.vaultPositions.items
    .filter((p) => p.state != null && (p.state.assetsUsd ?? 0) > 0)
    .map((p) => ({
      walletAddress: p.user.address,
      assetsUsd: p.state!.assetsUsd ?? 0,
      assetsToken: bigIntToNumber(p.state!.assets, assetDecimals),
    }))
}

// ─────────────────────────────────────────────────────────────────────────
// DefiLlama → Morpho vault resolution
//
// DefiLlama's pool object for a MetaMorpho vault has:
//   - symbol: uppercased vault symbol (e.g. "STEAKUSDC", "SENPYUSD")
//   - underlyingTokens[0]: the underlying asset address (USDC / PYUSD / etc.)
//   - apyBase: the vault's net APY (set, ~ non-null)
//
// Strategy: filter Morpho's vaults by `assetAddress_in: [underlyingToken]`
// and pick the one whose symbol case-insensitively matches DefiLlama's
// symbol. Falls back to the largest TVL match for that asset.
// ─────────────────────────────────────────────────────────────────────────

const VAULT_LOOKUP_QUERY = /* GraphQL */ `
  query VaultLookup($assetAddress: String!, $chainId: Int!) {
    vaults(
      first: 50
      where: { chainId_in: [$chainId], assetAddress_in: [$assetAddress] }
      orderBy: TotalAssetsUsd
      orderDirection: Desc
    ) {
      items {
        address
        symbol
        name
        state { totalAssetsUsd }
      }
    }
  }
`

interface VaultLookupRaw {
  vaults: {
    items: Array<{
      address: string
      symbol: string
      name: string
      state: { totalAssetsUsd: number }
    }>
  }
}

export async function findMorphoVaultForDefillamaPool(
  pool: YieldPool,
): Promise<{ address: string; symbol: string; name: string } | null> {
  const assetAddress = pool.underlyingTokens?.[0]
  if (!assetAddress) return null
  const data = await gql<VaultLookupRaw>(VAULT_LOOKUP_QUERY, {
    assetAddress: assetAddress.toLowerCase(),
    chainId: ETH_CHAIN_ID,
  }).catch((err) => {
    console.error("[morpho-api] findMorphoVaultForDefillamaPool failed:", err.message)
    return null
  })
  const items = data?.vaults?.items ?? []
  if (items.length === 0) return null
  // Prefer symbol-match (case insensitive), else fall back to largest TVL.
  const targetSym = pool.symbol.toUpperCase()
  const match = items.find((v) => v.symbol.toUpperCase() === targetSym)
  const chosen = match ?? items[0]
  return { address: chosen.address, symbol: chosen.symbol, name: chosen.name }
}

// ─────────────────────────────────────────────────────────────────────────
// Curator leaderboard
//
// Aggregates total assets across every Ethereum-mainnet MetaMorpho vault by
// curator. Used on the Morpho protocol page (`/protocols?p=morpho-blue`) to
// surface who's running the largest pools of capital. The Morpho metadata
// index keys vaults to a curator name + logo, so we group by name.
// ─────────────────────────────────────────────────────────────────────────

const CURATOR_LEADERBOARD_QUERY = /* GraphQL */ `
  query CuratorLeaderboard($chainId: Int!, $first: Int!, $skip: Int!) {
    vaults(
      first: $first
      skip: $skip
      where: { chainId_in: [$chainId] }
      orderBy: TotalAssetsUsd
      orderDirection: Desc
    ) {
      items {
        address
        name
        symbol
        state {
          totalAssetsUsd
          netApy
        }
        metadata {
          curators { name image }
        }
        asset { symbol }
      }
      pageInfo { count countTotal }
    }
  }
`

interface CuratorLeaderboardRaw {
  vaults: {
    items: Array<{
      address: string
      name: string
      symbol: string
      state: { totalAssetsUsd: number | null; netApy: number | null } | null
      metadata: { curators: Array<{ name: string | null; image: string | null }> | null } | null
      asset: { symbol: string }
    }>
    pageInfo: { count: number; countTotal: number }
  }
}

/** One row in the curator leaderboard — TVL summed across all the vaults a
 *  given curator runs, plus a net-APY weighted by vault TVL. */
export interface CuratorLeaderboardRow {
  /** Display name. We group by lowercased name; this is the first-seen casing. */
  name: string
  /** Curator logo URL when Morpho's metadata index has it. */
  imageUrl: string | null
  /** Number of vaults this curator runs (with non-zero TVL). */
  vaultCount: number
  /** Sum of `totalAssetsUsd` across this curator's vaults. */
  totalAssetsUsd: number
  /** TVL-weighted average of `netApy` across this curator's vaults, in PERCENT. */
  weightedNetApyPct: number | null
  /** Asset diversity — count of unique underlying assets across this curator's vaults. */
  uniqueAssets: number
  /** Largest single vault under this curator (for the row's hover detail). */
  topVault: { name: string; symbol: string; totalAssetsUsd: number } | null
}

/** Fetch every Ethereum MetaMorpho vault, group by curator, return ranked
 *  leaderboard. Vaults without a curator name (uncurated, factory-default)
 *  are bucketed under "Uncurated". Excludes vaults with $0 TVL.
 *
 *  Pages through Morpho's `vaults` query — they cap `first` at ~100 per call,
 *  so we paginate until we've drained the list. There are typically 200-600
 *  active Ethereum vaults so 2-7 calls. */
/** Module-level cache of the paginated MetaMorpho vault list. The curator
 *  leaderboard and the vault index both build off the same data; sharing a
 *  cache avoids hitting Morpho's API twice per page render. 5-min TTL. */
const RAW_VAULTS_TTL_MS = 5 * 60_000
let rawVaultsCache: {
  value: CuratorLeaderboardRaw["vaults"]["items"]
  fetchedAt: number
} | null = null

async function fetchAllMetaMorphoVaultsRaw(): Promise<
  CuratorLeaderboardRaw["vaults"]["items"]
> {
  if (rawVaultsCache && Date.now() - rawVaultsCache.fetchedAt < RAW_VAULTS_TTL_MS) {
    return rawVaultsCache.value
  }
  const PAGE_SIZE = 100
  const MAX_PAGES = 10  // Hard ceiling — Morpho is well under 1k vaults today.
  const all: CuratorLeaderboardRaw["vaults"]["items"] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await gql<CuratorLeaderboardRaw>(CURATOR_LEADERBOARD_QUERY, {
      chainId: ETH_CHAIN_ID,
      first: PAGE_SIZE,
      skip: page * PAGE_SIZE,
    })
    const items = data.vaults.items
    all.push(...items)
    if (items.length < PAGE_SIZE) break
  }
  rawVaultsCache = { value: all, fetchedAt: Date.now() }
  return all
}

/** symbol-keyed (uppercase) lookup for vault display name + curator. Used
 *  by the protocols page to enrich the Vaults table with human-readable
 *  names like "Steakhouse USDC" instead of bare DefiLlama symbols like
 *  STEAKUSDC. */
export interface MorphoVaultIndexEntry {
  address: string
  name: string
  symbol: string
  curatorName: string | null
  totalAssetsUsd: number
}

export async function loadMorphoVaultIndex(): Promise<
  Map<string, MorphoVaultIndexEntry>
> {
  const all = await fetchAllMetaMorphoVaultsRaw()
  const out = new Map<string, MorphoVaultIndexEntry>()
  for (const v of all) {
    if (!v.symbol) continue
    const tvl = v.state?.totalAssetsUsd ?? 0
    const primary = v.metadata?.curators?.[0] ?? null
    out.set(v.symbol.toUpperCase(), {
      address: v.address,
      name: v.name,
      symbol: v.symbol,
      curatorName: primary?.name?.trim() || null,
      totalAssetsUsd: tvl,
    })
  }
  return out
}

export async function loadMorphoCuratorLeaderboard(): Promise<CuratorLeaderboardRow[]> {
  const all = await fetchAllMetaMorphoVaultsRaw()

  // Group by curator name (case-insensitive). Vaults without a curator land
  // under "Uncurated".
  interface Acc {
    name: string
    imageUrl: string | null
    vaults: Array<{
      name: string
      symbol: string
      assetSymbol: string
      totalAssetsUsd: number
      netApy: number | null
    }>
  }
  const byCurator = new Map<string, Acc>()

  for (const v of all) {
    const tvl = v.state?.totalAssetsUsd ?? 0
    if (tvl <= 0) continue  // Skip empty vaults — they don't count for ranking.
    const curators = v.metadata?.curators ?? null
    const primary = curators && curators.length > 0 ? curators[0] : null
    const displayName = primary?.name?.trim() || "Uncurated"
    const key = displayName.toLowerCase()
    const acc =
      byCurator.get(key) ??
      ({ name: displayName, imageUrl: primary?.image ?? null, vaults: [] } as Acc)
    if (!acc.imageUrl && primary?.image) acc.imageUrl = primary.image
    acc.vaults.push({
      name: v.name,
      symbol: v.symbol,
      assetSymbol: v.asset.symbol,
      totalAssetsUsd: tvl,
      netApy: v.state?.netApy ?? null,
    })
    byCurator.set(key, acc)
  }

  const rows: CuratorLeaderboardRow[] = []
  for (const acc of byCurator.values()) {
    const totalAssetsUsd = acc.vaults.reduce((s, v) => s + v.totalAssetsUsd, 0)
    // TVL-weighted net APY. Morpho returns netApy as 0-1 fraction; convert to %.
    let weightedNum = 0
    let weightedDenom = 0
    for (const v of acc.vaults) {
      if (v.netApy != null && Number.isFinite(v.netApy)) {
        weightedNum += v.netApy * v.totalAssetsUsd
        weightedDenom += v.totalAssetsUsd
      }
    }
    const weightedNetApyPct =
      weightedDenom > 0 ? (weightedNum / weightedDenom) * 100 : null
    const topVault = acc.vaults
      .slice()
      .sort((a, b) => b.totalAssetsUsd - a.totalAssetsUsd)[0] ?? null
    const uniqueAssets = new Set(acc.vaults.map((v) => v.assetSymbol.toUpperCase())).size
    rows.push({
      name: acc.name,
      imageUrl: acc.imageUrl,
      vaultCount: acc.vaults.length,
      totalAssetsUsd,
      weightedNetApyPct,
      uniqueAssets,
      topVault: topVault
        ? {
            name: topVault.name,
            symbol: topVault.symbol,
            totalAssetsUsd: topVault.totalAssetsUsd,
          }
        : null,
    })
  }

  rows.sort((a, b) => b.totalAssetsUsd - a.totalAssetsUsd)
  return rows
}

// ─────────────────────────────────────────────────────────────────────────
// Markets list — the underlying isolated markets, separate from the
// MetaMorpho vault aggregators. Powers the Morpho protocol page's
// "Markets" table (the 545-market story).
// ─────────────────────────────────────────────────────────────────────────

const MARKETS_LIST_QUERY = /* GraphQL */ `
  query MarketsList($chainId: Int!, $first: Int!) {
    markets(
      first: $first
      where: { chainId_in: [$chainId] }
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
    ) {
      items {
        uniqueKey
        lltv
        collateralAsset { symbol address logoURI }
        loanAsset { symbol address logoURI }
        state {
          supplyAssetsUsd
          borrowAssetsUsd
          liquidityAssetsUsd
          utilization
          supplyApy
          borrowApy
        }
      }
    }
  }
`

interface MarketsListRaw {
  markets: {
    items: Array<{
      uniqueKey: string
      lltv: string
      collateralAsset: { symbol: string; address: string; logoURI: string | null } | null
      loanAsset: { symbol: string; address: string; logoURI: string | null }
      state: {
        supplyAssetsUsd: number
        borrowAssetsUsd: number
        liquidityAssetsUsd: number
        utilization: number
        supplyApy: number
        borrowApy: number
      } | null
    }>
  }
}

/** Flat shape consumed by the Morpho Markets table on the protocols page. */
export interface MorphoMarketRow {
  uniqueKey: string
  collateralSymbol: string
  loanSymbol: string
  /** LLTV 0-1 fraction. */
  lltv: number
  supplyUsd: number
  borrowUsd: number
  liquidityUsd: number
  /** 0-100 fraction. */
  utilizationPct: number
  /** Already in percent (0-100). */
  supplyApy: number
  borrowApy: number
}

/** Top N Ethereum-mainnet Morpho-Blue markets by supply USD. The full
 *  universe is ~545; the page caps at 50 by default to keep the table
 *  readable. Excludes empty markets (supplyAssetsUsd <= 0). */
export async function loadMorphoMarketsList(
  topN = 50,
): Promise<MorphoMarketRow[]> {
  const data = await gql<MarketsListRaw>(MARKETS_LIST_QUERY, {
    chainId: ETH_CHAIN_ID,
    first: Math.min(topN * 2, 200), // overfetch a bit so we can drop empties
  }).catch((err) => {
    console.error("[morpho-api] loadMorphoMarketsList failed:", err?.message ?? err)
    return null
  })
  if (!data) return []
  const rows: MorphoMarketRow[] = []
  for (const m of data.markets.items) {
    const s = m.state
    if (!s || (s.supplyAssetsUsd ?? 0) <= 0) continue
    rows.push({
      uniqueKey: m.uniqueKey,
      collateralSymbol: m.collateralAsset?.symbol ?? "—",
      loanSymbol: m.loanAsset.symbol,
      lltv: lltvToFraction(m.lltv),
      supplyUsd: s.supplyAssetsUsd,
      borrowUsd: s.borrowAssetsUsd ?? 0,
      liquidityUsd: s.liquidityAssetsUsd ?? 0,
      // Morpho returns utilization + APYs as 0-1 fractions; convert to %.
      utilizationPct: (s.utilization ?? 0) * 100,
      supplyApy: (s.supplyApy ?? 0) * 100,
      borrowApy: (s.borrowApy ?? 0) * 100,
    })
    if (rows.length >= topN) break
  }
  return rows
}

