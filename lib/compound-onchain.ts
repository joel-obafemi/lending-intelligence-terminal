/**
 * Compound V3 (Comet) on-chain reader — Ethereum mainnet only.
 *
 * Why this exists: DefiLlama's `/protocol/compound-v3` exposes only two
 * Ethereum-level aggregates (`chainTvls.Ethereum`, `chainTvls.Ethereum-borrowed`).
 * The Aave-style formula `totalSupply = tvl + borrowed` assumes
 * `chainTvls.Ethereum` is the unborrowed-liquidity slice; for Compound V3
 * the DefiLlama figure carries different price assumptions and reports a
 * total that diverges from on-chain by roughly $180M (current snapshot) /
 * $340M (May 31, 2026 snapshot), inflating the protocol card.
 *
 * This module reads every Comet market on Ethereum directly and returns
 * the canonical totals:
 *   - tvl       = base available + collateral USD  (matches Aave's tvl semantics)
 *   - borrowed  = base borrowed USD                (matches Aave's borrowed semantics)
 *   - supplied  = tvl + borrowed = X + C
 *
 * Same shape as `lib/aave-style-onchain.ts`'s `AaveStyleReserve` sum, so
 * the downstream override branches in lib/overview.ts and
 * lib/protocol-detail.ts can use the on-chain numbers as a drop-in.
 */
import {
  createPublicClient,
  erc20Abi,
  fallback,
  getAddress,
  http,
  type Address,
  type PublicClient,
} from "viem"
import { mainnet } from "viem/chains"

interface CometMarket {
  label: string
  address: Address
}

// Ethereum mainnet Comet deployments. Sourced from Compound's deployment
// list and the addresses in scripts/query-compound-comet-markets.ts which
// reconcile against on-chain `baseToken()` for each market.
const COMETS: CometMarket[] = [
  { label: "USDC base", address: getAddress("0xc3d688B66703497DAA19211EEdff47f25384cdc3") },
  { label: "USDT base", address: getAddress("0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840") },
  { label: "WETH base", address: getAddress("0xA17581A9E3356d9A858b789D68B4d866e593aE94") },
  { label: "USDS base", address: getAddress("0x5D409e56D886231aDAf00c8775665AD0f9897b56") },
]

