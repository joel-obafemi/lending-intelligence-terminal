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

  const feesSeries = feesJson?.totalDataChart ?? []
  const feePoints: DayPoint[] = feesSeries.map(([ts, v]) => ({ timestamp: ts, usd: v }))
  const fees24h = feePoints.at(-1)?.usd ?? 0
  const fees7d = feePoints.slice(-7).reduce((s, p) => s + p.usd, 0)

  const userFeesSeries = userFeesJson?.totalDataChart ?? []
  let userFeePoints: DayPoint[] = userFeesSeries.map(([ts, v]) => ({ timestamp: ts, usd: v }))
  // Fallback: DefiLlama exposes dailyUserFees only for some protocols (Fluid
  // returns it, Aave V3 / Spark / Morpho don't have a dedicated stream and
  // 404). For lending protocols, dailyFees is overwhelmingly borrow interest
  // anyway (flash loan + liquidation contributions are small), so use it as
  // the user-fees proxy when the dedicated series is missing. The methodology
  // tooltip on the headline counter calls this out.
  if (userFeePoints.length === 0 && feePoints.length > 0) {
    userFeePoints = feePoints
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
    return {
      pool: p.pool,
      chain: p.chain,
      project: p.project,
      symbol: (p.symbol || "").toUpperCase(),
      tvlUsd: p.tvlUsd,
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
  /** [ [unix_ts, usd], ... ] */
  totalDataChart: Array<[number, number]>
  total24h?: number
  total7d?: number
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
    return (res.totalDataChart ?? []).map(([ts, v]) => ({ timestamp: ts, usd: v }))
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
