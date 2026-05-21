/**
 * DefiLlama fetcher for protocol-level TVL, borrow volume, and fees.
 * Used by the Market Overview page (aggregate cards + TVL time series).
 *
 * Reference: https://api.llama.fi/protocol/<slug>
 * Fees:      https://api.llama.fi/summary/fees/<slug>?dataType=dailyFees
 */

export interface DayPoint {
  /** Unix seconds (UTC midnight) */
  timestamp: number
  usd: number
}

export interface AssetDayPoint {
  timestamp: number
  /** Per-asset values keyed by token symbol. For tokensInUsd this is USD, for
   *  tokens this is raw token units (the native decimal-adjusted quantity). */
  tokens: Record<string, number>
}

export interface ProtocolHistory {
  slug: string
  /** Ethereum-chain TVL time series (supplied - borrowed for pool protocols) */
  tvl: DayPoint[]
  /** Ethereum-chain borrowed time series */
  borrowed: DayPoint[]
  /** Per-asset supplied (unborrowed) USD history on Ethereum */
  suppliedByAsset: AssetDayPoint[]
  /** Per-asset borrowed USD history on Ethereum */
  borrowedByAsset: AssetDayPoint[]
  /** Per-asset supplied (unborrowed) raw TOKEN QUANTITY history. Lets us
   *  isolate deposit/withdraw flows from token-price fluctuations. */
  suppliedByAssetQty: AssetDayPoint[]
  /** Per-asset borrowed raw TOKEN QUANTITY history. */
  borrowedByAssetQty: AssetDayPoint[]
  /** Daily fees time series (across all chains; Ethereum share is dominant for these four) */
  fees: DayPoint[]
  /** Net interest paid by borrowers (DefiLlama dailyUserFees). Tier 1 sector-size metric. */
  userFees: DayPoint[]
  /** Current snapshot values */
  currentTvl: number
  currentBorrowed: number
  /** 24h and 7d fee sums */
  fees24h: number
  fees7d: number
  /** Current per-chain Available Liquidity (DefiLlama's `chainTvls.<chain>.tvl`)
   *  for every chain the protocol is deployed on. Aggregate keys (e.g.
   *  `borrowed`, `staking`) and per-chain `-borrowed` siblings are filtered
   *  out. Used by the Aave V3 Multi-Chain Footprint module. */
  multiChainTvl: Record<string, number>
  /** Current per-chain active Borrows from DefiLlama's
   *  `chainTvls.<chain>-borrowed`. Same chain key shape as `multiChainTvl`
   *  so the two dictionaries pair up cleanly when the Multi-Chain
   *  Footprint chart toggles between Available Liquidity and Borrows. */
  multiChainBorrowed: Record<string, number>
}

const LLAMA_BASE = "https://api.llama.fi"

interface LlamaChainEntry {
  tvl: Array<{ date: number; totalLiquidityUSD: number }>
  tokensInUsd?: Array<{ date: number; tokens: Record<string, number> }>
  tokens?: Array<{ date: number; tokens: Record<string, number> }>
}
type LlamaChainTvls = Record<string, LlamaChainEntry>

interface LlamaProtocolResponse {
  name: string
  chainTvls: LlamaChainTvls
  currentChainTvls?: Record<string, number>
}

/** Drop partial/incomplete tail entries that DefiLlama publishes for the current day. */
function trimIncompleteTail<T extends { timestamp: number }>(
  points: T[],
  isZero: (p: T) => boolean,
): T[] {
  const nowSec = Math.floor(Date.now() / 1000)
  const out = [...points]
  while (out.length > 0) {
    const last = out[out.length - 1]
    const ageHours = (nowSec - last.timestamp) / 3600
    if (ageHours < 18 || isZero(last)) {
      out.pop()
    } else {
      break
    }
  }
  return out
}

function toDayPoints(arr: Array<{ date: number; totalLiquidityUSD: number }> | undefined): DayPoint[] {
  if (!arr) return []
  const points = arr.map((r) => ({ timestamp: r.date, usd: r.totalLiquidityUSD }))
  return trimIncompleteTail(points, (p) => p.usd === 0)
}

function toAssetPoints(arr: Array<{ date: number; tokens: Record<string, number> }> | undefined): AssetDayPoint[] {
  if (!arr) return []
  const points = arr.map((r) => ({ timestamp: r.date, tokens: r.tokens || {} }))
  return trimIncompleteTail(points, (p) => {
    for (const v of Object.values(p.tokens)) if (v > 0) return false
    return true
  })
}

