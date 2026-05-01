/**
 * Per-market detail for `/markets/[poolId]`.
 *
 * Per-protocol dispatcher: each protocol can be enriched by its native data
 * source while DefiLlama provides the universe-wide snapshot we use for
 * routing + cross-protocol siblings.
 *
 *  - **Morpho** → `lib/morpho-api.ts` (blue-api.morpho.org GraphQL).
 *    Gives us full IRM curve, vault allocation breakdown, daily history of
 *    supply/borrow USD + APYs + utilization, fee, curator, real liquidity.
 *  - **Aave V3 / Spark / Fluid** → still DefiLlama snapshot + our
 *    `rate_snapshots` Neon table (10 major assets only). Each gets its own
 *    SDK integration in subsequent sessions.
 *
 * The shape returned (`MarketDetail`) is unified across sources — the UI
 * doesn't know which provider filled it in. Optional fields like
 * `reservesUsd`, `irmCurve`, `vaultAllocation`, etc. are populated when the
 * source supports them and `null` otherwise. `dataSources` reports who
 * provided what so the UI can show provenance.
 */
import {
  fetchAllYieldPools,
  fetchProtocolHistory,
  fetchYieldChart,
  type YieldPool,
  type YieldChartPoint,
} from "./defillama"
import { PROTOCOL_BY_SLUG, type ProtocolConfig } from "./protocols"
import { YIELDS_PROJECT_BY_PROTOCOL } from "./rates"
import { classifyAsset, type AssetType } from "./assets"
import {
  capUtilizationHistory,
  deriveBorrowApyHistory,
  totalSupplyAndBorrowHistoryForAsset,
  utilizationHistoryForAsset,
} from "./derived-rates"
import {
  findMorphoVaultForDefillamaPool,
  loadMorphoVaultByAddress,
  loadMorphoVaultActivity,
  loadMorphoMarketLiquidations,
  loadMorphoVaultTopDepositors,
  type MorphoVaultDetail,
  type MorphoVaultActivity,
  type MorphoMarketLiquidation,
  type MorphoVaultDepositor,
} from "./morpho-api"
import {
  findAaveReserveByUnderlying,
  sampleAaveIrmCurve,
  type AaveReserveLive,
} from "./aave-onchain"
import { findSparkReserveByUnderlying } from "./spark-onchain"
import { findFluidVaultForPair, type FluidVaultLive } from "./fluid-onchain"

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export interface DataSourceProvenance {
  /** Provider for live state (TVL, APYs, utilization). */
  state: "morpho" | "aave" | "spark" | "fluid" | "defillama"
  /** Provider for time-series history. */
  history: "morpho" | "aave" | "spark" | "fluid" | "rate-snapshots" | "defillama" | "none"
  /** Whether we have an IRM curve to render (Morpho gives full curve, others not yet). */
  irm: "morpho" | "aave" | "spark" | "fluid" | "none"
  /** Whether we have a composition / allocation breakdown. */
  composition: "morpho-vault" | "morpho-market" | "aave" | "spark" | "fluid" | "none"
}

export interface MarketDetail {
  // ─── Identity ──────────────────────────────────────────
  poolId: string
  asset: string
  /** E-mode tag, vault curator, debt pair, etc. */
  subLabel: string | null
  assetType: AssetType
  protocolSlug: string
  protocolName: string
  protocolColor: string
  protocolArchitecture: ProtocolConfig["architecture"]
  protocolWebsite: string
  chain: string
  defillamaProject: string
  /** The actual underlying token symbol. For Morpho vaults this differs from
   *  `asset` (which is the vault ticker, e.g. `STEAKUSDC`) — it's the asset
   *  the vault accepts deposits in (e.g. `USDC`). For all other protocols it
   *  equals `asset`. Used by activity/liquidation labels and sibling lookup. */
  underlyingAssetSymbol: string

  // ─── Live snapshot ─────────────────────────────────────
  tvlUsd: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  availableLiquidityUsd: number
  /** Token quantities (when source supports them — Morpho yes, DefiLlama no). */
  totalSupplyToken: number | null
  totalBorrowToken: number | null
  availableLiquidityToken: number | null
  underlyingPriceUsd: number | null
  underlyingDecimals: number | null
  /** Reserves (supply-side fee accrual): Morpho exposes via `fee`-derived
   *  computation; Aave needs on-chain reads. Null when unavailable. */
  reservesUsd: number | null
  reservesToken: number | null

  // ─── Rates & utilization ───────────────────────────────
  utilizationPct: number | null
  supplyApy: number | null
  supplyApyReward: number | null
  borrowApy: number | null
  borrowApyReward: number | null
  /** After-fee, after-rewards APY. Morpho exposes; for others = supplyApy. */
  netSupplyApy: number | null
  apyMean30d: number | null
  apyBaseInception: number | null
  hasRewards: boolean

  // ─── Risk parameters ───────────────────────────────────
  /** LTV / Loan-to-Value (or LLTV for isolated). 0-1 fraction. */
  ltv: number | null
  /** Liquidation threshold (Aave-style, 0-1). For Morpho, equal to LLTV. */
  liquidationThreshold: number | null
  /** Reserve factor — % of borrow interest taken by the protocol. 0-1. */
  reserveFactor: number | null
  /** Performance fee on a vault's APY. 0-1. */
  fee: number | null

  // ─── Caps (Aave/Spark concept; null for Morpho vaults) ──
  supplyCapUsd: number | null
  supplyCapToken: number | null
  borrowCapUsd: number | null
  borrowCapToken: number | null

  // ─── IRM curve (Morpho exposes; others null until SDK lands) ──
  irmCurve: Array<{ utilization: number; supplyApy: number; borrowApy: number }> | null
  /** The "kink" utilization (0-1) where the IRM slope steepens. Marked on
   *  the curve as a vertical reference line. Null when no IRM is available. */
  irmKink: number | null

  // ─── History (daily, last ~90d when source allows) ─────
  tvlHistory: Array<{ timestamp: number; value: number }>
  supplyUsdHistory: Array<{ timestamp: number; value: number }>
  borrowUsdHistory: Array<{ timestamp: number; value: number }>
  supplyApyHistory: Array<{ timestamp: number; value: number }>
  borrowApyHistory: Array<{ timestamp: number; value: number }>
  utilizationHistory: Array<{ timestamp: number; value: number }>
  /** True if we have any borrow-side history at all. */
  hasBorrowHistory: boolean
  /** Supply cap utilization over time as PERCENT (totalSupplyUsd ÷ supplyCapUsd × 100).
   *  Empty when no on-chain cap data is available for this protocol/pool. */
  supplyCapUtilHistory: Array<{ timestamp: number; value: number }>
  /** Borrow cap utilization over time as PERCENT.
   *  Empty when no on-chain cap data is available. */
  borrowCapUtilHistory: Array<{ timestamp: number; value: number }>

