/**
 * One-shot — SparkLend USDC daily borrow-rate trajectory for Issue 004 §01
 * (the "Sky Base Rate peg" chart). Reads the rate ON-CHAIN, not from
 * DefiLlama.
 *
 *   npm run query:spark-usdc-borrow-daily
 *
 * ── Why on-chain (methodology: on_chain_sparklend_getReserveData) ──────
 * DefiLlama's free Yields API cannot supply a daily BORROW-rate series for
 * this pool: /chart/<poolId> carries the supply side only (apyBase, no
 * apyBaseBorrow) and /chartLendBorrow/<poolId> is a paid "Upgrade to Pro"
 * endpoint. SparkLend is an Aave-V3 fork, so the authoritative rate is the
 * pool's own `getReserveData(USDC).currentVariableBorrowRate` — a ray
 * (1e27) APR we read at the block nearest each UTC midnight across the
 * window, then convert to a per-second-compounded APY (the convention the
 * Spark UI shows). Supply APY (currentLiquidityRate) + utilization + TVL
 * are read alongside for context. This is more authoritative than any API
 * and, once cached in the JSON, needs no re-fetch to draw the chart.
 *
 * The rate is set by SparkLend's interest-rate strategy, which tracks the
 * Sky Base Rate (Sky's D3M target). Discrete step-downs in the series are
 * the Sky-peg governance changes the §01 chart is about; the script surfaces
 * every step >= 5 bps in `key_moments.detected_steps` rather than assuming a
 * date, so the chart is driven by what actually happened on-chain.
 *
 * Output: content/snapshots/2026-07-spark-usdc-borrow-daily.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import {
  createPublicClient,
  erc20Abi,
  fallback,
  http,
  type Address,
  type PublicClient,
} from "viem"
import { mainnet } from "viem/chains"

// ─── Constants ───────────────────────────────────────────────────────────
const SPARK_POOL = "0xC13e21B648A5Ee794902342038FF3aDAB66BE987" as Address // SparkLend Pool
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address
const USDC_DECIMALS = 6
const USDC_PRICE_USD = 1.0 // stablecoin; TVL is contextual, not the headline
const WINDOW_START = "2026-06-20" // bracket July so the step-downs sit in context
const WINDOW_END = "2026-08-05"
const OUTPUT_PATH = "content/snapshots/2026-07-spark-usdc-borrow-daily.json"
const STEP_THRESHOLD_BPS = 5 // day-over-day borrow move counted as a "step"

const PUBLIC_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.merkle.io",
  "https://rpc.ankr.com/eth",
]
const RAY = 1e27
const SEC_YEAR = 31_536_000

function makeClient(): PublicClient {
  const override = process.env.ETH_RPC_URL?.trim()
  const urls = override ? [override, ...PUBLIC_RPCS] : PUBLIC_RPCS
  return createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((u) => http(u, { timeout: 30_000, retryCount: 2, retryDelay: 500 })),
      { rank: false },
    ),
  })
}

// Aave-V3 Pool.getReserveData(asset) — SparkLend uses the same struct.
const poolAbi = [
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
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
    ],
  },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────
/** ray APR → per-second-compounded APY %, the convention Aave/Spark UIs use. */
function rayToApyPct(ray: bigint): number {
  const apr = Number(ray) / RAY
  return ((1 + apr / SEC_YEAR) ** SEC_YEAR - 1) * 100
}
function rayToAprPct(ray: bigint): number {
  return (Number(ray) / RAY) * 100
}
function dayList(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const start = new Date(`${startIso}T00:00:00Z`)
  const end = new Date(`${endIso}T00:00:00Z`)
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
/** Block nearest a target UTC-second, via 12s/block estimate + one correction. */
async function blockForTs(
  c: PublicClient,
  targetTs: number,
  latestNum: bigint,
  latestTs: number,
): Promise<bigint> {
  let est = latestNum - BigInt(Math.round((latestTs - targetTs) / 12))
  if (est < 1n) est = 1n
  const b = await c.getBlock({ blockNumber: est })
  const drift = Math.round((targetTs - Number(b.timestamp)) / 12)
  let corrected = est + BigInt(drift)
  if (corrected < 1n) corrected = 1n
  return corrected
}

interface DayRow {
  date: string
  supply_apy_pct: number
  borrow_apy_pct: number
  borrow_apr_pct: number
  utilization: number | null
  tvl_usd: number | null
}

async function main(): Promise<void> {
  console.log("SparkLend USDC daily borrow rate (on-chain getReserveData)")
  console.log(`  window: ${WINDOW_START} → ${WINDOW_END}`)
  console.log("")

  const c = makeClient()
  const latest = await c.getBlock()
  const latestNum = latest.number!
  const latestTs = Number(latest.timestamp)

  // Token addresses are constant across the window — read once at latest.
  const meta = (await c.readContract({
    address: SPARK_POOL,
    abi: poolAbi,
    functionName: "getReserveData",
    args: [USDC],
  })) as any
  const aToken = meta.aTokenAddress as Address
  const vDebtToken = meta.variableDebtTokenAddress as Address

  const days = dayList(WINDOW_START, WINDOW_END)
  const rows: DayRow[] = []
  console.log(`[1/2] Reading ${days.length} daily blocks on-chain …`)
  for (const day of days) {
    const ts = Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000)
    if (ts > latestTs) break
    const blk = await blockForTs(c, ts, latestNum, latestTs)
    try {
      const [rd, supplied, borrowed] = (await Promise.all([
        c.readContract({ address: SPARK_POOL, abi: poolAbi, functionName: "getReserveData", args: [USDC], blockNumber: blk }),
        c.readContract({ address: aToken, abi: erc20Abi, functionName: "totalSupply", blockNumber: blk }),
        c.readContract({ address: vDebtToken, abi: erc20Abi, functionName: "totalSupply", blockNumber: blk }),
      ])) as [any, bigint, bigint]
      const supUnits = Number(supplied) / 10 ** USDC_DECIMALS
      const borUnits = Number(borrowed) / 10 ** USDC_DECIMALS
      rows.push({
        date: day,
        supply_apy_pct: Number(rayToApyPct(rd.currentLiquidityRate).toFixed(4)),
        borrow_apy_pct: Number(rayToApyPct(rd.currentVariableBorrowRate).toFixed(4)),
        borrow_apr_pct: Number(rayToAprPct(rd.currentVariableBorrowRate).toFixed(4)),
        utilization: supUnits > 0 ? Number((borUnits / supUnits).toFixed(4)) : null,
        tvl_usd: Number((supUnits * USDC_PRICE_USD).toFixed(2)),
      })
    } catch (err: any) {
      console.error(`  [warn] ${day} (blk ${blk}) read failed: ${err?.shortMessage ?? err?.message}`)
    }
  }

  // ─── Detect discrete step-downs / step-ups (>= threshold bps) ──────────
  console.log("[2/2] Detecting rate steps …")
  const detectedSteps: Array<{
    from_date: string
    to_date: string
    from_borrow_apy_pct: number
    to_borrow_apy_pct: number
    delta_bps: number
  }> = []
  for (let i = 1; i < rows.length; i++) {
    const dBps = (rows[i].borrow_apy_pct - rows[i - 1].borrow_apy_pct) * 100
    if (Math.abs(dBps) >= STEP_THRESHOLD_BPS) {
      detectedSteps.push({
        from_date: rows[i - 1].date,
        to_date: rows[i].date,
        from_borrow_apy_pct: rows[i - 1].borrow_apy_pct,
        to_borrow_apy_pct: rows[i].borrow_apy_pct,
        delta_bps: Number(dBps.toFixed(1)),
      })
    }
  }

  const byDate = (d: string) => rows.find((r) => r.date === d) ?? null
  const jul = rows.filter((r) => r.date >= "2026-07-01" && r.date <= "2026-07-31")
  const borrowsJul = jul.map((r) => r.borrow_apy_pct)
  const monthOpen = byDate("2026-07-01")?.borrow_apy_pct ?? null
  const monthClose = byDate("2026-07-31")?.borrow_apy_pct ?? null

  // The hand-off asked specifically about a Jul-26 → Jul-27 step; report it
  // verbatim (it turns out to be flat — the real steps are elsewhere).
  const pre = byDate("2026-07-26")
  const post = byDate("2026-07-27")
  const jul2627DeltaBps =
    pre && post ? Number(((post.borrow_apy_pct - pre.borrow_apy_pct) * 100).toFixed(1)) : null

  const payload = {
    metadata: {
      script: "scripts/query-spark-usdc-borrow-daily.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      methodology: "on_chain_sparklend_getReserveData",
      source: `SparkLend Pool ${SPARK_POOL} getReserveData(${USDC}).currentVariableBorrowRate + currentLiquidityRate, read at the block nearest each UTC-midnight; ray APR → per-second-compounded APY. Utilization = variableDebt.totalSupply / aToken.totalSupply. USDC priced at $${USDC_PRICE_USD.toFixed(2)}.`,
      defillama_pool_id: "65ce8276-b4d9-41ba-9f6f-21fc374cf9bc",
      note: "DefiLlama /chart carries supply APY only and /chartLendBorrow is paywalled, so the borrow rate is read on-chain.",
    },
    window: { start_date: WINDOW_START, end_date: WINDOW_END },
    series: rows,
    key_moments: {
      detected_steps: detectedSteps,
      requested_jul26_to_jul27: {
        pre_change: pre ? { date: "2026-07-26", borrow_apy_pct: pre.borrow_apy_pct } : null,
        post_change: post ? { date: "2026-07-27", borrow_apy_pct: post.borrow_apy_pct } : null,
        delta_bps: jul2627DeltaBps,
        note: "Included because Issue 004's working thesis flagged a Jul-27 step. On-chain, Jul 26→27 is flat; the real step-downs are in detected_steps.",
      },
    },
    summary: {
      month_open_borrow_pct: monthOpen,
      month_close_borrow_pct: monthClose,
      month_min_borrow_pct: borrowsJul.length ? Math.min(...borrowsJul) : null,
      month_max_borrow_pct: borrowsJul.length ? Math.max(...borrowsJul) : null,
      total_month_step_bps:
        monthOpen != null && monthClose != null
          ? Number(((monthClose - monthOpen) * 100).toFixed(1))
          : null,
    },
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n")

  // ─── Console ───────────────────────────────────────────────────────────
  console.log("")
  console.log("  date        borrow%   supply%   util    tvl$")
  for (const r of rows) {
    console.log(
      `  ${r.date}  ${r.borrow_apy_pct.toFixed(3).padStart(7)}  ${r.supply_apy_pct.toFixed(3).padStart(7)}  ` +
        `${r.utilization != null ? (r.utilization * 100).toFixed(1) + "%" : "—"}  ` +
        `${r.tvl_usd != null ? "$" + (r.tvl_usd / 1e6).toFixed(1) + "M" : "—"}`,
    )
  }
  console.log("")
  console.log("── Detected borrow-rate steps (>= 5 bps) ───────────────────")
  if (detectedSteps.length === 0) {
    console.log("  none")
  } else {
    for (const s of detectedSteps) {
      console.log(
        `  ${s.from_date} → ${s.to_date}: ${s.from_borrow_apy_pct.toFixed(3)}% → ${s.to_borrow_apy_pct.toFixed(3)}%  (${s.delta_bps >= 0 ? "+" : ""}${s.delta_bps} bps)`,
      )
    }
  }
  console.log("")
  console.log(
    `Spark USDC borrow rate: July 1 ${monthOpen?.toFixed(2)}% → July 31 ${monthClose?.toFixed(2)}%. ` +
      `Requested Jul 26 → Jul 27 step: ${pre?.borrow_apy_pct.toFixed(2)}% → ${post?.borrow_apy_pct.toFixed(2)}% (${jul2627DeltaBps} bps).`,
  )
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