async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  // `cache: 'no-store'` bypasses Next.js's 2MB fetch-cache cap — DefiLlama's
  // /protocol responses are 4–34MB. Hourly freshness comes from the page-level
  // `export const revalidate = 3600` on the Overview route.
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) {
      throw new Error(`DefiLlama ${res.status} for ${url}`)
    }
    return (await res.json()) as T
  } catch (err: any) {
    // Next.js dev mode (and occasional upstream blips) produce transient
    // "terminated" errors on large responses. Retry up to twice with backoff.
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      return fetchJson<T>(url, attempt + 1)
    }
    throw err
  }
}

export async function fetchProtocolHistory(slug: string): Promise<ProtocolHistory> {
  const [protocol, feesJson, userFeesJson] = await Promise.all([
    fetchJson<LlamaProtocolResponse>(`${LLAMA_BASE}/protocol/${slug}`),
    fetchFeesSummary(slug).catch(() => null),
    // dailyUserFees = interest paid by borrowers — Tier 1 sector-size metric.
    fetchJson<LlamaFeesResponse>(
      `${LLAMA_BASE}/summary/fees/${slug}?dataType=dailyUserFees`,
    ).catch(() => null),
  ])

  const ethEntry = protocol.chainTvls?.["Ethereum"]
  const ethBorrowEntry = protocol.chainTvls?.["Ethereum-borrowed"]

  const ethTvl = toDayPoints(ethEntry?.tvl)
  const ethBorrowed = toDayPoints(ethBorrowEntry?.tvl)
  const suppliedByAsset = toAssetPoints(ethEntry?.tokensInUsd)
  const borrowedByAsset = toAssetPoints(ethBorrowEntry?.tokensInUsd)
  const suppliedByAssetQty = toAssetPoints(ethEntry?.tokens)
  const borrowedByAssetQty = toAssetPoints(ethBorrowEntry?.tokens)

  const currentTvl = protocol.currentChainTvls?.["Ethereum"] ?? ethTvl.at(-1)?.usd ?? 0
  const currentBorrowed = protocol.currentChainTvls?.["Ethereum-borrowed"] ?? ethBorrowed.at(-1)?.usd ?? 0

  // Ethereum-only daily fees. DefiLlama's totalDataChart rolls all
  // chains together; the per-chain breakdown gives the Ethereum slice
  // (Aave V3 fees overstate by ~30% on the all-chain total, Morpho
  // by ~50%, Fluid by ~40%). The dashboard's coverage is Ethereum
  // mainnet, so the headline numbers must match.
  const feePoints: DayPoint[] = extractEthereumDailySeries(feesJson)
  const fees24h = feePoints.at(-1)?.usd ?? 0
  const fees7d = feePoints.slice(-7).reduce((s, p) => s + p.usd, 0)

  let userFeePoints: DayPoint[] = extractEthereumDailySeries(userFeesJson)
  // Fallback: DefiLlama exposes dailyUserFees only for some protocols (Fluid
  // returns it, Aave V3 / Spark / Morpho don't have a dedicated stream and
  // 404). For lending protocols, dailyFees is overwhelmingly borrow interest
  // anyway (flash loan + liquidation contributions are small), so use it as
  // the user-fees proxy when the dedicated series is missing. The methodology
  // tooltip on the headline counter calls this out.
  if (userFeePoints.length === 0 && feePoints.length > 0) {
    userFeePoints = feePoints
  }

  // Build per-chain dictionaries from `currentChainTvls`. DefiLlama mixes in
  // aggregate / non-chain keys we filter out:
  //   - "borrowed"            — global borrowed across all chains
  //   - "staking" / "pool2"   — non-lending categories the protocol opts in to
  // Per-chain `<Chain>-borrowed` keys go into `multiChainBorrowed`; the rest
  // (per-chain available liquidity) go into `multiChainTvl`.
  const multiChainTvl: Record<string, number> = {}
  const multiChainBorrowed: Record<string, number> = {}
  for (const [k, v] of Object.entries(protocol.currentChainTvls ?? {})) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue
    if (k === "borrowed" || k === "staking" || k === "pool2") continue
    if (k.endsWith("-borrowed")) {
      const chain = k.slice(0, -"-borrowed".length)
      multiChainBorrowed[chain] = v
    } else {
      multiChainTvl[k] = v
    }
  }

  return {
    slug,
    tvl: ethTvl,
    borrowed: ethBorrowed,
    suppliedByAsset,
    borrowedByAsset,
    suppliedByAssetQty,
    borrowedByAssetQty,
    fees: feePoints,
    userFees: userFeePoints,
    currentTvl,
    currentBorrowed,
    fees24h,
    fees7d,
    multiChainTvl,
    multiChainBorrowed,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DefiLlama Yields API — supply/borrow APY data for the Rate Monitor
// ═══════════════════════════════════════════════════════════════════════════

const YIELDS_BASE = "https://yields.llama.fi"

/** Live pool snapshot from /pools. */
export interface YieldPool {
  pool: string                  // UUID used as chart key
  chain: string                 // e.g. "Ethereum"
  project: string               // e.g. "aave-v3", "spark", "morpho-blue", "fluid-lending"
  symbol: string                // e.g. "USDC", "WETH" (uppercase)
  tvlUsd: number
  apy: number | null
  apyBase: number | null        // supply APY without incentives
  apyReward: number | null
  apyBaseBorrow: number | null  // borrow APY without incentives
  apyRewardBorrow: number | null
  /** DefiLlama-published 30-day mean of supply APY (apyBase). */
  apyMean30d: number | null
  /** DefiLlama-published "since inception" supply APY base. Useful for very-long-running markets. */
  apyBaseInception: number | null
  /** Optional Yields-API-supplied tag, e.g. `Spark Liquidity Layer`, `E-mode: stablecoins`. */
  poolMeta: string | null
  totalSupplyUsd: number | null
  totalBorrowUsd: number | null
  utilization: number | null
  ltv: number | null
  underlyingTokens: string[] | null
}

/** Historical point from /chart/{pool_id}. */
export interface YieldChartPoint {
  timestamp: number             // Unix seconds
  tvlUsd: number | null
  apy: number | null
  apyBase: number | null
  apyReward: number | null
}

interface YieldPoolsResponse {
  status: string
  data: Array<{
    pool: string
    chain: string
    project: string
    symbol: string
    tvlUsd: number
    apy: number | null
    apyBase: number | null
    apyReward: number | null
    apyBaseBorrow?: number | null
    apyRewardBorrow?: number | null
    apyMean30d?: number | null
    apyBaseInception?: number | null
    poolMeta?: string | null
    totalSupplyUsd?: number | null
    totalBorrowUsd?: number | null
    ltv?: number | null
    underlyingTokens?: string[]
  }>
}

interface YieldChartResponse {
  status: string
  data: Array<{
    timestamp: string           // ISO
    tvlUsd: number | null
    apy: number | null
    apyBase: number | null
    apyReward: number | null
  }>
}

/** Utilization lives in a second `/lendBorrow` endpoint on Yields. */
interface LendBorrowRow {
  pool: string
  apyBase: number | null
  apyBaseBorrow: number | null
  apyReward: number | null
  apyRewardBorrow: number | null
  totalSupplyUsd: number | null
  totalBorrowUsd: number | null
  ltv: number | null
  borrowable: boolean
}

export async function fetchAllYieldPools(): Promise<YieldPool[]> {
  const [pools, lendBorrow] = await Promise.all([
    fetchJson<YieldPoolsResponse>(`${YIELDS_BASE}/pools`),
    fetchJson<LendBorrowRow[]>(`${YIELDS_BASE}/lendBorrow`).catch(() => [] as LendBorrowRow[]),
  ])
  const lbByPool = new Map(lendBorrow.map((r) => [r.pool, r]))
  return (pools.data ?? []).map((p) => {
    const lb = lbByPool.get(p.pool)
    const supplyUsd = p.totalSupplyUsd ?? lb?.totalSupplyUsd ?? null
    const borrowUsd = p.totalBorrowUsd ?? lb?.totalBorrowUsd ?? null
    // The convention here (and everywhere downstream) is that `tvlUsd`
    // means *unborrowed* liquidity — Available Liquidity. DefiLlama
    // honours that for Aave V3 / Spark, but for Fluid vault pools
    // `tvlUsd` is reported equal to `totalSupplyUsd` (i.e. it includes
    // borrowed amounts). When we detect that shape — supply matches
    // tvl AND there's a non-zero borrow — recompute tvlUsd as
    // supply − borrow so Available Liquidity is consistent across
    // protocols (bar-chart tooltips, vault detail, stat cards).
    const rawTvlUsd = p.tvlUsd
    const tvlUsd =
      supplyUsd != null &&
      borrowUsd != null &&
      borrowUsd > 0 &&
      Math.abs(supplyUsd - rawTvlUsd) <= Math.max(1, rawTvlUsd * 0.001)
        ? Math.max(0, supplyUsd - borrowUsd)
        : rawTvlUsd
    return {
      pool: p.pool,
      chain: p.chain,
      project: p.project,
      symbol: (p.symbol || "").toUpperCase(),
      tvlUsd,
      apy: p.apy,
      apyBase: p.apyBase,
      apyReward: p.apyReward,
      apyBaseBorrow: p.apyBaseBorrow ?? lb?.apyBaseBorrow ?? null,
      apyRewardBorrow: p.apyRewardBorrow ?? lb?.apyRewardBorrow ?? null,
      apyMean30d: p.apyMean30d ?? null,
      apyBaseInception: p.apyBaseInception ?? null,
      poolMeta: p.poolMeta ?? null,
      totalSupplyUsd: supplyUsd,
      totalBorrowUsd: borrowUsd,
      utilization:
        supplyUsd && supplyUsd > 0 && borrowUsd != null
          ? (borrowUsd / supplyUsd) * 100
          : null,
      ltv: p.ltv ?? lb?.ltv ?? null,
      underlyingTokens: p.underlyingTokens ?? null,
    }
  })
}

/**
 * DefiLlama Coins API — instant USD price + decimals for any ERC20 by
 * chain:address.
 *
 * Used by per-market detail pages that need a price but don't have one
 * from their own on-chain reserves struct (e.g. Fluid vaults — Fluid's
 * `oraclePriceOperate` is per-vault and needs careful interpretation per
 * vault type, so we use DefiLlama's index price instead).
 *
 * Returns null when DefiLlama doesn't index the token or the request
 * fails — callers should fall back to "—" rather than rendering 0.
 */
export interface TokenInfo {
  priceUsd: number
  decimals: number
  symbol: string
}

/** Native-ETH placeholder address used by Fluid (ERC-7528) and the
 *  zero-address convention used by some other protocols. We treat both
 *  as native ETH and route to WETH for pricing. */
const ETH_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
])
const WETH_ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"