  // ─── Composition / allocation ──────────────────────────
  /** For Morpho vaults: how the vault deploys deposits across underlying markets. */
  vaultAllocation: VaultAllocationRow[] | null
  /** For raw Morpho markets: top vaults supplying into this market. */
  supplyingVaults: SupplyingVaultRow[] | null

  // ─── Vault-specific extras (Morpho only) ───────────────
  /** 24h change in total deposits (USD). Null when history < 2 points. */
  totalSupply24hChangeUsd: number | null
  /** Unique collateral assets the vault deposits against ("Exposure" pills). */
  exposureSymbols: string[] | null
  /** Vault admin/governance addresses for the Vault Details panel. */
  vaultMeta: VaultMetaInfo | null

  // ─── Fluid-specific extras ──────────────────────────────
  /** Fluid vault structural info — collateral/loan pair, smart-vault flags,
   *  vault ID and type. Null for non-Fluid pools. */
  fluidVaultInfo: FluidVaultInfo | null
  /** Most-recent ~10 deposits + withdrawals on this vault. Null for non-vaults. */
  vaultActivity: MorphoVaultActivity[] | null
  /** Most-recent ~10 liquidations across this vault's allocated markets. */
  vaultLiquidations: MorphoMarketLiquidation[] | null
  /** Top ~10 depositors by share. */
  vaultTopDepositors: VaultTopDepositor[] | null

  // ─── Cross-protocol siblings (always from DefiLlama snapshot) ──
  siblings: MarketSibling[]
  /** Daily supply APY history per protocol slug (current market + every
   *  sibling) over the last ~90 days. Powers the cross-protocol rate
   *  history chart on the market detail page. Populated by
   *  `enrichWithCrossProtocolHistory` at the end of `loadMarketDetail`;
   *  the upstream per-protocol builders leave this off and the enricher
   *  fills it in. */
  crossProtocolSupplyApyHistory?: Record<string, Array<{ timestamp: number; value: number }>>

  // ─── Provenance ────────────────────────────────────────
  dataSources: DataSourceProvenance
}

export interface VaultAllocationRow {
  marketUniqueKey: string
  marketLabel: string         // "WBTC / USDC" or "Idle / USDC"
  collateralSymbol: string | null
  collateralLogoURI: string | null
  loanSymbol: string
  /** LLTV as 0-1 fraction; null for the Idle bucket. */
  lltv: number | null
  vaultSupplyUsd: number      // Vault's deposit into this market
  sharePct: number            // 0-100, % of the vault sitting in this market
  /** Per-market live state for the "Market Allocation" table. */
  marketSupplyAssetsUsd: number
  marketBorrowAssetsUsd: number
  marketLiquidityAssetsUsd: number
  marketSupplyApy: number | null    // Already in percent
  marketBorrowApy: number | null    // Already in percent
  marketUtilization: number | null  // 0-1 fraction
}

/** Fluid-specific structural info — surfaced on the Fluid layout to convey
 *  the collateral→loan pairing, smart-vault status, and vault identity. */
export interface FluidVaultInfo {
  vaultAddress: string
  vaultId: number
  vaultType: number
  isSmartCol: boolean
  isSmartDebt: boolean
  /** The on-chain Liquidity Layer address (shared across all Fluid vaults). */
  liquidityLayer: string | null
  /** Display labels — addresses are kept too for Etherscan links. */
  collateralAssetSymbol: string
  collateralAssetAddress: string
  loanAssetSymbol: string
  loanAssetAddress: string
  /** Liquidation penalty (= liquidator bonus on Aave) as 0-1 fraction. */
  liquidationPenalty: number
}

/** Top-depositor row, with the row's USD value + share-of-vault. */
export interface VaultTopDepositor {
  walletAddress: string
  assetsUsd: number
  assetsToken: number
  /** 0-100 share of the vault's total assets. */
  sharePct: number
}

/** Admin / governance metadata for a Morpho vault (fills the Vault Details panel). */
export interface VaultMetaInfo {
  vaultAddress: string
  ownerAddress: string | null
  curatorAddress: string | null
  curatorName: string | null
  allocatorAddress: string | null
  allocatorCount: number
  guardianAddress: string | null
  feeRecipientAddress: string | null
  /** Performance fee 0-1 fraction. */
  performanceFee: number
  /** Timelock duration in seconds. */
  timelockSeconds: number | null
  /** Factory address — proxy for "MetaMorpho V1" / "V1.1" detection. */
  factoryAddress: string | null
  versionLabel: string
}

export interface SupplyingVaultRow {
  address: string
  symbol: string
  name: string
  supplyAssetsUsd: number
}

