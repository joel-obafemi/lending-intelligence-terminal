/**
 * Euler V2 (EVK) on-chain reader — Ethereum mainnet only.
 *
 * Built to mirror lib/compound-onchain.ts after that audit revealed
 * DefiLlama's `chainTvls.<chain> + chainTvls.<chain>-borrowed` formula
 * can diverge materially from on-chain truth when the protocol holds
 * collateral assets priced off-market in the DefiLlama adapter.
 *
 * Data path:
 *   1. Discover the ACTIVE Ethereum EVK vault list via DefiLlama
 *      Yields /pools (project=euler-v2, chain=Ethereum). The Goldsky
 *      subgraph carries 800+ historical vault entities including
 *      retired/empty ones; /pools is naturally pre-filtered to vaults
 *      with positive activity (about 57 at audit time).
 *   2. Match each /pools `poolMeta` (e.g. "EVK Vault eUSDC-80") back to
 *      its on-chain vault address via the Goldsky `eulerVaults` entity
 *      (the same subgraph scripts/query-euler-vault-curators.ts uses).
 *      The subgraph row carries `symbol` and `evault` (address); we
 *      build a symbol → address map.
 *   3. For each active vault, read `totalAssets()` and `totalBorrows()`
 *      on-chain. EVK vaults are ERC4626-shaped; the asset they hold is
 *      the lending/deposit asset and totalBorrows is the corresponding
 *      borrow side. Quantities are in the asset's native decimals.
 *   4. Resolve the underlying asset via `asset()`, then symbol +
 *      decimals via ERC20 reads; fetch USD prices via DefiLlama's
 *      /coins/prices/current endpoint (same source the Yields adapter
 *      uses).
 *   5. Sum:
 *        supplied = Σ (totalAssets   × price)
 *        borrowed = Σ (totalBorrows  × price)
 *        tvl      = supplied − borrowed
 *
 * Returns null if discovery or every vault read fails, so callers can
 * fall back to the DefiLlama protocol-level numbers.
 */
import {
  createPublicClient,
  erc20Abi,
  fallback,
  formatUnits,
  getAddress,
  http,
  type Address,
  type PublicClient,
} from "viem"
import { mainnet } from "viem/chains"

const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn"

// Dedicated RPC chain — mirrors lib/compound-onchain.ts. The shared
// lib/eth-rpc.ts client uses Ankr first, which returns "Internal error"
// (not a clean revert) on EVK vault calls. publicnode + merkle handle
// EVK reads cleanly; we keep the rest of the chain as fallbacks.
const PUBLIC_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.merkle.io",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
  "https://1rpc.io/eth",
]
let cachedClient: PublicClient | null = null
function getClient(): PublicClient {
  if (cachedClient) return cachedClient
  const override = process.env.ETH_RPC_URL?.trim()
  const urls = override ? [override, ...PUBLIC_RPCS] : PUBLIC_RPCS
  cachedClient = createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((u) => http(u, { timeout: 30_000, retryCount: 1, retryDelay: 400 })),
      { rank: false, retryCount: 1 },
    ),
  })
  return cachedClient
}