export async function fetchTokenInfo(
  chain: string,
  address: string,
): Promise<TokenInfo | null> {
  if (!address) return null
  const lower = address.toLowerCase()
  // Map ETH sentinels to WETH so the Coins API resolves the price.
  // Decimals match (18 / 18) so the returned info is correct for native
  // ETH on the consumer side too.
  const lookupAddr = ETH_SENTINELS.has(lower) ? WETH_ADDRESS : lower
  const key = `${chain.toLowerCase()}:${lookupAddr}`
  try {
    const res = await fetch(
      `https://coins.llama.fi/prices/current/${encodeURIComponent(key)}`,
      { cache: "no-store" },
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      coins?: Record<string, { price?: number; decimals?: number; symbol?: string }>
    }
    const entry = json.coins?.[key]
    if (!entry) return null
    const price = entry.price
    const decimals = entry.decimals
    if (
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      typeof decimals !== "number" ||
      !Number.isFinite(decimals) ||
      decimals < 0
    ) {
      return null
    }
    return {
      priceUsd: price,
      decimals: Math.floor(decimals),
      symbol: entry.symbol ?? "",
    }
  } catch (err: any) {
    console.error("[defillama] fetchTokenInfo failed for", key, ":", err?.message ?? err)
    return null
  }
}

/** Convenience: USD price only. Backwards-compatible with the previous
 *  `fetchTokenPriceUsd` shape — callers that don't need decimals can
 *  use this. */
