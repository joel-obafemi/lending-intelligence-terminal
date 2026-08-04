/**
 * One-shot — classify every SparkLend reserve's interest-rate mechanism, to
 * settle whether SparkLend runs uniformly on a Sky-linked rate primitive
 * (as the §01 Pass-1 draft implies) or only its USDC (and maybe USDS/DAI)
 * markets do, with the rest on standard Aave utilization curves.
 *
 *   npm run query:spark-reserve-mechanism
 *
 * ── Method (methodology: on_chain_sparklend_irm) ────────────────────────
 * SparkLend is an Aave-V3 fork. From the Pool (getReservesList +
 * getReserveData) we read each reserve's interestRateStrategyAddress and
 * current variable borrow rate. For each unique strategy we:
 *   - read its bytecode and check for a reference to Sky's sUSDS
 *     (0xa393…7fbD) — SparkLend's Sky-linked strategies price their base
 *     rate off a rate source that reads the Sky Savings Rate;
 *   - probe standard Aave IRM getters (slopes, optimal usage) AND
 *     Sky/rate-source getters (RATE_SOURCE, getBaseVariableBorrowRateSpread,
 *     ssr, susds, pot), following any RATE_SOURCE() address one level to
 *     check ITS bytecode for sUSDS too.
 * Classification: sky_linked if a Sky/sUSDS reference is found; else
 * utilization_curve if it exposes slope1+slope2; else unknown (ABI reported).
 *
 * We then read each reserve's borrow rate + utilization at six day-end
 * (23:59 UTC) blocks around the two July rate-step days (Jul 6 Spark-specific,
 * Jul 23 the Atlas Edit spell) to corroborate: a rate that moved on an event
 * day while utilization held is externally-anchored, not utilization-cleared.
 *
 * Output: content/snapshots/2026-07-spark-reserve-mechanism.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  type Address,
  type PublicClient,
} from "viem"
import { mainnet } from "viem/chains"

// ─── Constants ───────────────────────────────────────────────────────────
const SPARK_POOL = "0xC13e21B648A5Ee794902342038FF3aDAB66BE987" as Address
const SUSDS = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD" as Address
const SUSDS_NEEDLE = SUSDS.slice(2).toLowerCase() // for bytecode search
const OUTPUT_PATH = "content/snapshots/2026-07-spark-reserve-mechanism.json"
const PROBE_DATES = ["2026-07-01", "2026-07-05", "2026-07-06", "2026-07-22", "2026-07-24", "2026-07-31"]
const MOVE_BPS = 5 // |Δ borrow rate| counted as a material "move" (filters ETH-market daily jitter; the Sky steps were all ~18 bps)
const UTIL_STABLE_PP = 5 // |Δ utilization| within this = "stable"

const PUBLIC_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.merkle.io",
  "https://rpc.ankr.com/eth",
]
const RAY = 1e27
const SEC_YEAR = 31_536_000
const rayToApyPct = (ray: bigint) => ((1 + Number(ray) / RAY / SEC_YEAR) ** SEC_YEAR - 1) * 100

function makeClient(): PublicClient {
  const override = process.env.ETH_RPC_URL?.trim()
  const urls = override ? [override, ...PUBLIC_RPCS] : PUBLIC_RPCS
  return createPublicClient({
    chain: mainnet,
    transport: fallback(urls.map((u) => http(u, { timeout: 30_000, retryCount: 2, retryDelay: 500 })), { rank: false }),
    batch: { multicall: true },
  })
}

// ─── ABIs ────────────────────────────────────────────────────────────────
const reserveDataOutputs = [
  {
    type: "tuple",
    components: [
      { name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] },
      { name: "liquidityIndex", type: "uint128" },
      { name: "currentLiquidityRate", type: "uint128" },
      { name: "variableBorrowIndex", type: "uint128" },
      { name: "currentVariableBorrowRate", type: "uint128" },
      { name: "currentStableBorrowRate", type: "uint128" },
      { name: "lastUpdateTimestamp", type: "uint40" },
      { name: "id", type: "uint16" },
      { name: "aTokenAddress", type: "address" },
      { name: "stableDebtTokenAddress", type: "address" },
      { name: "variableDebtTokenAddress", type: "address" },
      { name: "interestRateStrategyAddress", type: "address" },
      { name: "accruedToTreasury", type: "uint128" },
      { name: "unbacked", type: "uint128" },
      { name: "isolationModeTotalDebt", type: "uint128" },
    ],
  },
] as const
const poolAbi = [
  { name: "getReservesList", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
  { name: "getReserveData", type: "function", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: reserveDataOutputs },
] as const
const erc20Abi = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const

// Probe functions — Aave-standard + Sky/rate-source candidates. All uint256
// unless noted; address ones return address.
const uintFns = [
  "getVariableRateSlope1", "getVariableRateSlope2", "getBaseVariableBorrowRate",
  "OPTIMAL_USAGE_RATIO", "getMaxVariableBorrowRate", "getBaseVariableBorrowRateSpread", "ssr",
] as const
const addrFns = ["RATE_SOURCE", "rateSource", "susds", "pot"] as const
const uintFnAbi = (name: string) => ({ name, type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }) as const
const addrFnAbi = (name: string) => ({ name, type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }) as const

// ─── Helpers ─────────────────────────────────────────────────────────────
async function blockForTs(c: PublicClient, targetTs: number, ln: bigint, lt: number): Promise<bigint> {
  let est = ln - BigInt(Math.round((lt - targetTs) / 12))
  if (est < 1n) est = 1n
  const b = await c.getBlock({ blockNumber: est })
  let cor = est + BigInt(Math.round((targetTs - Number(b.timestamp)) / 12))
  return cor < 1n ? 1n : cor
}
async function bytecodeRefsSusds(c: PublicClient, addr: Address): Promise<boolean> {
  try {
    const bc = await c.getBytecode({ address: addr })
    return !!bc && bc.toLowerCase().includes(SUSDS_NEEDLE)
  } catch {
    return false
  }
}

interface ReserveOut {
  asset_symbol: string
  asset_address: Address
  reserve_address: Address
  irm_strategy_address: Address
  irm_type: "sky_linked" | "utilization_curve" | "unknown"
  sky_linked_evidence: string[] | null
  borrow_rate_pct_by_date: Record<string, number | null>
  utilization_pct_by_date: Record<string, number | null>
  moved_jul23: boolean
  moved_jul6: boolean
  moved_on_sky_event_days: boolean
  notes: string
}

async function main(): Promise<void> {
  const c = makeClient()
  const latest = await c.getBlock()
  const latestNum = latest.number!
  const latestTs = Number(latest.timestamp)

  console.log("SparkLend per-reserve rate-mechanism classification")
  console.log(`  pool: ${SPARK_POOL}`)
  console.log("")

  // ─── [1] Enumerate reserves ────────────────────────────────────────────
  const reserves = (await c.readContract({ address: SPARK_POOL, abi: poolAbi, functionName: "getReservesList" })) as Address[]
  console.log(`[1/4] ${reserves.length} reserves`)

  // Per-reserve current data (latest block, via multicall)
  const rd = (await c.multicall({
    contracts: reserves.map((a) => ({ address: SPARK_POOL, abi: poolAbi, functionName: "getReserveData", args: [a] })),
    allowFailure: true,
  })) as any[]
  const sym = (await c.multicall({
    contracts: reserves.map((a) => ({ address: a, abi: erc20Abi, functionName: "symbol" })),
    allowFailure: true,
  })) as any[]

  interface Meta { asset: Address; symbol: string; irm: Address; aToken: Address; vDebt: Address }
  const metas: Meta[] = reserves.map((a, i) => ({
    asset: a,
    symbol: sym[i]?.status === "success" ? String(sym[i].result) : a.slice(0, 8),
    irm: rd[i]?.status === "success" ? getAddress(rd[i].result.interestRateStrategyAddress) : ("0x0000000000000000000000000000000000000000" as Address),
    aToken: rd[i]?.status === "success" ? getAddress(rd[i].result.aTokenAddress) : ("0x0000000000000000000000000000000000000000" as Address),
    vDebt: rd[i]?.status === "success" ? getAddress(rd[i].result.variableDebtTokenAddress) : ("0x0000000000000000000000000000000000000000" as Address),
  }))

  // ─── [2] Classify each unique IRM strategy ─────────────────────────────
  console.log("[2/4] Classifying unique interest-rate strategies …")
  const uniqueIrms = [...new Set(metas.map((m) => m.irm.toLowerCase()))].map((s) => getAddress(s))
  const irmClass = new Map<string, { type: ReserveOut["irm_type"]; evidence: string[]; probes: Record<string, string> }>()
  for (const irm of uniqueIrms) {
    const probes: Record<string, string> = {}
    const uintRes = (await c.multicall({ contracts: uintFns.map((fn) => ({ address: irm, abi: [uintFnAbi(fn)], functionName: fn })), allowFailure: true })) as any[]
    uintFns.forEach((fn, i) => { if (uintRes[i]?.status === "success") probes[fn] = (uintRes[i].result as bigint).toString() })
    const addrRes = (await c.multicall({ contracts: addrFns.map((fn) => ({ address: irm, abi: [addrFnAbi(fn)], functionName: fn })), allowFailure: true })) as any[]
    addrFns.forEach((fn, i) => { if (addrRes[i]?.status === "success") probes[fn] = getAddress(addrRes[i].result as string) })

    const evidence: string[] = []
    if (await bytecodeRefsSusds(c, irm)) evidence.push(`IRM bytecode references sUSDS ${SUSDS}`)
    // Follow a rate-source address one level.
    const rsAddr = probes["RATE_SOURCE"] ?? probes["rateSource"]
    if (rsAddr) {
      probes["_rate_source_resolved"] = rsAddr
      if (await bytecodeRefsSusds(c, rsAddr as Address)) evidence.push(`RATE_SOURCE ${rsAddr} bytecode references sUSDS ${SUSDS}`)
    }
    if (probes["susds"]) evidence.push(`susds() → ${probes["susds"]}`)
    if (probes["ssr"]) evidence.push(`ssr() present`)
    if (probes["getBaseVariableBorrowRateSpread"] != null && (rsAddr || evidence.length)) evidence.push("getBaseVariableBorrowRateSpread() present (RateTarget strategy)")

    const hasSlopes = probes["getVariableRateSlope1"] != null && probes["getVariableRateSlope2"] != null
    const type: ReserveOut["irm_type"] = evidence.length > 0 ? "sky_linked" : hasSlopes ? "utilization_curve" : "unknown"
    irmClass.set(irm.toLowerCase(), { type, evidence, probes })
  }

  // ─── [3] Historical borrow rate + utilization at probe dates ───────────
  console.log("[3/4] Reading borrow rate + utilization at 6 probe dates …")
  const blocks: Record<string, bigint> = {}
  for (const d of PROBE_DATES) {
    const ts = Math.floor(new Date(`${d}T23:59:00Z`).getTime() / 1000)
    blocks[d] = ts > latestTs ? latestNum : await blockForTs(c, ts, latestNum, latestTs)
  }
  // rate[assetLower][date], util[assetLower][date]
  const rateBy: Record<string, Record<string, number | null>> = {}
  const utilBy: Record<string, Record<string, number | null>> = {}
  for (const m of metas) { rateBy[m.asset.toLowerCase()] = {}; utilBy[m.asset.toLowerCase()] = {} }
  for (const d of PROBE_DATES) {
    const blk = blocks[d]
    // blockNumber is a multicall-level option (NOT per-contract) — all three
    // aggregate at `blk`.
    const rdD = (await c.multicall({ contracts: metas.map((m) => ({ address: SPARK_POOL, abi: poolAbi, functionName: "getReserveData", args: [m.asset] })), allowFailure: true, blockNumber: blk })) as any[]
    const aSup = (await c.multicall({ contracts: metas.map((m) => ({ address: m.aToken, abi: erc20Abi, functionName: "totalSupply" })), allowFailure: true, blockNumber: blk })) as any[]
    const vSup = (await c.multicall({ contracts: metas.map((m) => ({ address: m.vDebt, abi: erc20Abi, functionName: "totalSupply" })), allowFailure: true, blockNumber: blk })) as any[]
    metas.forEach((m, i) => {
      const k = m.asset.toLowerCase()
      rateBy[k][d] = rdD[i]?.status === "success" ? Number(rayToApyPct(rdD[i].result.currentVariableBorrowRate).toFixed(4)) : null
      const a = aSup[i]?.status === "success" ? Number(aSup[i].result) : 0
      const v = vSup[i]?.status === "success" ? Number(vSup[i].result) : 0
      utilBy[k][d] = a > 0 ? Number(((v / a) * 100).toFixed(2)) : null
    })
  }

  // ─── [4] Assemble ──────────────────────────────────────────────────────
  const reservesOut: ReserveOut[] = metas.map((m) => {
    const k = m.asset.toLowerCase()
    const cls = irmClass.get(m.irm.toLowerCase())!
    const r = rateBy[k], u = utilBy[k]
    const moved = (a: string, b: string) => r[a] != null && r[b] != null && Math.abs((r[b]! - r[a]!) * 100) >= MOVE_BPS
    const utilStable = (a: string, b: string) => u[a] != null && u[b] != null && Math.abs(u[b]! - u[a]!) <= UTIL_STABLE_PP
    const moved_jul23 = moved("2026-07-22", "2026-07-24")
    const moved_jul6 = moved("2026-07-05", "2026-07-06")
    // "Externally-anchored" evidence = rate moved WHILE utilization held (the
    // hand-off's discriminator). Jul 23 is the Sky Atlas Edit; Jul 6 was
    // Spark-specific. A rate that moved only alongside utilization is a
    // utilization-cleared market, not externally anchored.
    const extAnchored =
      (moved_jul23 && utilStable("2026-07-22", "2026-07-24")) ||
      (moved_jul6 && utilStable("2026-07-05", "2026-07-06"))
    const notes: string[] = []
    if (moved_jul23) notes.push(`rate moved Jul22→24 (${r["2026-07-22"]}%→${r["2026-07-24"]}%) with util ${utilStable("2026-07-22", "2026-07-24") ? "stable" : "also moving"}`)
    if (moved_jul6) notes.push(`rate moved Jul5→6 (${r["2026-07-05"]}%→${r["2026-07-06"]}%) with util ${utilStable("2026-07-05", "2026-07-06") ? "stable" : "also moving"}`)
    if (cls.type === "unknown") notes.push(`unknown IRM; probes=${JSON.stringify(cls.probes)}`)
    return {
      asset_symbol: m.symbol,
      asset_address: m.asset,
      reserve_address: m.asset, // Aave reserve is keyed by the underlying asset address
      irm_strategy_address: m.irm,
      irm_type: cls.type,
      sky_linked_evidence: cls.evidence.length ? cls.evidence : null,
      borrow_rate_pct_by_date: r,
      utilization_pct_by_date: u,
      moved_jul23,
      moved_jul6,
      moved_on_sky_event_days: extAnchored,
      notes: notes.join("; ") || "no rate move on probed event days",
    }
  })

  const skyLinked = reservesOut.filter((r) => r.irm_type === "sky_linked")
  const utilCurve = reservesOut.filter((r) => r.irm_type === "utilization_curve")
  const unknown = reservesOut.filter((r) => r.irm_type === "unknown")
  const conclusion =
    skyLinked.length === 0
      ? "SparkLend is uniformly utilization-cleared: no reserve uses a Sky-linked rate strategy."
      : skyLinked.length === reservesOut.length
        ? "SparkLend is uniformly Sky-linked: every reserve prices off a Sky rate source."
        : `SparkLend is MIXED: ${skyLinked.length} of ${reservesOut.length} reserves (${skyLinked.map((r) => r.asset_symbol).join(", ")}) are Sky-linked; the rest use standard Aave utilization curves.`

  const payload = {
    metadata: {
      script: "query-spark-reserve-mechanism.ts",
      run_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      methodology: "on_chain_sparklend_irm",
      spark_pool_address: SPARK_POOL,
      susds_address: SUSDS,
      sky_event_dates_probed: ["2026-07-06", "2026-07-23"],
      reserve_count: reservesOut.length,
    },
    reserves: reservesOut,
    irm_strategies: [...irmClass.entries()].map(([addr, v]) => ({ address: getAddress(addr), type: v.type, evidence: v.evidence, probes: v.probes })),
    summary: {
      utilization_curve_count: utilCurve.length,
      sky_linked_count: skyLinked.length,
      unknown_count: unknown.length,
      sky_linked_assets: skyLinked.map((r) => r.asset_symbol),
      unknown_assets: unknown.map((r) => r.asset_symbol),
      conclusion,
    },
  }
  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n")

  // ─── Console table ─────────────────────────────────────────────────────
  console.log("")
  console.log("  Asset       IRM strategy                                Type              Jul23  Jul6")
  for (const r of reservesOut) {
    console.log(
      `  ${r.asset_symbol.padEnd(10)} ${r.irm_strategy_address}  ${r.irm_type.padEnd(17)} ${r.moved_jul23 ? "yes" : "no "}    ${r.moved_jul6 ? "yes" : "no"}`,
    )
  }
  console.log("")
  console.log(`  sky_linked: ${skyLinked.length}  utilization_curve: ${utilCurve.length}  unknown: ${unknown.length}`)
  console.log(`  → ${conclusion}`)
  console.log("")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