// Minimal Comet ABI we need. Compound's Comet ABI is large; we only
// reach for the views the overview / detail page surfaces.
const cometAbi = [
  { name: "baseToken",          type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "baseTokenPriceFeed", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "totalSupply",        type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalBorrow",        type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "numAssets",          type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    name: "getAssetInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint8" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "offset",                    type: "uint8" },
          { name: "asset",                     type: "address" },
          { name: "priceFeed",                 type: "address" },
          { name: "scale",                     type: "uint64" },
          { name: "borrowCollateralFactor",    type: "uint64" },
          { name: "liquidateCollateralFactor", type: "uint64" },
          { name: "liquidationFactor",         type: "uint64" },
          { name: "supplyCap",                 type: "uint128" },
        ],
      },
    ],
  },
  {
    name: "totalsCollateral",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { name: "totalSupplyAsset", type: "uint128" },
      { name: "_reserved",        type: "uint64"  },
    ],
  },
  { name: "getPrice", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const

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

function quoteUsd(qty: bigint, price: bigint, decimals: number): number {
  // Comet getPrice is 1e8-scaled (Chainlink convention).
  return (Number(qty) * (Number(price) / 1e8)) / 10 ** decimals
}

export interface CompoundCometSummary {
  /** Market label, e.g. "USDC base". */
  label: string
  /** Comet contract address. */
  cometAddress: string
  /** Base asset symbol (USDC, USDT, WETH, USDS). */
  baseSymbol: string
  /** Total base supply in USD (X — includes borrowed-out portion). */
  baseSuppliedUsd: number
  /** Base borrowed USD (Y). */
  baseBorrowedUsd: number
  /** Collateral USD deposited (C — independent of base). */
  collateralUsd: number
}

export interface CompoundEthereumOnChain {
  /** Base available + collateral USD, summed across all four Comets.
   *  This is the tvl-equivalent figure (matches Aave's convention where
   *  tvl = unborrowed liquidity).
   *
   *  tvl = Σ((baseSuppliedUsd − baseBorrowedUsd) + collateralUsd)
   */
  tvl: number
  /** Base borrowed USD, summed across all four Comets. */
  borrowed: number
  /** Total supplied = tvl + borrowed = Σ(baseSuppliedUsd + collateralUsd). */
  supplied: number
  /** Per-market detail for downstream callers that need the breakdown. */
  perMarket: CompoundCometSummary[]
  /** Markets that failed on-chain reads (RPC blip, contract revert, etc.). */
  failedMarkets: Array<{ label: string; address: string; reason: string }>
}

/**
 * Read every Comet market on Ethereum and roll up the canonical totals.
 *
 * Returns `null` if EVERY market fails — callers should fall back to the
 * DefiLlama-derived numbers in that case. Partial failures still return a
 * value; the affected markets surface in `failedMarkets`.
 */
export async function loadCompoundEthereumOnChain(): Promise<CompoundEthereumOnChain | null> {
  const client = getClient()
  const results = await Promise.all(
    COMETS.map(async (c) => {
      const r = (fn: string, args?: any[]) =>
        client.readContract({
          address: c.address,
          abi: cometAbi,
          functionName: fn as any,
          args: args as any,
        })
      try {
        const [baseToken, basePriceFeed, totalSupplyRaw, totalBorrowRaw, numAssetsRaw] =
          (await Promise.all([
            r("baseToken"),
            r("baseTokenPriceFeed"),
            r("totalSupply"),
            r("totalBorrow"),
            r("numAssets"),
          ])) as [Address, Address, bigint, bigint, number]

        const [baseSymbol, baseDecimals, basePriceRaw] = (await Promise.all([
          client.readContract({ address: baseToken, abi: erc20Abi, functionName: "symbol" }),
          client.readContract({ address: baseToken, abi: erc20Abi, functionName: "decimals" }),
          r("getPrice", [basePriceFeed]),
        ])) as [string, number, bigint]

        const baseSuppliedUsd = quoteUsd(totalSupplyRaw, basePriceRaw, baseDecimals)
        const baseBorrowedUsd = quoteUsd(totalBorrowRaw, basePriceRaw, baseDecimals)

        // Collateral loop. Compound exposes assets by index; each carries
        // its own price feed so we re-use getPrice rather than going to
        // an external oracle.
        const assetInfos: any[] = []
        for (let i = 0; i < numAssetsRaw; i++) {
          assetInfos.push(await r("getAssetInfo", [i]))
        }

        let collateralUsd = 0
        for (const ai of assetInfos as Array<{ asset: Address; priceFeed: Address }>) {
          try {
            const [dec, priceRaw, totalsCol] = (await Promise.all([
              client.readContract({ address: ai.asset, abi: erc20Abi, functionName: "decimals" }),
              r("getPrice", [ai.priceFeed]),
              r("totalsCollateral", [ai.asset]),
            ])) as [number, bigint, [bigint, bigint]]
            const qty = totalsCol[0]
            collateralUsd += quoteUsd(qty, priceRaw, dec)
          } catch {
            // Single collateral asset failures degrade the market's
            // collateral total but should not nuke the whole market read.
          }
        }

        const summary: CompoundCometSummary = {
          label: c.label,
          cometAddress: c.address,
          baseSymbol,
          baseSuppliedUsd,
          baseBorrowedUsd,
          collateralUsd,
        }
        return { ok: true as const, summary }
      } catch (err: any) {
        return {
          ok: false as const,
          failed: { label: c.label, address: c.address, reason: err?.message ?? String(err) },
        }
      }
    }),
  )

  const perMarket: CompoundCometSummary[] = []
  const failedMarkets: Array<{ label: string; address: string; reason: string }> = []
  for (const r of results) {
    if (r.ok) perMarket.push(r.summary)
    else failedMarkets.push(r.failed)
  }
  if (perMarket.length === 0) return null

  let borrowed = 0
  let tvl = 0
  for (const m of perMarket) {
    borrowed += m.baseBorrowedUsd
    // tvl = (base available) + collateral, where base available = supplied − borrowed.
    tvl += Math.max(0, m.baseSuppliedUsd - m.baseBorrowedUsd) + m.collateralUsd
  }
  const supplied = tvl + borrowed

  return { tvl, borrowed, supplied, perMarket, failedMarkets }
}