export async function fetchTokenPriceUsd(
  chain: string,
  address: string,
): Promise<number | null> {
  const info = await fetchTokenInfo(chain, address)
  return info?.priceUsd ?? null
}

export async function fetchYieldChart(poolId: string): Promise<YieldChartPoint[]> {
  const res = await fetchJson<YieldChartResponse>(`${YIELDS_BASE}/chart/${poolId}`)
  if (res.status !== "success" || !Array.isArray(res.data)) return []
  return res.data.map((d) => ({
    timestamp: Math.floor(new Date(d.timestamp).getTime() / 1000),
    tvlUsd: d.tvlUsd,
    apy: d.apy,
    apyBase: d.apyBase,
    apyReward: d.apyReward,
  }))
}

interface LlamaFeesResponse {
  /** All-chain totals — [ [unix_ts, usd], ... ]. Used as a fallback when
   *  the per-chain breakdown isn't available. */
  totalDataChart: Array<[number, number]>
  /** Per-chain breakdown — [ [unix_ts, { Chain: { Protocol: number } | number }], ... ].
   *  We sum the Ethereum entries to get an Ethereum-only daily series.
   *  Some protocols nest by sub-protocol; some report the chain total
   *  directly. The extractor handles both shapes. */
  totalDataChartBreakdown?: Array<[number, Record<string, Record<string, number> | number>]>
  total24h?: number
  total7d?: number
}