const evkAbi = [
  { name: "totalAssets",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalBorrows", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "asset",        type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const

interface SubgraphVault {
  id: string
  evault: string
  symbol: string
}

interface YieldPoolRow {
  pool: string
  chain: string
  project: string
  symbol: string
  poolMeta: string | null
  tvlUsd: number | null
  underlyingTokens: string[] | null
}

/** Extract the EVK label out of "EVK Vault eUSDC-80" → "eUSDC-80". */
function extractVaultSymbol(poolMeta: string | null): string | null {
  if (!poolMeta) return null
  const m = poolMeta.match(/^EVK Vault (.+)$/)
  return m ? m[1].trim() : poolMeta.trim()
}

async function fetchActivePoolsEth(): Promise<YieldPoolRow[]> {
  try {
    const r = await fetch("https://yields.llama.fi/pools")
    if (!r.ok) {
      console.error(`[euler-onchain] /pools HTTP ${r.status}`)
      return []
    }
    const j = (await r.json()) as { data: any[] }
    return j.data.filter(
      (p) => p.project === "euler-v2" && p.chain === "Ethereum",
    ) as YieldPoolRow[]
  } catch (err: any) {
    console.error(`[euler-onchain] /pools fetch failed: ${err?.message ?? err}`)
    return []
  }
}

async function fetchVaultRegistry(): Promise<SubgraphVault[]> {
  // Paginate Goldsky for the full vault list (≈800 rows at audit time).
  const PAGE = 1000
  const query = `query AllVaults($skip: Int!) {
    eulerVaults(first: ${PAGE}, skip: $skip) {
      id
      evault
      symbol
    }
  }`
  const out: SubgraphVault[] = []
  for (let skip = 0; skip < 5000; skip += PAGE) {
    try {
      const r = await fetch(SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { skip } }),
      })
      if (!r.ok) {
        console.error(`[euler-onchain] subgraph HTTP ${r.status} at skip=${skip}`)
        break
      }
      const body = (await r.json()) as {
        data?: { eulerVaults?: SubgraphVault[] }
        errors?: Array<{ message: string }>
      }
      if (body.errors?.length) {
        console.error("[euler-onchain] subgraph errors: " + body.errors.map((e) => e.message).join("; "))
        break
      }
      const page = body.data?.eulerVaults ?? []
      if (page.length === 0) break
      out.push(...page)
      if (page.length < PAGE) break
    } catch (err: any) {
      console.error(`[euler-onchain] subgraph fetch failed: ${err?.message ?? err}`)
      break
    }
  }
  return out
}

interface PriceMap {
  [lowercaseAddress: string]: number
}

async function fetchPricesUsd(
  assetAddresses: string[],
  /** When provided, hits /coins/prices/historical/{timestamp} instead of /current. */
  priceTimestampSec?: number,
): Promise<PriceMap> {
  const unique = [...new Set(assetAddresses.map((a) => a.toLowerCase()))]
  const out: PriceMap = {}
  const CHUNK = 40
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK)
    const keys = chunk.map((a) => `ethereum:${a}`).join(",")
    const url =
      priceTimestampSec != null
        ? `https://coins.llama.fi/prices/historical/${priceTimestampSec}/${keys}`
        : `https://coins.llama.fi/prices/current/${keys}`
    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.error(`[euler-onchain] price fetch HTTP ${res.status} (${priceTimestampSec ? "historical" : "current"})`)
        continue
      }
      const json = (await res.json()) as {
        coins?: Record<string, { price?: number }>
      }
      for (const [key, info] of Object.entries(json.coins ?? {})) {
        const addr = key.replace(/^ethereum:/, "").toLowerCase()
        if (info?.price != null && Number.isFinite(info.price)) {
          out[addr] = info.price
        }
      }
    } catch (err: any) {
      console.error(`[euler-onchain] price fetch failed: ${err?.message ?? err}`)
    }
  }
  return out
}

/** Run async work in chunks so public RPCs don't get hammered. */
async function chunked<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const r = await Promise.all(chunk.map(fn))
    out.push(...r)
  }
  return out
}

export interface EulerVaultSummary {
  vaultAddress: string
  symbol: string
  underlyingAddress: string
  underlyingSymbol: string
  totalAssetsUsd: number
  totalBorrowsUsd: number
}

export interface EulerEthereumOnChain {
  /** Aave-convention available liquidity = supplied − borrowed. */
  tvl: number
  /** Total borrowed USD across all Ethereum EVK vaults. */
  borrowed: number
  /** Total deposit liquidity supplied USD across all Ethereum EVK vaults. */
  supplied: number
  /** Per-vault breakdown for downstream callers. */
  perVault: EulerVaultSummary[]
  /** Vaults that failed reads (RPC blip, missing asset/price, no subgraph match, …). */
  failedVaults: Array<{ vaultAddress: string; symbol: string; reason: string }>
  /** Active vault count from DefiLlama /pools (before any read failures). */
  activeVaultCount: number
  /** Vaults that had no bytecode at the requested block — i.e. not yet
   *  deployed at the historical block. Only populated when blockNumber is
   *  provided. Distinct from failedVaults so a caller can show the
   *  "deployment gap" cleanly. */
  notDeployedAtBlock: Array<{ vaultAddress: string; symbol: string }>
  /** Echoes back the block number used. undefined means "latest". */
  blockNumber: bigint | undefined
}

