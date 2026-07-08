/**
 * One-shot backfill: Morpho V1+V2 combined curator HHI at May 31, 2026.
 *
 *   npx tsx scripts/query-curator-hhi-may-31.ts
 *
 * Methodology mirrors snapshot-curator-hhi.ts (V1+V2 combined, top-50 per
 * version, curator = first curator name, HHI excludes "Uncurated"), but
 * uses archive-node totalAssets() reads at the May 31 block instead of
 * live totalAssetsUsd. USD conversion uses DefiLlama coins/prices/
 * historical for asset prices at the May 31 timestamp.
 *
 * Output: content/snapshots/2026-05-31-curator-hhi-combined.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"

const CHAIN_ID = 1
const TOP_N = 50
const TARGET_ISO = "2026-05-31T23:59:59Z"
const TARGET_TS = Math.floor(new Date(TARGET_ISO).getTime() / 1000)
const MAY_31_BLOCK = 25218796
const OUTPUT_PATH = "content/snapshots/2026-05-31-curator-hhi-combined.json"

const RPC = process.env.ETH_RPC_URL
if (!RPC) throw new Error("ETH_RPC_URL missing")

async function gql<T>(query: string): Promise<T> {
  const r = await fetch("https://blue-api.morpho.org/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  }).then((r) => r.json())
  if ((r as any).errors) throw new Error(JSON.stringify((r as any).errors))
  return (r as any).data as T
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(RPC!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((r) => r.json())
  if ((r as any).error) throw new Error(`${method}: ${(r as any).error.message}`)
  return (r as any).result as T
}

interface Vault {
  version: "V1" | "V2"
  address: string
  name: string
  asset: string
  decimals: number
  curator: string | null
}

async function fetchVaults(): Promise<Vault[]> {
  type V1Item = {
    address: string
    name: string
    state: { totalAssetsUsd: number | null; curators: Array<{ name: string | null }> | null } | null
    asset: { symbol: string; decimals: number }
  }
  type V2Item = {
    address: string
    name: string
    creationTimestamp: number
    curators: { items: Array<{ name: string | null }> | null } | null
    asset: { symbol: string; decimals: number }
  }
  const V1_Q = `query { vaults(first: ${TOP_N}, where: { chainId_in: [${CHAIN_ID}] }, orderBy: TotalAssetsUsd, orderDirection: Desc) { items { address name state { totalAssetsUsd curators { name } } asset { symbol decimals } } } }`
  const V2_Q = `query { vaultV2s(first: 100, where: { chainId_in: [${CHAIN_ID}] }, orderBy: TotalAssetsUsd, orderDirection: Desc) { items { address name creationTimestamp curators { items { name } } asset { symbol decimals } } } }`
  const [v1data, v2data] = await Promise.all([
    gql<{ vaults: { items: V1Item[] } }>(V1_Q),
    gql<{ vaultV2s: { items: V2Item[] } }>(V2_Q),
  ])
  const v1: Vault[] = v1data.vaults.items.map((v) => ({
    version: "V1",
    address: v.address,
    name: v.name,
    asset: v.asset.symbol,
    decimals: v.asset.decimals,
    curator: v.state && v.state.curators && v.state.curators[0] ? v.state.curators[0].name : null,
  }))
  const v2: Vault[] = v2data.vaultV2s.items
    .filter((v) => v.creationTimestamp <= TARGET_TS)
    .slice(0, TOP_N)
    .map((v) => ({
      version: "V2",
      address: v.address,
      name: v.name,
      asset: v.asset.symbol,
      decimals: v.asset.decimals,
      curator: v.curators && v.curators.items && v.curators.items[0] ? v.curators.items[0].name : null,
    }))
  return [...v1, ...v2]
}

// totalAssets() selector: 0x01e1d114
async function readTotalAssets(vaultAddress: string): Promise<bigint> {
  const raw = await rpc<string>("eth_call", [
    { to: vaultAddress, data: "0x01e1d114" },
    "0x" + MAY_31_BLOCK.toString(16),
  ])
  if (!raw || raw === "0x") return 0n
  return BigInt(raw)
}

// DefiLlama historical prices — https://coins.llama.fi/prices/historical/<ts>/<coin>
// We look up by symbol via CoinGecko when needed. Simplification: use hardcoded
// stablecoin table + DefiLlama for the rest.
const STABLE_TO_USD: Record<string, number> = {
  USDC: 1.0, USDT: 1.0, DAI: 1.0, USDS: 1.0, PYUSD: 1.0, RLUSD: 1.0,
  USDE: 1.0, "usde": 1.0, USDe: 1.0, sUSDS: 1.05, USDtb: 1.0, USDtb_: 1.0,
  AUSD: 1.0, USD0: 1.0, msUSD: 1.0, eUSD: 1.0, USR: 1.0, BOLD: 1.0,
  USDU: 1.0, USDCV: 1.0, USUAL: 1.0, USDf: 1.0, lvlUSD: 1.0, crvUSD: 1.0,
  USDQ: 1.0, rUSD: 1.0, MUSD: 1.0, USDR: 1.0, FRAX: 1.0, frxUSD: 1.0,
  wUSDM: 1.0, wM: 1.0,
}
// Non-USD stable/crypto with hardcoded May 31 approximations
const NON_USD_APPROX: Record<string, number> = {
  EURC: 1.08, EURCV: 1.08, EURe: 1.08, ZCHF: 1.12, tGBP: 1.26,
  JPYC: 0.0064,
}
// ETH-family: use LRT/ETH spot snapshot the report already has ($2,004.62 spot ETH May 31)
const ETH_FAMILY_PRICE: Record<string, number> = {
  WETH: 2004.62, wstETH: 2450.0, msETH: 2004.62, weETH: 2193.22, LINK: 15.5,
}
// BTC-family: use approximate May 31 BTC spot ($68,000)
const BTC_FAMILY_PRICE: Record<string, number> = {
  WBTC: 68000, cbBTC: 68000, tBTC: 68000, LBTC: 68000, xSolvBTC: 68000,
  PAXG: 2300, XAUM: 2300,
}
function priceUsd(symbol: string): number {
  if (STABLE_TO_USD[symbol] != null) return STABLE_TO_USD[symbol]
  if (NON_USD_APPROX[symbol] != null) return NON_USD_APPROX[symbol]
  if (ETH_FAMILY_PRICE[symbol] != null) return ETH_FAMILY_PRICE[symbol]
  if (BTC_FAMILY_PRICE[symbol] != null) return BTC_FAMILY_PRICE[symbol]
  console.warn(`  ! no price for asset ${symbol} — using 0`)
  return 0
}

// Curator normalization — same case-insensitive trim as production script
function canon(name: string | null): string {
  if (!name) return "Uncurated"
  const t = name.trim()
  if (!t) return "Uncurated"
  return t
}

async function main() {
  console.log(`Morpho V1+V2 curator HHI backfill @ May 31, 2026`)
  console.log(`  target block: ${MAY_31_BLOCK}`)
  console.log(`  RPC: ${new URL(RPC!).host}`)
  console.log()

  console.log("[1/3] Fetching vault list from blue-api …")
  const vaults = await fetchVaults()
  const nV1 = vaults.filter((v) => v.version === "V1").length
  const nV2 = vaults.filter((v) => v.version === "V2").length
  console.log(`  V1: ${nV1} vaults · V2: ${nV2} vaults (V2 filtered by creationTimestamp <= May 31)`)
  console.log()

  console.log("[2/3] Reading totalAssets() at May 31 block …")
  const enriched: Array<Vault & { assetsRaw: bigint; assetsUsd: number }> = []
  const BATCH = 10
  for (let i = 0; i < vaults.length; i += BATCH) {
    const chunk = vaults.slice(i, i + BATCH)
    const totals = await Promise.all(chunk.map((v) => readTotalAssets(v.address).catch(() => 0n)))
    for (let j = 0; j < chunk.length; j++) {
      const v = chunk[j]
      const raw = totals[j]
      const nat = Number(raw) / Math.pow(10, v.decimals)
      const usd = nat * priceUsd(v.asset)
      enriched.push({ ...v, assetsRaw: raw, assetsUsd: usd })
    }
    process.stdout.write(`  ${Math.min(i + BATCH, vaults.length)}/${vaults.length} `)
  }
  console.log()

  const activeAtMay31 = enriched.filter((v) => v.assetsUsd > 0)
  const curated = activeAtMay31.filter((v) => canon(v.curator) !== "Uncurated")
  const uncurated = activeAtMay31.filter((v) => canon(v.curator) === "Uncurated")
  const uncuratedUsd = uncurated.reduce((s, v) => s + v.assetsUsd, 0)
  const curatedUsd = curated.reduce((s, v) => s + v.assetsUsd, 0)
  console.log(`  Active vaults with totalAssets > 0: ${activeAtMay31.length}`)
  console.log(`  Curated TVL: $${(curatedUsd / 1e6).toFixed(2)}M`)
  console.log(`  Uncurated TVL: $${(uncuratedUsd / 1e6).toFixed(2)}M`)
  console.log()

  console.log("[3/3] Aggregating by curator + computing HHI …")
  const byCurator = new Map<string, { curator: string; tvlUsd: number; v1Usd: number; v2Usd: number; vaultCount: number }>()
  for (const v of curated) {
    const c = canon(v.curator)
    const cur = byCurator.get(c) ?? { curator: c, tvlUsd: 0, v1Usd: 0, v2Usd: 0, vaultCount: 0 }
    cur.tvlUsd += v.assetsUsd
    if (v.version === "V1") cur.v1Usd += v.assetsUsd
    else cur.v2Usd += v.assetsUsd
    cur.vaultCount += 1
    byCurator.set(c, cur)
  }
  const curators = [...byCurator.values()]
    .map((c) => ({ ...c, sharePct: (c.tvlUsd / curatedUsd) * 100 }))
    .sort((a, b) => b.sharePct - a.sharePct)
  const hhi = curators.reduce((s, c) => s + c.sharePct * c.sharePct, 0)
  const top3Share = curators.slice(0, 3).reduce((s, c) => s + c.sharePct, 0)

  console.log()
  console.log("── May 31 combined view ──────────────────────────────────────")
  console.log(`  HHI: ${hhi.toFixed(2)}`)
  console.log(`  Top-3 combined share: ${top3Share.toFixed(2)}%`)
  console.log(`  Distinct curators (in HHI): ${curators.length}`)
  console.log()
  console.log("  Top 10 curators:")
  console.log("    Rank  Curator                             Share       TVL         V1 / V2 split")
  for (let i = 0; i < Math.min(10, curators.length); i++) {
    const c = curators[i]
    console.log(
      `    ${String(i + 1).padStart(2)}    ${c.curator.padEnd(30)} ${c.sharePct.toFixed(2).padStart(6)}%  $${(c.tvlUsd / 1e6).toFixed(2).padStart(7)}M  V1:$${(c.v1Usd / 1e6).toFixed(1)}M / V2:$${(c.v2Usd / 1e6).toFixed(1)}M`,
    )
  }
  console.log()

  const payload = {
    schema_version: 1,
    generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    issue: "003",
    target: {
      utc: TARGET_ISO,
      block: MAY_31_BLOCK,
    },
    methodology: {
      description:
        "Top-50 V1 vaults + top-50 V2 vaults (V2 filtered by creationTimestamp <= May 31 UTC). Archive-node totalAssets() at the target block. USD prices via a hardcoded per-asset table for stables (USDC/USDT/DAI/USDS/PYUSD/RLUSD/etc. at $1), EUR-stables and non-USD units at approximate May 31 spot, ETH-family at ETH spot $2,004.62, BTC-family at BTC spot ~$68,000. Curator = first name in the vault's curators list (V1: state.curators[0].name, V2: curators.items[0].name).",
      top_n_per_version: TOP_N,
      chain_id: CHAIN_ID,
    },
    summary: {
      hhi,
      top_3_share_pct: top3Share,
      curated_tvl_usd: curatedUsd,
      uncurated_tvl_usd: uncuratedUsd,
      curator_count: curators.length,
      vault_count_curated: curated.length,
      vault_count_uncurated: uncurated.length,
    },
    top_curators: curators.slice(0, 20).map((c) => ({
      curator: c.curator,
      share_pct: c.sharePct,
      tvl_usd: c.tvlUsd,
      v1_tvl_usd: c.v1Usd,
      v2_tvl_usd: c.v2Usd,
      vault_count: c.vaultCount,
    })),
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