/**
 * Sum the Ethereum entries in a DefiLlama fees response and return a
 * daily series in our canonical DayPoint shape. The protocol-level
 * fees tracked across the dashboard need to be Ethereum-only — the
 * report we publish covers Ethereum mainnet, and DefiLlama's
 * `totalDataChart` rolls all chains together (which inflates Aave V3
 * fees by ~30%, Morpho ~50%, Fluid ~40% relative to the Ethereum-only
 * cut).
 *
 * Falls back to `totalDataChart` when the breakdown is missing — that
 * preserves behavior for protocols that only report a single chain
 * (so the all-chain total IS the Ethereum total). All four lending
 * protocols this dashboard tracks DO expose `totalDataChartBreakdown`.
 */
function extractEthereumDailySeries(r: LlamaFeesResponse | null): DayPoint[] {
  if (!r) return []
  const breakdown = r.totalDataChartBreakdown
  if (Array.isArray(breakdown) && breakdown.length > 0) {
    const out: DayPoint[] = []
    for (const [ts, perChain] of breakdown) {
      const eth = perChain?.Ethereum
      let usd = 0
      if (typeof eth === "number" && Number.isFinite(eth)) {
        usd = eth
      } else if (eth && typeof eth === "object") {
        for (const v of Object.values(eth)) {
          if (typeof v === "number" && Number.isFinite(v)) usd += v
        }
      }
      out.push({ timestamp: ts, usd })
    }
    return out
  }
  // Single-chain protocol fallback — use the all-chain total directly.
  return (r.totalDataChart ?? []).map(([ts, v]) => ({ timestamp: ts, usd: v }))
}

async function fetchFeesSummary(slug: string): Promise<LlamaFeesResponse> {
  return fetchJson<LlamaFeesResponse>(
    `${LLAMA_BASE}/summary/fees/${slug}?dataType=dailyFees`,
  )
}

/** DefiLlama fee sub-categories recipient-of-revenue view. */
export type FeeRecipientType =
  | "dailyFees"              // everything the protocol generates (gross)
  | "dailyUserFees"          // interest paid by borrowers (Tier 1 sector-size metric)
  | "dailySupplySideRevenue" // what suppliers earn
  | "dailyProtocolRevenue"   // what the protocol treasury keeps
  | "dailyHoldersRevenue"    // buybacks / token-holder distributions

export interface FeeBreakdown {
  slug: string
  /** Daily series for each recipient bucket. Missing data types fall back to an empty array. */
  fees: DayPoint[]
  /** Net interest paid by borrowers (Tier 1 metric in the State of DeFi Lending spec). */
  userFees: DayPoint[]
  supplySideRevenue: DayPoint[]
  protocolRevenue: DayPoint[]
  holdersRevenue: DayPoint[]
}

async function fetchFeesByType(slug: string, dataType: FeeRecipientType): Promise<DayPoint[]> {
  try {
    const res = await fetchJson<LlamaFeesResponse>(
      `${LLAMA_BASE}/summary/fees/${slug}?dataType=${dataType}`,
    )
    // Ethereum-only — same convention as fetchProtocolHistory's
    // primary fees series. Recipient-decomposition charts (Revenue
    // page) and the per-protocol cumulative-fees stat both depend on
    // this being chain-scoped.
    return extractEthereumDailySeries(res)
  } catch {
    return []
  }
}

/** Pull all 5 recipient-bucket series in parallel. */
export async function fetchFeeBreakdown(slug: string): Promise<FeeBreakdown> {
  const [fees, userFees, supplySideRevenue, protocolRevenue, holdersRevenue] = await Promise.all([
    fetchFeesByType(slug, "dailyFees"),
    fetchFeesByType(slug, "dailyUserFees"),
    fetchFeesByType(slug, "dailySupplySideRevenue"),
    fetchFeesByType(slug, "dailyProtocolRevenue"),
    fetchFeesByType(slug, "dailyHoldersRevenue"),
  ])
  return { slug, fees, userFees, supplySideRevenue, protocolRevenue, holdersRevenue }
}

/** Fetch history for all protocols in parallel. Failures are swallowed per-protocol so one bad slug doesn't break the page. */
export async function fetchAllProtocolHistory(slugs: string[]): Promise<Array<ProtocolHistory | null>> {
  return Promise.all(
    slugs.map((s) =>
      fetchProtocolHistory(s).catch((err) => {
        console.error(`[defillama] ${s}:`, err.message)
        return null
      }),
    ),
  )
}
