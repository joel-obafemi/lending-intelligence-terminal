/**
 * Compound V3 broken out by Comet market on Ethereum — for Issue 002 §06.5.
 *
 *   npm run query:compound-comet-markets
 *
 * DefiLlama's /protocol/compound-v3 aggregates all Comet markets on
 * Ethereum into a single bucket and does not split by base market. To get
 * the per-Comet breakdown we read the Comet contracts directly.
 *
 * Methodology:
 *   1. For each Comet market on Ethereum, read on-chain:
 *      - baseToken + baseTokenPriceFeed → base symbol + base USD price
 *      - totalSupply, totalBorrow (in base units) → USD by × price
 *      - getUtilization, getSupplyRate, getBorrowRate → util + APYs
 *      - numAssets, getAssetInfo(i), totalsCollateral(asset),
 *        ERC20.symbol/decimals on each collateral, getPrice(priceFeed)
 *        → per-collateral USD supplied
 *   2. Snapshot at the LATEST block. Today is 2026-06-04 vs the target
 *      May 31, so the per-market figures reflect about 4 days of drift.
 *      The reconciliation step compares the sector sum against the
 *      dashboard's $1.61B Ethereum-only Compound V3 card value, which is
 *      also a current-block read.
 *   3. The May-31-specific reconciliation against DefiLlama at-day
 *      figures is surfaced in source.note_reconciliation as a secondary
 *      check.
 *
 * Output: content/snapshots/2026-05-compound-comet-markets.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
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
import { fetchProtocolHistory } from "../lib/defillama"

const OUTPUT_PATH = "content/snapshots/2026-05-compound-comet-markets.json"
const DASHBOARD_CARD_VALUE_USD = 1_610_000_000 // $1.61B Ethereum-only target
const RECONCILE_TOLERANCE_USD = 50_000_000 // $50M per prompt
const SECONDS_PER_YEAR = 60 * 60 * 24 * 365

// ─── Comet market registry on Ethereum mainnet ──────────────────────────
// Addresses cross-referenced against compound-finance/comet
// deployments/mainnet/<market>/roots.json (`comet` field) on
// 2026-06-08. Six folders: usdc, usds, usdt, wbtc, weth, wsteth.
//
// The original Issue 002 snapshot script only enumerated the first four
// markets, missing the wstETH and WBTC bases. The four-Comet framing
// then propagated into §06.5 of the published report, mis-claiming
// Compound had abandoned the ETH-base market. Corrected at the erratum
// pass; see content/snapshots/SOURCE_BRIEF_section_06_5_erratum.md.
interface CometMarket {
  label: string
  address: Address
}
const COMETS: CometMarket[] = [
  { label: "USDC base",   address: getAddress("0xc3d688B66703497DAA19211EEdff47f25384cdc3") },
  { label: "USDT base",   address: getAddress("0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840") },
  { label: "WETH base",   address: getAddress("0xA17581A9E3356d9A858b789D68B4d866e593aE94") },
  { label: "USDS base",   address: getAddress("0x5D409e56D886231aDAf00c8775665AD0f9897b56") },
  { label: "wstETH base", address: getAddress("0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3") },
  { label: "WBTC base",   address: getAddress("0xe85Dc543813B8c2CFEaAc371517b925a166a9293") },
]

// ─── Minimal Comet ABI ──────────────────────────────────────────────────
const cometAbi = [
  { name: "baseToken",            type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "baseTokenPriceFeed",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "totalSupply",          type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalBorrow",          type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getUtilization",       type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getSupplyRate",        type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint64" }] },
  { name: "getBorrowRate",        type: "function", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint64" }] },
  { name: "numAssets",            type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  {
    name: "getAssetInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint8" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "offset",                     type: "uint8" },
          { name: "asset",                      type: "address" },
          { name: "priceFeed",                  type: "address" },
          { name: "scale",                      type: "uint64" },
          { name: "borrowCollateralFactor",     type: "uint64" },
          { name: "liquidateCollateralFactor",  type: "uint64" },
          { name: "liquidationFactor",          type: "uint64" },
          { name: "supplyCap",                  type: "uint128" },
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

// ─── RPC client (same shape as the Sentora script) ──────────────────────
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
  console.log(`  using RPC chain (first wins): ${urls[0]}`)
  cachedClient = createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((u) => http(u, { timeout: 30_000, retryCount: 1, retryDelay: 400 })),
      { rank: false, retryCount: 1 },
    ),
  })
  return cachedClient
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "−" : ""
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`
  return `${sign}$${abs.toFixed(2)}`
}

function fmtPct(v: number, dp = 2): string {
  if (!Number.isFinite(v)) return "—"
  return `${v.toFixed(dp)}%`
}

// Convert per-second rate (scaled 1e18) to APY % (compounded continuously
// is close enough at these magnitudes; Compound docs use simple annualised).
function ratePerSecondToApyPct(ratePerSecondScaled: bigint): number {
  return (Number(ratePerSecondScaled) / 1e18) * SECONDS_PER_YEAR * 100
}

// USD = qty × price / (1e8 × 10^decimals). getPrice returns 1e8-scaled USD.
function quoteUsd(qty: bigint, price: bigint, decimals: number): number {
  return Number(qty) * (Number(price) / 1e8) / 10 ** decimals
}

interface CollateralRow {
  symbol: string
  address: string
  qty: string // human-readable
  usd: number
  share_of_market_collateral: number
}

interface MarketRow {
  label: string
  comet_address: string
  base_symbol: string
  base_address: string
  base_token_price_usd: number
  total_supply_usd: number
  total_borrow_usd: number
  utilization_pct: number
  base_supply_apy_pct: number
  base_borrow_apy_pct: number
  total_collateral_usd: number
  top_3_collateral: CollateralRow[]
  num_collateral_assets: number
  note?: string
}

async function readMarket(c: CometMarket): Promise<MarketRow | { failed: true; label: string; address: string; reason: string }> {
  const client = getClient()
  const r = (fnName: string, args?: any[]) =>
    client.readContract({
      address: c.address,
      abi: cometAbi,
      functionName: fnName as any,
      args: args as any,
    })

  try {
    const [
      baseToken,
      basePriceFeed,
      totalSupplyRaw,
      totalBorrowRaw,
      utilizationRaw,
      numAssetsRaw,
    ] = (await Promise.all([
      r("baseToken"),
      r("baseTokenPriceFeed"),
      r("totalSupply"),
      r("totalBorrow"),
      r("getUtilization"),
      r("numAssets"),
    ])) as [Address, Address, bigint, bigint, bigint, number]

    const [supplyRate, borrowRate, basePriceRaw, baseSymbol, baseDecimals] =
      (await Promise.all([
        r("getSupplyRate", [utilizationRaw]),
        r("getBorrowRate", [utilizationRaw]),
        r("getPrice", [basePriceFeed]),
        client.readContract({ address: baseToken, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: baseToken, abi: erc20Abi, functionName: "decimals" }),
      ])) as [bigint, bigint, bigint, string, number]

    const basePrice = Number(basePriceRaw) / 1e8
    const totalSupplyUsd = quoteUsd(totalSupplyRaw, basePriceRaw, baseDecimals)
    const totalBorrowUsd = quoteUsd(totalBorrowRaw, basePriceRaw, baseDecimals)
    const utilizationPct = (Number(utilizationRaw) / 1e18) * 100

    // Per-collateral reads.
    const collateral: CollateralRow[] = []
    const assetInfoPromises: Array<Promise<any>> = []
    for (let i = 0; i < numAssetsRaw; i++) {
      assetInfoPromises.push(r("getAssetInfo", [i]))
    }
    const assetInfos = (await Promise.all(assetInfoPromises)) as Array<{
      asset: Address
      priceFeed: Address
      scale: bigint
    }>

    // Resolve symbols + decimals + price + balance per asset in parallel.
    const colPerAsset = await Promise.all(
      assetInfos.map(async (ai) => {
        try {
          const [sym, dec, priceRaw, totalsCol] = (await Promise.all([
            client.readContract({ address: ai.asset, abi: erc20Abi, functionName: "symbol" }),
            client.readContract({ address: ai.asset, abi: erc20Abi, functionName: "decimals" }),
            r("getPrice", [ai.priceFeed]),
            r("totalsCollateral", [ai.asset]),
          ])) as [string, number, bigint, [bigint, bigint]]
          const qtyRaw = totalsCol[0]
          const usd = quoteUsd(qtyRaw, priceRaw, dec)
          return {
            symbol: sym,
            address: ai.asset,
            qty: formatUnits(qtyRaw, dec),
            usd,
          }
        } catch (err: any) {
          console.warn(`    [warn] collateral read failed for ${ai.asset}: ${err?.message ?? err}`)
          return null
        }
      }),
    )
    const collateralFiltered = colPerAsset.filter(Boolean) as Array<{
      symbol: string; address: string; qty: string; usd: number
    }>
    const totalCollateralUsd = collateralFiltered.reduce((s, c) => s + c.usd, 0)
    const ranked = collateralFiltered
      .sort((a, b) => b.usd - a.usd)
      .map((c) => ({
        ...c,
        share_of_market_collateral: totalCollateralUsd > 0 ? c.usd / totalCollateralUsd : 0,
      }))
    const top3 = ranked.slice(0, 3)

    return {
      label: c.label,
      comet_address: c.address,
      base_symbol: baseSymbol,
      base_address: baseToken,
      base_token_price_usd: basePrice,
      total_supply_usd: totalSupplyUsd,
      total_borrow_usd: totalBorrowUsd,
      utilization_pct: utilizationPct,
      base_supply_apy_pct: ratePerSecondToApyPct(supplyRate),
      base_borrow_apy_pct: ratePerSecondToApyPct(borrowRate),
      total_collateral_usd: totalCollateralUsd,
      top_3_collateral: top3,
      num_collateral_assets: ranked.length,
    }
  } catch (err: any) {
    return {
      failed: true,
      label: c.label,
      address: c.address,
      reason: err?.message ?? String(err),
    }
  }
}

async function main(): Promise<void> {
  console.log(`Compound V3 by Comet market on Ethereum`)
  console.log("")
  console.log(`[1/3] Reading ${COMETS.length} Comet markets …`)
  const rows = await Promise.all(COMETS.map((c) => readMarket(c)))
  const ok = rows.filter((r): r is MarketRow => !(r as any).failed)
  const failed = rows.filter((r): r is { failed: true; label: string; address: string; reason: string } => (r as any).failed)
  for (const f of failed) {
    console.warn(`  [warn] ${f.label} (${f.address}) failed: ${f.reason}`)
  }
  console.log("")

  console.log(`[2/3] Computing sector reconciliation …`)
  const baseSupplySum = ok.reduce((s, m) => s + m.total_supply_usd, 0)
  const collateralSum = ok.reduce((s, m) => s + m.total_collateral_usd, 0)
  const fullEthereumSum = baseSupplySum + collateralSum
  const dashboardDelta = fullEthereumSum - DASHBOARD_CARD_VALUE_USD
  const reconciles = Math.abs(dashboardDelta) <= RECONCILE_TOLERANCE_USD
  console.log("")

  // Also pull DefiLlama May 31 figure as a cross-check.
  console.log(`[3/3] Cross-checking against DefiLlama Ethereum-only at May 31 …`)
  let defillamaMay31Usd: number | null = null
  let defillamaToday: number | null = null
  try {
    const h = await fetchProtocolHistory("compound-v3")
    const series = [...h.tvl].sort((a, b) => a.timestamp - b.timestamp)
    const mayTs = Math.floor(new Date("2026-05-31T00:00:00Z").getTime() / 1000)
    let mayPick = series[0]
    for (const pt of series) {
      if (pt.timestamp <= mayTs) mayPick = pt
      else break
    }
    defillamaMay31Usd = mayPick?.usd ?? null
    defillamaToday = h.currentTvl
  } catch (err: any) {
    console.warn(`  [warn] DefiLlama cross-check failed: ${err?.message ?? err}`)
  }
  console.log("")

  // ─── Console summary ─────────────────────────────────────────────────
  console.log("── Per-Comet snapshot (latest block, current state) ─────")
  console.log("  Market         Base TS USD     Base TB USD     Util    Supply APY  Borrow APY  Collateral USD")
  for (const m of ok) {
    console.log(
      `  ${m.label.padEnd(13)}  ${fmtUsd(m.total_supply_usd).padEnd(14)}  ${fmtUsd(m.total_borrow_usd).padEnd(14)}  ${fmtPct(m.utilization_pct).padStart(5)}   ${fmtPct(m.base_supply_apy_pct).padStart(8)}   ${fmtPct(m.base_borrow_apy_pct).padStart(8)}   ${fmtUsd(m.total_collateral_usd)}`,
    )
  }
  console.log("")

  console.log("── Top-3 collateral per market ────────────────────────────")
  for (const m of ok) {
    const parts = m.top_3_collateral
      .map((c) => `${c.symbol} ${fmtUsd(c.usd)} (${(c.share_of_market_collateral * 100).toFixed(1)}%)`)
      .join("  ·  ")
    console.log(`  ${m.label.padEnd(13)}  ${parts}`)
  }
  console.log("")

  console.log("── Reconciliation ────────────────────────────────────────")
  console.log(`  Base supply across all markets : ${fmtUsd(baseSupplySum)}`)
  console.log(`  Collateral across all markets  : ${fmtUsd(collateralSum)}`)
  console.log(`  Full Ethereum sum (base+coll)  : ${fmtUsd(fullEthereumSum)}`)
  console.log(`  Dashboard card value (target)  : ${fmtUsd(DASHBOARD_CARD_VALUE_USD)}`)
  console.log(`  Delta vs dashboard             : ${fmtUsd(dashboardDelta)}  (${reconciles ? "WITHIN" : "OUTSIDE"} ±${fmtUsd(RECONCILE_TOLERANCE_USD)})`)
  if (defillamaMay31Usd != null) {
    console.log(`  DefiLlama Ethereum TVL May 31  : ${fmtUsd(defillamaMay31Usd)}`)
  }
  if (defillamaToday != null) {
    console.log(`  DefiLlama Ethereum TVL today   : ${fmtUsd(defillamaToday)}`)
  }
  console.log("")

  // ─── Write JSON ──────────────────────────────────────────────────────
  const out = {
    source: {
      script: "scripts/query-compound-comet-markets.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      data_source:
        "On-chain reads against Compound V3 Comet contracts on Ethereum mainnet (latest block). DefiLlama cross-check via /protocol/compound-v3 chainTvls.Ethereum.",
      methodology:
        "Per Comet market: baseToken + baseTokenPriceFeed for the base USD; totalSupply / totalBorrow / getUtilization for the size + util; getSupplyRate(util) / getBorrowRate(util) annualised at SECONDS_PER_YEAR; numAssets + getAssetInfo + totalsCollateral + getPrice for per-collateral USD. Base USD plus per-collateral USD makes the full Ethereum-side TVL contribution per market.",
      snapshot_caveat:
        "On-chain reads are LATEST-BLOCK (June 4, 2026 as of run time), not May 31. The DefiLlama cross-check field provides the May 31 figure for reconciliation against the issue's anchor date.",
      reconciliation_target_usd: DASHBOARD_CARD_VALUE_USD,
      reconciliation_tolerance_usd: RECONCILE_TOLERANCE_USD,
      note:
        failed.length > 0
          ? `${failed.length} market(s) failed to read: ${failed.map((f) => `${f.label} (${f.reason})`).join("; ")}. Sector sums exclude these markets; reconciliation delta inflates accordingly.`
          : "All Comet markets read successfully.",
    },
    markets: ok,
    failed_markets: failed,
    sector_sum: {
      base_supply_total_usd: baseSupplySum,
      collateral_total_usd: collateralSum,
      full_ethereum_total_usd: fullEthereumSum,
      dashboard_card_value_usd: DASHBOARD_CARD_VALUE_USD,
      delta_vs_dashboard_usd: dashboardDelta,
      reconciles_within_tolerance: reconciles,
      defillama_ethereum_tvl_may_31_usd: defillamaMay31Usd,
      defillama_ethereum_tvl_today_usd: defillamaToday,
    },
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