export interface MarketSibling {
  poolId: string
  protocolSlug: string
  protocolName: string
  protocolColor: string
  asset: string
  subLabel: string | null
  totalSupplyUsd: number
  totalBorrowUsd: number
  utilizationPct: number | null
  supplyApy: number | null
  borrowApy: number | null
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────

function totalSupplyOf(p: YieldPool): number {
  if (p.totalSupplyUsd != null && p.totalSupplyUsd > 0) return p.totalSupplyUsd
  return (p.tvlUsd ?? 0) + (p.totalBorrowUsd ?? 0)
}

function ourSlugForProject(project: string): string | null {
  for (const [slug, projects] of Object.entries(YIELDS_PROJECT_BY_PROTOCOL)) {
    if (projects.includes(project)) return slug
  }
  return null
}

function subLabelFor(p: YieldPool, arch: ProtocolConfig["architecture"]): string | null {
  if (arch === "isolated") {
    const upper = p.symbol.toUpperCase()
    const suffixes = ["USDC", "USDT", "DAI", "PYUSD", "USDS", "GHO", "WETH", "ETH", "WBTC", "CBBTC", "WSTETH", "USDE"]
    for (const s of suffixes) {
      if (upper.endsWith(s)) {
        const prefix = upper.slice(0, upper.length - s.length)
        if (!prefix) continue
        return `${prefix} · ${s}`
      }
    }
  }
  return p.poolMeta && p.poolMeta.length > 0 ? p.poolMeta : null
}

function chartToSeries(
  chart: YieldChartPoint[],
  field: "tvlUsd" | "apyBase",
): Array<{ timestamp: number; value: number }> {
  return chart
    .filter((p) => p[field] != null && Number.isFinite(p[field] as number))
    .map((p) => ({ timestamp: p.timestamp, value: p[field] as number }))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/** Build the cross-protocol siblings list from the DefiLlama snapshot universe.
 *
 *  `matchSymbol` is what we compare against sibling pool symbols. For most
 *  protocols this is the pool's own symbol. For Morpho VAULTS this is the
 *  vault's UNDERLYING asset symbol (passed in by the Morpho path) — that
 *  way `steakUSDC` matches against Aave's USDC, Spark's USDC, and Fluid's
 *  USDC, instead of returning zero siblings.
 */
function buildSiblings(
  pool: YieldPool,
  protocolSlug: string,
  allPools: YieldPool[],
  matchSymbol?: string,
): MarketSibling[] {
  const target = (matchSymbol ?? pool.symbol).toUpperCase()
  const siblings: MarketSibling[] = []
  const seenProtocols = new Set<string>([protocolSlug])
  const candidates = allPools
    .filter((p) => p.chain === pool.chain && p.symbol.toUpperCase() === target && p.pool !== pool.pool)
    .map((p) => ({ p, slug: ourSlugForProject(p.project), supply: totalSupplyOf(p) }))
    .filter((x): x is { p: YieldPool; slug: string; supply: number } => !!x.slug && x.supply > 0)
    .sort((a, b) => b.supply - a.supply)
  for (const { p, slug, supply } of candidates) {
    if (seenProtocols.has(slug)) continue
    seenProtocols.add(slug)
    const siblingCfg = PROTOCOL_BY_SLUG[slug]
    if (!siblingCfg) continue

    // Morpho is per-market by design — the same loan asset can appear in
    // many vaults / markets. Showing a single Morpho row was misleading
    // ($4.4M for a vault when the aggregate WETH exposure is much
    // larger). Aggregate across every Morpho candidate matching this
    // symbol so the sibling row reads as total Morpho exposure.
    if (slug === "morpho-blue") {
      const morphoMatches = candidates.filter((c) => c.slug === "morpho-blue")
      const totalSupply = morphoMatches.reduce((s, m) => s + m.supply, 0)
      const totalBorrow = morphoMatches.reduce(
        (s, m) => s + (m.p.totalBorrowUsd ?? 0),
        0,
      )
      // TVL-weighted APYs across the matching vaults so the sibling row
      // surfaces a representative blended yield.
      const denom = morphoMatches.reduce(
        (s, m) => s + (m.p.apyBase != null ? m.supply : 0),
        0,
      )
      const supplyApyBlend =
        denom > 0
          ? morphoMatches.reduce(
              (s, m) => s + (m.p.apyBase ?? 0) * (m.p.apyBase != null ? m.supply : 0),
              0,
            ) / denom
          : null
      const borrowDenom = morphoMatches.reduce(
        (s, m) => s + (m.p.apyBaseBorrow != null ? m.supply : 0),
        0,
      )
      const borrowApyBlend =
        borrowDenom > 0
          ? morphoMatches.reduce(
              (s, m) =>
                s +
                (m.p.apyBaseBorrow ?? 0) *
                  (m.p.apyBaseBorrow != null ? m.supply : 0),
              0,
            ) / borrowDenom
          : null
      const sUtilM = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : null
      siblings.push({
        poolId: morphoMatches[0]!.p.pool, // detail link goes to the largest matching market
        protocolSlug: slug,
        protocolName: siblingCfg.name,
        protocolColor: siblingCfg.color,
        asset: target,
        subLabel: `Across ${morphoMatches.length} ${
          morphoMatches.length === 1 ? "vault" : "vaults"
        }`,
        totalSupplyUsd: totalSupply,
        totalBorrowUsd: totalBorrow,
        utilizationPct: sUtilM,
        supplyApy: supplyApyBlend,
        borrowApy: borrowApyBlend,
      })
      continue
    }

    const sUtil =
      supply > 0 && p.totalBorrowUsd != null ? (p.totalBorrowUsd / supply) * 100 : null
    siblings.push({
      poolId: p.pool,
      protocolSlug: slug,
      protocolName: siblingCfg.name,
      protocolColor: siblingCfg.color,
      asset: p.symbol,
      subLabel: subLabelFor(p, siblingCfg.architecture),
      totalSupplyUsd: supply,
      totalBorrowUsd: p.totalBorrowUsd ?? 0,
      utilizationPct: sUtil,
      supplyApy: p.apyBase,
      borrowApy: p.apyBaseBorrow,
    })
  }
  return siblings
}

/** Derive borrow APY + utilization history from data we already pull.
 *
 *  Source: DefiLlama Yields `/chart/{poolId}` for supply APY history (passed
 *  in as `supplyApyHistory`) + DefiLlama `/protocol/<slug>` chainTvls for
 *  per-asset utilization (fetched here). Combined via the standard
 *  pool-based-lending identity — see `lib/derived-rates.ts` for math.
 *
 *  This replaces the legacy `rate_snapshots` Neon-table lookup. The new
 *  approach gives us 3-year history for every Aave/Spark/Fluid asset
 *  instead of 10-major-only.
 */
interface DerivedHistory {
  borrowApyHistory: Array<{ timestamp: number; value: number }>
  utilizationHistory: Array<{ timestamp: number; value: number }>
  /** Total supplied USD per day for this asset = unborrowed + borrowed. */
  totalSupplyUsdHistory: Array<{ timestamp: number; value: number }>
  /** Borrowed USD per day for this asset. */
  borrowUsdHistory: Array<{ timestamp: number; value: number }>
}

async function loadDerivedBorrowAndUtilHistory(
  defillamaProtocolSlug: string,
  assetSymbol: string,
  supplyApyHistory: Array<{ timestamp: number; value: number }>,
  reserveFactor: number | null,
): Promise<DerivedHistory> {
  try {
    const history = await fetchProtocolHistory(defillamaProtocolSlug)
    const utilizationHistory = utilizationHistoryForAsset(
      history.suppliedByAsset,
      history.borrowedByAsset,
      assetSymbol,
    )
    const borrowApyHistory = deriveBorrowApyHistory(
      supplyApyHistory,
      utilizationHistory,
      reserveFactor,
    )
    const { totalSupplyUsdHistory, borrowUsdHistory } = totalSupplyAndBorrowHistoryForAsset(
      history.suppliedByAsset,
      history.borrowedByAsset,
      assetSymbol,
    )
    return { borrowApyHistory, utilizationHistory, totalSupplyUsdHistory, borrowUsdHistory }
  } catch (err: any) {
    console.error("[market-detail] derived history failed for", assetSymbol, ":", err?.message ?? err)
    return { borrowApyHistory: [], utilizationHistory: [], totalSupplyUsdHistory: [], borrowUsdHistory: [] }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DefiLlama-only path (Aave V3, Spark, Fluid until their SDKs land)
// ─────────────────────────────────────────────────────────────────────────

async function loadFromDefillama(
  pool: YieldPool,
  cfg: ProtocolConfig,
  allPools: YieldPool[],
): Promise<MarketDetail> {
  const tvlUsd = pool.tvlUsd ?? 0
  const totalBorrowUsd = pool.totalBorrowUsd ?? 0
  const totalSupplyUsd =
    pool.totalSupplyUsd != null && pool.totalSupplyUsd > 0
      ? pool.totalSupplyUsd
      : tvlUsd + totalBorrowUsd
  const utilizationPct = totalSupplyUsd > 0 ? (totalBorrowUsd / totalSupplyUsd) * 100 : null

  // Pull pool-level supply APY chart + protocol-level history in parallel.
  // The borrow-APY derivation needs the live reserve factor, which the
  // per-protocol wrappers (Aave/Spark/Fluid) inject after this base load
  // returns — so for the bare DefiLlama path we use a 10% RF heuristic
  // (matches the previous SparkLend dashboard's hard-coded `× 1.1`).
  const [chart, derived] = await Promise.all([
    fetchYieldChart(pool.pool).catch(() => [] as YieldChartPoint[]),
    loadDerivedBorrowAndUtilHistory(
      cfg.defillamaSlug,
      pool.symbol,
      [], // populated below; we re-derive after extracting supplyApyHistory
      null,
    ),
  ])

  const tvlHistory = chartToSeries(chart, "tvlUsd")
  const supplyApyHistory = chartToSeries(chart, "apyBase")
  // `supplyUsdHistory` represents TOTAL supplied (unborrowed + borrowed),
  // matching the semantic of the `totalSupplyUsd` snapshot value. We use the
  // /protocol/<slug>-derived series rather than DefiLlama Yields' tvlUsd
  // (which is just unborrowed liquidity).
  const supplyUsdHistory = derived.totalSupplyUsdHistory

  // Re-derive borrow APY now that we have supplyApyHistory. The earlier
  // parallel call was just to pre-fetch utilization in parallel with the
  // pool chart — it returned an empty borrow series because we passed [].
  const borrowApyHistory = deriveBorrowApyHistory(
    supplyApyHistory,
    derived.utilizationHistory,
    null, // RF: heuristic 10% inside deriveBorrowApyHistory
  )
  const utilizationHistory = derived.utilizationHistory
  const hasBorrowHistory = borrowApyHistory.length > 0 || utilizationHistory.length > 0

  const dataSources: DataSourceProvenance = {
    state: "defillama",
    history: supplyApyHistory.length > 0 || hasBorrowHistory ? "defillama" : "none",
    irm: "none",
    composition: "none",
  }

  return {
    poolId: pool.pool,
    asset: pool.symbol,
    subLabel: subLabelFor(pool, cfg.architecture),
    assetType: classifyAsset(pool.symbol),
    protocolSlug: cfg.slug,
    protocolName: cfg.name,
    protocolColor: cfg.color,
    protocolArchitecture: cfg.architecture,
    protocolWebsite: cfg.website,
    chain: pool.chain,
    defillamaProject: pool.project,
    underlyingAssetSymbol: pool.symbol,  // For non-Morpho, asset == underlying

    tvlUsd,
    totalSupplyUsd,
    totalBorrowUsd,
    availableLiquidityUsd: tvlUsd,  // DefiLlama's tvlUsd = unborrowed liquidity
    totalSupplyToken: null,
    totalBorrowToken: null,
    availableLiquidityToken: null,
    underlyingPriceUsd: null,
    underlyingDecimals: null,
    reservesUsd: null,
    reservesToken: null,

    utilizationPct,
    supplyApy: pool.apyBase,
    supplyApyReward: pool.apyReward,
    borrowApy: pool.apyBaseBorrow,
    borrowApyReward: pool.apyRewardBorrow,
    netSupplyApy: pool.apyBase,  // Same as supply APY when we don't have fee details
    apyMean30d: pool.apyMean30d,
    apyBaseInception: pool.apyBaseInception,
    hasRewards: (pool.apyReward ?? 0) > 0 || (pool.apyRewardBorrow ?? 0) > 0,

    ltv: pool.ltv,
    liquidationThreshold: null,
    reserveFactor: null,
    fee: null,

    supplyCapUsd: null,
    supplyCapToken: null,
    borrowCapUsd: null,
    borrowCapToken: null,

    irmCurve: null,
    irmKink: null,

    tvlHistory,
    supplyUsdHistory,
    borrowUsdHistory: derived.borrowUsdHistory,
    supplyApyHistory,
    borrowApyHistory,
    utilizationHistory,
    hasBorrowHistory,
    // Cap util series stay empty here — caps aren't known at the base
    // DefiLlama level. The per-protocol overlays (Aave/Spark) populate them
    // once the on-chain caps are resolved.
    supplyCapUtilHistory: [],
    borrowCapUtilHistory: [],

    vaultAllocation: null,
    supplyingVaults: null,

    totalSupply24hChangeUsd: null,
    exposureSymbols: null,
    vaultMeta: null,
    vaultActivity: null,
    vaultLiquidations: null,
    vaultTopDepositors: null,
    fluidVaultInfo: null,

    siblings: buildSiblings(pool, cfg.slug, allPools),
    dataSources,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Aave V3 path (on-chain UiPoolDataProvider for caps / RF / IRM / reserves)
// ─────────────────────────────────────────────────────────────────────────

/** Apply a live Aave-style reserve onto the DefiLlama-shape base detail.
 *  Used by both Aave V3 and SparkLend (since SparkLend is a V3 fork). */
function applyAaveStyleReserve(
  base: MarketDetail,
  reserve: AaveReserveLive,
  source: "aave" | "spark",
): MarketDetail {
  const irmCurveRaw = sampleAaveIrmCurve(reserve, 60)
  const irmCurve = irmCurveRaw.map((p) => ({
    utilization: p.utilization,
    supplyApy: p.supplyApy,   // already percent
    borrowApy: p.borrowApy,
  }))
  // Aave/Spark encode "no cap" two ways: 0 (newer) and 2^36-1 = 68_719_476_735
  // (the bit-mask sentinel for an unset cap). Treat the sentinel as null too.
  const NO_CAP_SENTINEL = 68_719_476_735
  const supplyCapToken =
    reserve.supplyCapToken > 0 && reserve.supplyCapToken !== NO_CAP_SENTINEL
      ? reserve.supplyCapToken
      : null
  const borrowCapToken =
    reserve.borrowCapToken > 0 && reserve.borrowCapToken !== NO_CAP_SENTINEL
      ? reserve.borrowCapToken
      : null
  const supplyCapUsd = supplyCapToken != null ? supplyCapToken * reserve.priceUsd : null
  const borrowCapUsd = borrowCapToken != null ? borrowCapToken * reserve.priceUsd : null

  // Re-derive borrow APY history with the REAL on-chain reserve factor —
  // the base loader used a 10% heuristic. The utilization series stays as
  // the DefiLlama-derived one (no on-chain history available).
  const borrowApyHistory = deriveBorrowApyHistory(
    base.supplyApyHistory,
    base.utilizationHistory,
    reserve.reserveFactor,
  )

  // Cap utilization history — historical USD totals against current cap.
  // Uses the now-known on-chain caps. Approximate (assumes cap was always
  // at current level + USD wobbles with token price) but readable for trend.
  const supplyCapUtilHistory = capUtilizationHistory(base.supplyUsdHistory, supplyCapUsd)
  const borrowCapUtilHistory = capUtilizationHistory(base.borrowUsdHistory, borrowCapUsd)

  return {
    ...base,
    borrowApyHistory,
    hasBorrowHistory: borrowApyHistory.length > 0 || base.utilizationHistory.length > 0,
    supplyCapUtilHistory,
    borrowCapUtilHistory,
    // Live snapshot — on-chain values are authoritative over DefiLlama.
    underlyingPriceUsd: reserve.priceUsd,
    underlyingDecimals: reserve.decimals,
    totalSupplyUsd: reserve.totalSupplyUsd,
    totalBorrowUsd: reserve.totalBorrowUsd,
    availableLiquidityUsd: reserve.availableLiquidityUsd,
    totalSupplyToken: reserve.totalSupplyToken,
    totalBorrowToken: reserve.totalBorrowToken,
    availableLiquidityToken: reserve.availableLiquidityToken,
    reservesUsd: reserve.reservesUsd,
    reservesToken: reserve.reservesToken,

    utilizationPct: reserve.utilization * 100,
    supplyApy: reserve.supplyApy,
    borrowApy: reserve.borrowApy,
    netSupplyApy: reserve.supplyApy,

    ltv: reserve.ltv,
    liquidationThreshold: reserve.liquidationThreshold,
    reserveFactor: reserve.reserveFactor,

    supplyCapToken,
    supplyCapUsd,
    borrowCapToken,
    borrowCapUsd,

    irmCurve,
    irmKink: reserve.optimalUsageRatio,

    dataSources: {
      state: source,
      history: base.dataSources.history === "rate-snapshots" ? "rate-snapshots" : "defillama",
      irm: source,
      composition: "none",  // Per-position composition needs subgraph; deferred
    },
  }
}

async function loadFromAave(
  pool: YieldPool,
  cfg: ProtocolConfig,
  allPools: YieldPool[],
): Promise<MarketDetail | null> {
  const underlying = pool.underlyingTokens?.[0]
  if (!underlying) return null
  const reserve = await findAaveReserveByUnderlying(underlying).catch((e) => {
    console.error("[market-detail/aave] reserve lookup failed for", pool.symbol, ":", e?.message ?? e)
    return null
  })
  if (!reserve) return null
  const base = await loadFromDefillama(pool, cfg, allPools)
  return applyAaveStyleReserve(base, reserve, "aave")
}

async function loadFromSpark(
  pool: YieldPool,
  cfg: ProtocolConfig,
  allPools: YieldPool[],
): Promise<MarketDetail | null> {
  const underlying = pool.underlyingTokens?.[0]
  if (!underlying) return null
  const reserve = await findSparkReserveByUnderlying(underlying).catch((e) => {
    console.error("[market-detail/spark] reserve lookup failed for", pool.symbol, ":", e?.message ?? e)
    return null
  })
  if (!reserve) return null
  const base = await loadFromDefillama(pool, cfg, allPools)
  return applyAaveStyleReserve(base, reserve, "spark")
}

// ─────────────────────────────────────────────────────────────────────────
// Fluid path (on-chain via VaultResolver.getVaultsEntireData())
//
// Fluid's architecture differs significantly from Aave V3:
//   - Each vault is a single (collateral, loan) pair, not a pool of reserves.
//   - The Liquidity Layer underneath provides the actual deposit pools.
//   - APY calculation involves vault-level + Liquidity-Layer-level rates.
//
// For now we keep DefiLlama's USD totals + APYs (they're accurate) and
// only enrich with the on-chain fields DefiLlama doesn't expose:
//   - Collateral Factor / Liquidation Threshold / Borrow Fee
//   - Caps (raw token units; USD is derived by ratio against the
//     DefiLlama-supplied total).
//   - Liquidation penalty (≈ liquidation bonus).
//
// IRM curve is deferred — Fluid's rate model derives from the Liquidity
// Layer's utilization, not a per-vault piecewise-linear curve.
// ─────────────────────────────────────────────────────────────────────────

async function loadFromFluid(
  pool: YieldPool,
  cfg: ProtocolConfig,
  allPools: YieldPool[],
): Promise<MarketDetail | null> {
  // Fluid vaults always have BOTH a collateral and a loan asset, so they
  // appear in DefiLlama with two entries in `underlyingTokens`. Single-
  // underlying Fluid pools are lending-side (Liquidity Layer fTokens) that
  // need the LendingResolver — defer those to a future session and let them
  // fall back to DefiLlama-only.
  if (!pool.underlyingTokens || pool.underlyingTokens.length < 2) return null
  const [collateral, loan] = pool.underlyingTokens
  const vault = await findFluidVaultForPair(collateral, loan).catch((e) => {
    console.error("[market-detail/fluid] vault lookup failed for", pool.symbol, ":", e?.message ?? e)
    return null
  })
  if (!vault) return null

  // DefiLlama is still authoritative for live USD totals + APYs. We only
  // overlay risk params + caps from on-chain.
  const base = await loadFromDefillama(pool, cfg, allPools)
  // Resolve the loan-asset symbol for the Vault Info panel by matching the
  // loan-token address against any DefiLlama pool that has that as its
  // PRIMARY underlying. This avoids a separate ERC20 metadata call.
  const loanSymbol = resolveSymbolFromPools(allPools, loan) ?? "?"
  return applyFluidVault(base, vault, pool.symbol, loanSymbol)
}

/** Look up an asset symbol by its address by scanning DefiLlama pools where
 *  it appears as `underlyingTokens[0]` (the primary underlying). Falls back
 *  to null when not found. */
function resolveSymbolFromPools(allPools: YieldPool[], address: string): string | null {
  if (!address) return null
  const target = address.toLowerCase()
  // ETH sentinels — both Aave-style zero address and ERC-7528.
  if (target === "0x0000000000000000000000000000000000000000" ||
      target === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") return "ETH"
  for (const p of allPools) {
    if (p.chain !== "Ethereum") continue
    const primary = p.underlyingTokens?.[0]?.toLowerCase()
    if (primary === target) return p.symbol
  }
  return null
}

function applyFluidVault(
  base: MarketDetail,
  vault: FluidVaultLive,
  collateralSymbol: string,
  loanSymbol: string,
): MarketDetail {
  // Caps in USD: derive by ratio against DefiLlama's total. If `totalSupplyRaw`
  // is 0, we can't infer USD, so leave caps as null even when raw>0.
  const supplyRatio =
    vault.totalSupplyRaw > 0n
      ? Number(vault.supplyCapRaw) / Number(vault.totalSupplyRaw)
      : null
  const borrowRatio =
    vault.totalBorrowRaw > 0n
      ? Number(vault.borrowCapRaw) / Number(vault.totalBorrowRaw)
      : null
  const supplyCapUsd =
    vault.supplyCapRaw > 0n && supplyRatio != null && base.totalSupplyUsd > 0
      ? supplyRatio * base.totalSupplyUsd
      : null
  const borrowCapUsd =
    vault.borrowCapRaw > 0n && borrowRatio != null && base.totalBorrowUsd > 0
      ? borrowRatio * base.totalBorrowUsd
      : null

  // NOTE: We deliberately do NOT use the derived borrow-APY history for
  // Fluid. The derivation assumes supplyAPY ≈ borrowAPY × util × (1−RF),
  // which holds for pool-based protocols where one asset has one supply
  // pool. Fluid's vaults are (collateral, loan) pairs and each loan has its
  // own utilization curve. DefiLlama's per-asset numbers aggregate across
  // ALL vaults using that asset, so derived rates come out wildly off
  // (e.g. wstETH derived APY 0.19% vs live 3.36%). We zero out both the
  // derived borrow APY history AND the per-asset utilization history for
  // Fluid — leaving the detail page with the supply APY history (correct)
  // and live snapshot only for borrow / util.

  return {
    ...base,
    ltv: vault.collateralFactor,
    liquidationThreshold: vault.liquidationThreshold,
    // Fluid's `borrowFee` is the protocol cut on borrow interest — same role
    // as Aave's reserve factor. Map directly.
    reserveFactor: vault.borrowFee > 0 ? vault.borrowFee : null,
    // Caps — token units come straight from on-chain; USD is the derived ratio.
    supplyCapToken: vault.supplyCapRaw > 0n ? Number(vault.supplyCapRaw) : null,
    borrowCapToken: vault.borrowCapRaw > 0n ? Number(vault.borrowCapRaw) : null,
    supplyCapUsd,
    borrowCapUsd,
    borrowApyHistory: [],
    utilizationHistory: [],
    hasBorrowHistory: false,
    // Cap util doesn't apply to Fluid's vault model — caps are per-vault on
    // the Liquidity Layer, not a single per-asset reserve cap. Skip.
    supplyCapUtilHistory: [],
    borrowCapUtilHistory: [],
    fluidVaultInfo: {
      vaultAddress: vault.address,
      vaultId: vault.vaultId,
      vaultType: vault.vaultType,
      isSmartCol: vault.isSmartCol,
      isSmartDebt: vault.isSmartDebt,
      liquidityLayer: null,  // Same address across all vaults; surface later if needed
      collateralAssetSymbol: collateralSymbol,
      collateralAssetAddress: vault.collateralAsset,
      loanAssetSymbol: loanSymbol,
      loanAssetAddress: vault.loanAsset,
      liquidationPenalty: vault.liquidationPenalty,
    },
    dataSources: {
      state: "fluid",
      history: "defillama",
      irm: "none",  // Fluid IRM derivation deferred
      composition: "none",
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Morpho path (vaults via Morpho-API GraphQL)
// ─────────────────────────────────────────────────────────────────────────

interface MorphoVaultExtras {
  activity: MorphoVaultActivity[]
  liquidations: MorphoMarketLiquidation[]
  depositors: MorphoVaultDepositor[]
}

function morphoVaultToDetail(
  pool: YieldPool,
  cfg: ProtocolConfig,
  v: MorphoVaultDetail,
  extras: MorphoVaultExtras,
  allPools: YieldPool[],
): MarketDetail {
  // Morpho returns APYs as 0-1 fractions; our internal convention (matching
  // DefiLlama) stores them as 0-100 percent. Normalize on the way in.
  const toPct = (x: number | null | undefined): number | null =>
    x == null || !Number.isFinite(x) ? null : x * 100

  const utilizationPct =
    v.totalAssetsUsd > 0 ? ((v.totalAssetsUsd - v.liquidityUsd) / v.totalAssetsUsd) * 100 : null
  const totalBorrowUsd = Math.max(0, v.totalAssetsUsd - v.liquidityUsd)
  // Vault-shape doesn't have direct token quantities for "borrow" (since
  // borrowing happens at the underlying market, not at the vault), but we
  // can derive supply token from totalAssetsUnderlying.
  const supplyToken = v.totalAssetsUnderlying
  const priceUsd =
    supplyToken > 0 ? v.totalAssetsUsd / supplyToken : null

  // Derive reservesUsd = vault performance fee × total assets (approximate).
  // For zero-fee vaults this is 0, which matches Steakhouse USDC's curator
  // model. This is a rough proxy for "what the curator earns" rather than
  // protocol-side reserves in the Aave sense.
  const reservesUsd = v.fee > 0 ? v.totalAssetsUsd * v.fee : 0

  const allocation: VaultAllocationRow[] = v.allocation.map((a) => ({
    marketUniqueKey: a.marketUniqueKey,
    marketLabel: a.marketName,
    collateralSymbol: a.collateralSymbol,
    collateralLogoURI: a.collateralLogoURI,
    loanSymbol: a.loanSymbol,
    lltv: a.lltv,
    vaultSupplyUsd: a.vaultSupplyUsd,
    sharePct: a.vaultSharePct,
    marketSupplyAssetsUsd: a.marketSupplyAssetsUsd,
    marketBorrowAssetsUsd: a.marketBorrowAssetsUsd,
    marketLiquidityAssetsUsd: a.marketLiquidityAssetsUsd,
    // Per-market APYs also come back as 0-1 fractions → percent.
    marketSupplyApy: toPct(a.marketSupplyApy),
    marketBorrowApy: toPct(a.marketBorrowApy),
    marketUtilization: a.marketUtilization,  // 0-1 fraction; consumers expect this
  }))

  // History points: APY series come back as fractions, normalize to percent.
  const supplyUsdHistory = v.history.totalAssetsUsd
  const supplyApyHistory = v.history.netApy.map((p) => ({ timestamp: p.timestamp, value: p.value * 100 }))

  // 24h delta on total deposits — last point minus point closest to 1d earlier.
  const totalSupply24hChangeUsd = compute24hChange(supplyUsdHistory)

  // "Exposure" — unique collateral assets across the vault's allocation.
  // Drops the Idle bucket (where collateral is null).
  const exposureSymbols = Array.from(
    new Set(v.allocation.map((a) => a.collateralSymbol).filter((s): s is string => !!s)),
  )

  // Vault meta panel (admin addresses, fees, timelock, version).
  const meta: VaultMetaInfo = {
    vaultAddress: v.address,
    ownerAddress: v.meta.ownerAddress,
    curatorAddress: v.meta.curatorAddress,
    curatorName: v.meta.curatorMetadata?.name ?? null,
    allocatorAddress: v.meta.allocatorAddress,
    allocatorCount: v.meta.allocatorCount,
    guardianAddress: v.meta.guardianAddress,
    feeRecipientAddress: v.meta.feeRecipientAddress,
    performanceFee: v.fee,
    timelockSeconds: v.meta.timelockSeconds,
    factoryAddress: v.meta.factoryAddress,
    versionLabel: vaultVersionLabel(v.meta.factoryAddress),
  }

  const dataSources: DataSourceProvenance = {
    state: "morpho",
    history: "morpho",
    irm: "none",  // Vaults don't have a single IRM curve; their constituent markets do
    composition: "morpho-vault",
  }

  return {
    poolId: pool.pool,
    asset: pool.symbol,
    subLabel: subLabelFor(pool, cfg.architecture),
    assetType: classifyAsset(pool.symbol),
    protocolSlug: cfg.slug,
    protocolName: cfg.name,
    protocolColor: cfg.color,
    protocolArchitecture: cfg.architecture,
    protocolWebsite: cfg.website,
    chain: pool.chain,
    defillamaProject: pool.project,
    underlyingAssetSymbol: v.asset.symbol,   // The asset the vault accepts (USDC for steakUSDC)

    tvlUsd: v.liquidityUsd,                  // Available liquidity = unborrowed
    totalSupplyUsd: v.totalAssetsUsd,
    totalBorrowUsd,
    availableLiquidityUsd: v.liquidityUsd,
    totalSupplyToken: supplyToken,
    totalBorrowToken: priceUsd && priceUsd > 0 ? totalBorrowUsd / priceUsd : null,
    availableLiquidityToken: priceUsd && priceUsd > 0 ? v.liquidityUsd / priceUsd : null,
    underlyingPriceUsd: priceUsd,
    underlyingDecimals: v.asset.decimals,
    reservesUsd,
    reservesToken: priceUsd && priceUsd > 0 ? reservesUsd / priceUsd : null,

    utilizationPct,
    supplyApy: toPct(v.apy),                 // Morpho returns fraction → percent
    supplyApyReward: null,                   // Morpho rolls rewards into netApy
    borrowApy: null,                         // Vaults don't expose borrow side
    borrowApyReward: null,
    netSupplyApy: toPct(v.netApy),
    apyMean30d: pool.apyMean30d,             // Fall back to DefiLlama for this
    apyBaseInception: pool.apyBaseInception,
    hasRewards: v.netApy !== v.netApyExcludingRewards,

    ltv: null,                               // LLTV is a market-level concept, not vault-level
    liquidationThreshold: null,
    reserveFactor: null,                     // Morpho markets have a fee, not a reserve factor
    fee: v.fee,

    // Morpho vaults don't expose deposit caps in the Aave sense; the cap
    // belongs to each underlying market and is enforced via allocation.
    supplyCapUsd: null,
    supplyCapToken: null,
    borrowCapUsd: null,
    borrowCapToken: null,

    irmCurve: null,                          // Vault-level — see allocation for per-market IRMs
    irmKink: null,

    tvlHistory: supplyUsdHistory,
    supplyUsdHistory,
    borrowUsdHistory: [],                    // Vaults have no aggregate borrow history
    supplyApyHistory,
    borrowApyHistory: [],
    utilizationHistory: [],
    hasBorrowHistory: false,
    // Morpho vaults don't have caps in the Aave sense — capacity is set by
    // each underlying market's allocation. Cap-utilization charts don't apply.
    supplyCapUtilHistory: [],
    borrowCapUtilHistory: [],

    vaultAllocation: allocation,
    supplyingVaults: null,

    totalSupply24hChangeUsd,
    exposureSymbols,
    vaultMeta: meta,
    fluidVaultInfo: null,
    vaultActivity: extras.activity,
    vaultLiquidations: extras.liquidations,
    vaultTopDepositors: extras.depositors.map((d) => ({
      walletAddress: d.walletAddress,
      assetsUsd: d.assetsUsd,
      assetsToken: d.assetsToken,
      sharePct: v.totalAssetsUsd > 0 ? (d.assetsUsd / v.totalAssetsUsd) * 100 : 0,
    })),

    // Vaults compare against the underlying asset across protocols, not the
    // vault symbol — so `steakUSDC` shows Aave/Spark/Fluid USDC siblings.
    siblings: buildSiblings(pool, cfg.slug, allPools, v.asset.symbol),
    dataSources,
  }
}

/** Find the most-recent value vs. point closest to 1d earlier (within 2d). */
function compute24hChange(series: Array<{ timestamp: number; value: number }>): number | null {
  if (series.length < 2) return null
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp)
  const latest = sorted[sorted.length - 1]
  const target = latest.timestamp - 86400
  const tolerance = 2 * 86400
  let best: typeof latest | null = null
  let bestDist = Infinity
  for (const p of sorted) {
    if (p.timestamp >= latest.timestamp) break
    const d = Math.abs(p.timestamp - target)
    if (d < bestDist && d <= tolerance) {
      best = p
      bestDist = d
    }
  }
  return best ? latest.value - best.value : null
}

/** Map MetaMorpho factory address → human-readable version label. The
 *  original (V1) factory is well known; later versions get added here as
 *  Morpho ships them. Fallback labels the address generically. */
const VAULT_FACTORY_VERSIONS: Record<string, string> = {
  "0xa9c3d3a366466fa809d1ae982fb2c46e5fc41101": "MetaMorpho V1",
  "0x1897a8997241c1cd4bd0698647e4eb7213535c24": "MetaMorpho V1.1",
}

function vaultVersionLabel(factoryAddress: string | null): string {
  if (!factoryAddress) return "MetaMorpho"
  return VAULT_FACTORY_VERSIONS[factoryAddress.toLowerCase()] ?? "MetaMorpho"
}

async function loadFromMorpho(
  pool: YieldPool,
  cfg: ProtocolConfig,
  allPools: YieldPool[],
): Promise<MarketDetail | null> {
  // Step 1: Resolve DefiLlama pool → Morpho vault address.
  const resolved = await findMorphoVaultForDefillamaPool(pool)
  if (!resolved) return null
  // Step 2: Pull rich vault detail (we need its asset decimals + market keys
  //         before we can fetch the secondary tables).
  const vault = await loadMorphoVaultByAddress(resolved.address)
  if (!vault) return null

  // Step 3: Three secondary fetches in parallel — vault activity, liquidations
  //         on the vault's underlying markets, and top depositors. Each is
  //         independently resilient: a failure returns [] rather than throwing,
  //         so the page still renders even if one section is unavailable.
  const priceUsd =
    vault.totalAssetsUnderlying > 0 ? vault.totalAssetsUsd / vault.totalAssetsUnderlying : 0
  const marketKeys = vault.allocation.map((a) => a.marketUniqueKey)
  const [activity, liquidations, depositors] = await Promise.all([
    loadMorphoVaultActivity(resolved.address, vault.asset.decimals, priceUsd, 10).catch(() => []),
    loadMorphoMarketLiquidations(marketKeys, 10).catch(() => []),
    loadMorphoVaultTopDepositors(resolved.address, vault.asset.decimals, 10).catch(() => []),
  ])

  return morphoVaultToDetail(pool, cfg, vault, { activity, liquidations, depositors }, allPools)
}

// ─────────────────────────────────────────────────────────────────────────
// Public entrypoint — dispatch by protocol
// ─────────────────────────────────────────────────────────────────────────

export async function loadMarketDetail(poolId: string): Promise<MarketDetail | null> {
  // Always resolve via DefiLlama first — it gives us the protocol routing,
  // the universe for siblings, and a fallback if the native source fails.
  const allPools = await fetchAllYieldPools()
  const pool = allPools.find((p) => p.pool === poolId)
  if (!pool) return null

  const protocolSlug = ourSlugForProject(pool.project)
  if (!protocolSlug) return null
  const cfg = PROTOCOL_BY_SLUG[protocolSlug]
  if (!cfg) return null

  // Per-protocol enrichment. Each branch falls back to DefiLlama on failure
  // so the page never errors just because a third party is down.
  let detail: MarketDetail | null = null
  if (protocolSlug === "morpho-blue") {
    detail = await loadFromMorpho(pool, cfg, allPools).catch((err) => {
      console.error("[market-detail] morpho enrichment failed, falling back:", err?.message)
      return null
    })
  }
  if (!detail && protocolSlug === "aave-v3") {
    detail = await loadFromAave(pool, cfg, allPools).catch((err) => {
      console.error("[market-detail] aave enrichment failed, falling back:", err?.message)
      return null
    })
  }
  if (!detail && protocolSlug === "spark") {
    detail = await loadFromSpark(pool, cfg, allPools).catch((err) => {
      console.error("[market-detail] spark enrichment failed, falling back:", err?.message)
      return null
    })
  }
  if (!detail && protocolSlug === "fluid") {
    detail = await loadFromFluid(pool, cfg, allPools).catch((err) => {
      console.error("[market-detail] fluid enrichment failed, falling back:", err?.message)
      return null
    })
  }
  if (!detail) {
    detail = await loadFromDefillama(pool, cfg, allPools)
  }
  return enrichWithCrossProtocolHistory(detail)
}

/**
 * Fetch supply APY history for every sibling pool (and stitch in the
 * current market's own history) so the cross-protocol rate chart on the
 * market detail page can render a single line per protocol over the last
 * 90 days.
 *
 * Sibling fetches go in parallel and are individually failure-tolerant —
 * a single failed chart returns an empty series rather than killing the
 * whole enrichment.
 */
async function enrichWithCrossProtocolHistory(
  detail: MarketDetail,
): Promise<MarketDetail> {
  const cutoffTs = Math.floor(Date.now() / 1000) - 90 * 86400
  const trim = (series: Array<{ timestamp: number; value: number }>) =>
    series.filter((p) => p.timestamp >= cutoffTs && Number.isFinite(p.value))
  const out: Record<string, Array<{ timestamp: number; value: number }>> = {}

  // Current market — use the supply APY history we already loaded so we
  // don't refetch the same pool's chart twice.
  if (detail.supplyApyHistory.length > 0) {
    out[detail.protocolSlug] = trim(detail.supplyApyHistory)
  }

  if (detail.siblings.length > 0) {
    const charts = await Promise.all(
      detail.siblings.map(async (s) => {
        try {
          const points = await fetchYieldChart(s.poolId)
          return {
            slug: s.protocolSlug,
            points: trim(
              points
                .filter((p) => p.apyBase != null && Number.isFinite(p.apyBase))
                .map((p) => ({ timestamp: p.timestamp, value: p.apyBase as number })),
            ),
          }
        } catch (err: any) {
          console.error(
            `[market-detail] sibling chart ${s.protocolSlug} (${s.poolId}) failed:`,
            err?.message ?? err,
          )
          return { slug: s.protocolSlug, points: [] }
        }
      }),
    )
    for (const { slug, points } of charts) {
      // Only assign once per slug — siblings are already deduped per protocol
      // by buildSiblings, so the first hit wins.
      if (!out[slug] && points.length > 0) {
        out[slug] = points
      }
    }
  }

  return { ...detail, crossProtocolSupplyApyHistory: out }
}