export interface EulerLoadOptions {
  /** Read at this historical block. Defaults to "latest". */
  blockNumber?: bigint
  /** Unix-seconds timestamp for DefiLlama historical prices. When
   *  omitted, /coins/prices/current is used. Should match the block's
   *  timestamp when reading at a historical block. */
  priceTimestampSec?: number
}

export async function loadEulerEthereumOnChain(
  opts?: EulerLoadOptions,
): Promise<EulerEthereumOnChain | null> {
  const blockNumber = opts?.blockNumber
  const priceTimestampSec = opts?.priceTimestampSec
  const [activePools, registry] = await Promise.all([
    fetchActivePoolsEth(),
    fetchVaultRegistry(),
  ])
  if (activePools.length === 0) {
    console.error("[euler-onchain] no active pools discovered — returning null")
    return null
  }
  if (registry.length === 0) {
    console.error("[euler-onchain] subgraph empty — returning null")
    return null
  }

  // Build symbol → on-chain vault address map from the subgraph registry.
  const addrBySymbol = new Map<string, string>()
  for (const v of registry) {
    if (v.symbol && v.evault) addrBySymbol.set(v.symbol, v.evault.toLowerCase())
  }

  // Resolve each active pool to a vault address via the subgraph match.
  interface ActiveTarget {
    vaultAddress: Address | null
    poolSymbol: string | null // e.g. "eUSDC-80"
    poolUnderlyingTokens: string[] | null
    poolMeta: string | null
    poolTvlUsd: number | null
  }
  const targets: ActiveTarget[] = activePools.map((p) => {
    const sym = extractVaultSymbol(p.poolMeta)
    const lc = sym ? addrBySymbol.get(sym) : undefined
    let addr: Address | null = null
    if (lc) {
      try {
        addr = getAddress(lc)
      } catch {
        addr = null
      }
    }
    return {
      vaultAddress: addr,
      poolSymbol: sym,
      poolUnderlyingTokens: p.underlyingTokens ?? null,
      poolMeta: p.poolMeta,
      poolTvlUsd: p.tvlUsd,
    }
  })

  const client: PublicClient = getClient()

  // ─── Stage 1: read totalAssets / totalBorrows / asset() per vault ────
  // Chunked at 20 to stay friendly with public RPC rate limits while
  // keeping the wall-clock under ~30s for ~60 vaults.
  //
  // When called at a historical block, some vaults from the May-31-era
  // /pools snapshot may not have existed yet. We do a one-shot bytecode
  // check at the requested block per vault FIRST so we can classify
  // "not deployed at block" distinctly from "RPC blip" or "vault now
  // self-destructed". Skips the bytecode probe entirely when reading
  // latest (saves 1 call per vault).
  const stage1 = await chunked(targets, 20, async (t) => {
    if (!t.vaultAddress) {
      return { ok: false as const, target: t, reason: "no subgraph match", notDeployed: false }
    }
    if (blockNumber != null) {
      try {
        const bc = await client.getBytecode({
          address: t.vaultAddress,
          blockNumber,
        })
        if (!bc || bc === "0x") {
          return {
            ok: false as const,
            target: t,
            reason: "not deployed at block",
            notDeployed: true,
          }
        }
      } catch (err: any) {
        // Bytecode probe failure: fall through to the read attempt so
        // a single bad RPC call doesn't drop the vault entirely.
      }
    }
    try {
      const readOpts = blockNumber != null ? { blockNumber } : {}
      const [totalAssetsRaw, totalBorrowsRaw, assetAddrRaw] = (await Promise.all([
        client.readContract({ address: t.vaultAddress, abi: evkAbi, functionName: "totalAssets", ...readOpts }),
        client.readContract({ address: t.vaultAddress, abi: evkAbi, functionName: "totalBorrows", ...readOpts }),
        client.readContract({ address: t.vaultAddress, abi: evkAbi, functionName: "asset", ...readOpts }),
      ])) as [bigint, bigint, Address]
      return {
        ok: true as const,
        target: t,
        totalAssetsRaw,
        totalBorrowsRaw,
        assetAddr: assetAddrRaw,
      }
    } catch (err: any) {
      return {
        ok: false as const,
        target: t,
        reason: err?.message ?? String(err),
        notDeployed: false,
      }
    }
  })

  const successful = stage1.filter((r) => r.ok) as Array<{
    ok: true
    target: ActiveTarget
    totalAssetsRaw: bigint
    totalBorrowsRaw: bigint
    assetAddr: Address
  }>
  const failed1 = stage1.filter((r) => !r.ok) as Array<{
    ok: false
    target: ActiveTarget
    reason: string
    notDeployed: boolean
  }>

  // ─── Stage 2: resolve unique asset decimals + symbol + USD price ────
  // Token contracts (USDC, USDT, …) are stable and exist at every block
  // of interest, so we don't pass `blockNumber` for the ERC20 metadata
  // reads — that would just slow them down. Prices are time-anchored
  // via the historical endpoint when `priceTimestampSec` is set.
  const uniqueAssets = [...new Set(successful.map((r) => r.assetAddr.toLowerCase()))]
  const assetMetaResults = await chunked(uniqueAssets, 20, async (addrLower) => {
    const addr = getAddress(addrLower)
    try {
      const [symbol, decimals] = (await Promise.all([
        client.readContract({ address: addr, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: addr, abi: erc20Abi, functionName: "decimals" }),
      ])) as [string, number]
      return { addrLower, symbol, decimals }
    } catch (err: any) {
      return { addrLower, symbol: null as any, decimals: null as any, error: err?.message ?? String(err) }
    }
  })
  const assetMeta = new Map<string, { symbol: string; decimals: number }>()
  for (const m of assetMetaResults) {
    if (m.symbol != null && m.decimals != null) {
      assetMeta.set(m.addrLower, { symbol: m.symbol, decimals: m.decimals })
    }
  }
  const prices = await fetchPricesUsd(uniqueAssets, priceTimestampSec)

  // ─── Stage 3: aggregate USD per vault ────────────────────────────────
  const perVault: EulerVaultSummary[] = []
  const failedVaults: Array<{ vaultAddress: string; symbol: string; reason: string }> = []
  const notDeployedAtBlock: Array<{ vaultAddress: string; symbol: string }> = []
  for (const f of failed1) {
    if (f.notDeployed) {
      notDeployedAtBlock.push({
        vaultAddress: f.target.vaultAddress ?? "(unresolved)",
        symbol: f.target.poolSymbol ?? f.target.poolMeta ?? "",
      })
    } else {
      failedVaults.push({
        vaultAddress: f.target.vaultAddress ?? "(unresolved)",
        symbol: f.target.poolSymbol ?? f.target.poolMeta ?? "",
        reason: f.reason,
      })
    }
  }
  for (const r of successful) {
    const lc = r.assetAddr.toLowerCase()
    const meta = assetMeta.get(lc)
    const price = prices[lc]
    if (!meta || price == null) {
      failedVaults.push({
        vaultAddress: r.target.vaultAddress ?? "(unresolved)",
        symbol: r.target.poolSymbol ?? r.target.poolMeta ?? "",
        reason: !meta ? "underlying meta missing" : "price missing",
      })
      continue
    }
    const totalAssetsHuman = Number(formatUnits(r.totalAssetsRaw, meta.decimals))
    const totalBorrowsHuman = Number(formatUnits(r.totalBorrowsRaw, meta.decimals))
    perVault.push({
      vaultAddress: r.target.vaultAddress as string,
      symbol: r.target.poolSymbol ?? r.target.poolMeta ?? "",
      underlyingAddress: r.assetAddr,
      underlyingSymbol: meta.symbol,
      totalAssetsUsd: totalAssetsHuman * price,
      totalBorrowsUsd: totalBorrowsHuman * price,
    })
  }

  if (perVault.length === 0) return null

  let supplied = 0
  let borrowed = 0
  for (const v of perVault) {
    supplied += v.totalAssetsUsd
    borrowed += v.totalBorrowsUsd
  }
  const tvl = Math.max(0, supplied - borrowed)

  return {
    tvl,
    borrowed,
    supplied,
    perVault: perVault.sort((a, b) => b.totalAssetsUsd - a.totalAssetsUsd),
    failedVaults,
    activeVaultCount: activePools.length,
    notDeployedAtBlock,
    blockNumber,
  }
}
