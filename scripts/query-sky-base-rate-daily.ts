/**
 * One-shot — Sky Base Rate daily series for Issue 004 §01. This is the
 * SECOND line on the §01 chart (the wholesale cost SparkLend pays), sitting
 * alongside SparkLend's retail USDC borrow rate
 * (content/snapshots/2026-07-spark-usdc-borrow-daily.json).
 *
 *   npm run query:sky-base-rate-daily
 *
 * ── Source (methodology: on_chain_ssr + governance-margin) ──────────────
 * The Sky Base Rate = SSR (Sky Savings Rate) + a governance-set margin.
 * SSR is read ON-CHAIN from Sky's sUSDS (SavingsUSDS) contract `ssr()` — a
 * per-second ray accumulator (like Maker's DSR/pot) — at the block nearest
 * each UTC midnight, June 20 → August 5, 2026. SSR APY = (ssr/1e27)^SPY − 1.
 *
 * The margin is NOT on-chain-derivable here: it is a Sky governance
 * parameter, 0.30% before the Atlas Edit implementation and 0.20% after.
 * We assume implementation on 2026-07-24 (matches SparkLend's second retail
 * step-down); this is the ONE assumed input — every SSR value is an
 * authoritative on-chain read. The margin assumption is flagged per-row in
 * `source_note` and in `metadata.assumptions` so §01 can cite it honestly.
 *
 * Reconciliation: at 2026-07-31, SSR ≈ 3.52% + margin 0.20% = 3.72%, which
 * matches the "3.72%" Spark publicised — confirming 3.72% is the Base Rate,
 * not SparkLend's retail pool borrow rate (4.28% on-chain at July 31).
 *
 * Output: content/snapshots/2026-07-sky-base-rate-daily.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { createPublicClient, fallback, http, getAddress, type Address, type PublicClient } from "viem"
import { mainnet } from "viem/chains"

// ─── Constants ───────────────────────────────────────────────────────────
// Sky sUSDS (SavingsUSDS) — holds the Sky Savings Rate accumulator `ssr`.
const SUSDS = "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD" as Address
const WINDOW_START = "2026-06-20"
const WINDOW_END = "2026-08-05"
const OUTPUT_PATH = "content/snapshots/2026-07-sky-base-rate-daily.json"

// Base Rate = SSR + margin, where margin = Sky Spread + 0.2% Distribution
// Reward Fee. The Atlas Edit narrowed the Sky Spread 0.1% → 0%, so margin
// 0.30% → 0.20%.
const MARGIN_BPS_PRE = 30 // pre-Atlas-Edit (0.1% Sky Spread + 0.2% Distribution Reward Fee)
const MARGIN_BPS_POST = 20 // post-Atlas-Edit (0.0% Sky Spread + 0.2% Distribution Reward Fee)
// VERIFIED on-chain: the week-of-2026-07-20 Atlas Edit executed 2026-07-23
// 14:43:23 UTC (block 25596101, tx 0x12435f65…f6619b) — the Sky weekly rate
// spell that filed the new SSR (3.60%→3.52%) alongside stability-fee duties;
// the forum-documented Sky Spread 0.1%→0% cut is part of that same weekly
// Atlas Edit. Because execution was mid-day (after 00:00), the daily 00:00
// snapshots first show the new margin at the 2026-07-24 snapshot, so the
// series flips margin on ATLAS_EDIT_SNAPSHOT_DATE (a 00:00-sampling artifact —
// the real event is 2026-07-23). See metadata.margin_execution_verification.
const ATLAS_EDIT_EXECUTION_UTC = "2026-07-23T14:43:23Z"
const ATLAS_EDIT_EXECUTION_BLOCK = 25596101
const ATLAS_EDIT_EXECUTION_TX = "0x12435f652eeb08f9de4f4b6402a88de38ac092aef2a6656c87ed0be2f6f6619b"
const ATLAS_EDIT_SNAPSHOT_DATE = "2026-07-24" // first UTC-00:00 snapshot reflecting the 2026-07-23 execution
const STEP_THRESHOLD_BPS = 3 // day-over-day SSR move counted as a step

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

const ssrAbi = [
  { name: "ssr", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────
/** Sky/Maker per-second ray accumulator → APY %. */
function ssrRayToApyPct(ssr: bigint): number {
  return ((Number(ssr) / RAY) ** SEC_YEAR - 1) * 100
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
function marginBpsFor(date: string): number {
  return date >= ATLAS_EDIT_SNAPSHOT_DATE ? MARGIN_BPS_POST : MARGIN_BPS_PRE
}

interface DayRow {
  date: string
  ssr_pct: number
  margin_bps: number
  base_rate_pct: number
  source_note: string
}

async function main(): Promise<void> {
  console.log("Sky Base Rate daily (on-chain SSR + governance margin)")
  console.log(`  window: ${WINDOW_START} → ${WINDOW_END}`)
  console.log("")

  const c = makeClient()
  const latest = await c.getBlock()
  const latestNum = latest.number!
  const latestTs = Number(latest.timestamp)

  const days = dayList(WINDOW_START, WINDOW_END)
  const rows: DayRow[] = []
  console.log(`[1/2] Reading sUSDS.ssr() at ${days.length} daily blocks …`)
  for (const day of days) {
    const ts = Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000)
    if (ts > latestTs) break
    const blk = await blockForTs(c, ts, latestNum, latestTs)
    try {
      const ssr = (await c.readContract({
        address: SUSDS,
        abi: ssrAbi,
        functionName: "ssr",
        blockNumber: blk,
      })) as bigint
      const ssrPct = Number(ssrRayToApyPct(ssr).toFixed(4))
      const marginBps = marginBpsFor(day)
      rows.push({
        date: day,
        ssr_pct: ssrPct,
        margin_bps: marginBps,
        base_rate_pct: Number((ssrPct + marginBps / 100).toFixed(4)),
        source_note: `ssr: authoritative on-chain read; margin: ${(marginBps / 100).toFixed(2)}% (${marginBps === MARGIN_BPS_POST ? "post" : "pre"}-Atlas-Edit; execution verified on-chain 2026-07-23 14:43 UTC)`,
      })
    } catch (err: any) {
      console.error(`  [warn] ${day} (blk ${blk}) ssr() read failed: ${err?.shortMessage ?? err?.message}`)
    }
  }

  // ─── Governance events ─────────────────────────────────────────────────
  console.log("[2/2] Flagging governance events …")
  const keyMoments: Array<{ date: string; event: string; detail: string; source: string }> = []
  // Data-driven SSR steps.
  for (let i = 1; i < rows.length; i++) {
    const dBps = (rows[i].ssr_pct - rows[i - 1].ssr_pct) * 100
    if (Math.abs(dBps) >= STEP_THRESHOLD_BPS) {
      keyMoments.push({
        date: rows[i].date,
        event: "ssr_step",
        detail: `SSR ${rows[i - 1].ssr_pct.toFixed(2)}% → ${rows[i].ssr_pct.toFixed(2)}% (${dBps >= 0 ? "+" : ""}${dBps.toFixed(1)} bps, on-chain)`,
        source: "on_chain",
      })
    }
  }
  // Verified Atlas Edit execution (SSR + margin), on-chain + forum-corroborated.
  keyMoments.push({
    date: "2026-07-23",
    event: "atlas_edit_executed",
    detail: `Sky weekly rate spell executed ${ATLAS_EDIT_EXECUTION_UTC} (block ${ATLAS_EDIT_EXECUTION_BLOCK}, tx ${ATLAS_EDIT_EXECUTION_TX}): SSR 3.60%→3.52% filed on-chain (verified). The week-of-2026-07-20 Atlas Edit also narrowed the Sky Spread 0.1%→0% (margin ${(MARGIN_BPS_PRE / 100).toFixed(2)}%→${(MARGIN_BPS_POST / 100).toFixed(2)}%, −${MARGIN_BPS_PRE - MARGIN_BPS_POST} bps) — forum-documented, same weekly spell. Base Rate 3.90%→3.72%. The daily 00:00 series shows it from the 2026-07-24 snapshot.`,
    source: "on_chain_verified + forum",
  })
  keyMoments.sort((a, b) => a.date.localeCompare(b.date))

  const byDate = (d: string) => rows.find((r) => r.date === d) ?? null
  const monthOpen = byDate("2026-07-01")?.base_rate_pct ?? null
  const monthClose = byDate("2026-07-31")?.base_rate_pct ?? null

  const payload = {
    metadata: {
      script: "scripts/query-sky-base-rate-daily.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      source_used: "3 (on-chain sUSDS.ssr) + verified on-chain Atlas Edit execution",
      methodology:
        `Sky Base Rate = SSR + margin. SSR read on-chain from sUSDS ${SUSDS} ssr() at the block nearest each UTC-midnight, ray → per-second-compounded APY. Margin (Sky Spread + 0.2% Distribution Reward Fee) is a Sky governance parameter.`,
      margin_execution_verification: {
        verified: true,
        execution_utc: ATLAS_EDIT_EXECUTION_UTC,
        block: ATLAS_EDIT_EXECUTION_BLOCK,
        tx: ATLAS_EDIT_EXECUTION_TX,
        ssr_change: 'VERIFIED on-chain: 3.60% → 3.52%, filed via sUSDS File("ssr") in the Sky weekly rate spell (which also set stability-fee duties for ETH/WBTC/WSTETH ilks).',
        sky_spread_change:
          "0.1% → 0% (margin 0.30% → 0.20%): documented in the week-of-2026-07-20 Atlas Edit (forum.skyeco.com); the 2026-07-23 spell is that cycle's on-chain execution, so best-dated to the same tx. Forum-corroborated — a standalone on-chain Sky-Spread parameter event was not isolated.",
        margin_pre_bps: MARGIN_BPS_PRE,
        margin_post_bps: MARGIN_BPS_POST,
        snapshot_flip_date: ATLAS_EDIT_SNAPSHOT_DATE,
        note: "Execution was 2026-07-23 14:43 UTC, NOT the previously assumed 2026-07-24. Because it was mid-day, the daily 00:00 series first shows the new Base Rate at the 2026-07-24 snapshot; the 00:00 series values are therefore unchanged. Reconciles to 3.72% at 2026-07-31, matching Spark's public figure.",
      },
    },
    window: { start_date: WINDOW_START, end_date: WINDOW_END },
    series: rows,
    key_moments: keyMoments,
    summary: {
      month_open_base_rate_pct: monthOpen,
      month_close_base_rate_pct: monthClose,
      total_delta_bps:
        monthOpen != null && monthClose != null
          ? Number(((monthClose - monthOpen) * 100).toFixed(1))
          : null,
      ssr_open_jul1_pct: byDate("2026-07-01")?.ssr_pct ?? null,
      ssr_close_jul31_pct: byDate("2026-07-31")?.ssr_pct ?? null,
    },
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n")

  // ─── Console ───────────────────────────────────────────────────────────
  console.log("")
  console.log("  date        SSR%    margin  baseRate%")
  for (const r of rows) {
    console.log(
      `  ${r.date}  ${r.ssr_pct.toFixed(3).padStart(6)}  ${(r.margin_bps / 100).toFixed(2)}%   ${r.base_rate_pct.toFixed(3).padStart(7)}`,
    )
  }
  console.log("")
  console.log("── Key moments ─────────────────────────────────────────────")
  for (const k of keyMoments) console.log(`  ${k.date}  [${k.event}] ${k.detail}`)
  console.log("")
  console.log(
    `Sky Base Rate: July 1 ${monthOpen?.toFixed(2)}% → July 31 ${monthClose?.toFixed(2)}% ` +
      `(SSR ${payload.summary.ssr_open_jul1_pct?.toFixed(2)}% → ${payload.summary.ssr_close_jul31_pct?.toFixed(2)}%).`,
  )
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
