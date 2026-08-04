/**
 * One-shot — WEETH supplied USD across Aave V3's Ethereum markets at
 * June 30 and July 31, 2026. For Issue 002 §06.1's rsETH-unpause-driven
 * LRT outflow attribution.
 *
 *   npm run query:aave-weeth-by-market-july
 *
 * Method (DefiLlama path — chosen after confirming the data exists):
 *   - DefiLlama Yields `/pools` exposes Aave V3 Ethereum markets via the
 *     `poolMeta` field. Empirically:
 *       - `null` → Core market (51 pools today)
 *       - "Prime Instance" → Prime market (8 pools today)
 *       - "Aave Horizon Market" → Horizon market (7 pools)
 *       - "Umbrella" → safety mechanism, not a lending market (4 pools)
 *       - "Legacy" → ignore (1 pool)
 *   - For WEETH (symbol), only ONE Aave V3 Ethereum pool exists, with
 *     `poolMeta = null`. So all WEETH supply lives in the Core market.
 *     Prime, Horizon, and any historical "Lido" instance do not list
 *     WEETH at this time. This is the cleanest possible answer to the
 *     §06.1 question and we say so explicitly in the output.
 *   - Per-market historical TVL pulled from `/chart/<poolId>`, with
 *     closest-datapoint selection within ±48h of each target.
 *
 * Fallback (NOT used here) would be on-chain UiPoolDataProvider reads
 * via lib/aave-onchain.ts at historical block heights for each market's
 * PoolAddressesProvider. Documented for future extension if DefiLlama's
 * coverage shifts.
 *
 * Output: content/snapshots/2026-07-aave-weeth-by-market.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import {
  fetchAllYieldPools,
  fetchYieldChart,
  type YieldPool,
  type YieldChartPoint,
} from "../lib/defillama"

// ─── Targets ─────────────────────────────────────────────────────────────
const JUNE30_TARGET_UTC = "2026-06-30T23:59:00Z"
const JULY31_TARGET_UTC = "2026-07-31T23:59:00Z"
const MAX_DATAPOINT_DELTA_HOURS = 48
const OUTPUT_PATH = "content/snapshots/2026-07-aave-weeth-by-market.json"

// Market definitions — keyed on the DefiLlama `poolMeta` field that
// distinguishes them within the aggregate `aave-v3` slug.
const MARKETS = [
  { id: "core", display_name: "Aave V3 Core (Ethereum)", pool_meta_match: null },
  { id: "prime", display_name: "Aave V3 Prime (Ethereum)", pool_meta_match: "Prime Instance" },
  { id: "horizon", display_name: "Aave V3 Horizon (Ethereum)", pool_meta_match: "Aave Horizon Market" },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────

function pickClosest(
  series: { timestamp: number; tvlUsd: number }[],
  targetSec: number,
): { timestamp: number; tvlUsd: number } | null {
  if (series.length === 0) return null
  let best = series[0]
  let bestDelta = Math.abs(best.timestamp - targetSec)
  for (let i = 1; i < series.length; i++) {
    const d = Math.abs(series[i].timestamp - targetSec)
    if (d < bestDelta) {
      best = series[i]
      bestDelta = d
    }
  }
  return best
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "       —"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

// ─── Output schema ───────────────────────────────────────────────────────

interface MarketSnapshot {
  market_id: string
  display_name: string
  pool_meta_match: string | null
  status: "ok" | "not_listed" | "no_history"
  pool_id: string | null
  june30: { timestamp_iso: string; tvl_usd: number; delta_from_target_sec: number } | null
  july31: { timestamp_iso: string; tvl_usd: number; delta_from_target_sec: number } | null
  change_usd: number | null
  change_pct: number | null
  current_tvl_usd: number | null
  notes: string | null
}

async function main(): Promise<void> {
  const juneTarget = Math.floor(new Date(JUNE30_TARGET_UTC).getTime() / 1000)
  const julyTarget = Math.floor(new Date(JULY31_TARGET_UTC).getTime() / 1000)
  const cap = MAX_DATAPOINT_DELTA_HOURS * 3600

  console.log("Aave V3 WEETH by market — June 30 vs July 31, 2026")
  console.log("")

  // ─── Stage 1: identify WEETH pools per market ─────────────────────
  console.log("[1/2] Listing WEETH pools across Aave V3 markets via DefiLlama …")
  const allPools = await fetchAllYieldPools()
  const allAaveV3Eth = allPools.filter(
    (p) => p.project === "aave-v3" && p.chain === "Ethereum",
  )
  const allWeeth = allAaveV3Eth.filter(
    (p) => (p.symbol ?? "").toUpperCase() === "WEETH",
  )
  console.log(
    `  ${allAaveV3Eth.length} Aave V3 Ethereum pools total; ${allWeeth.length} with symbol=WEETH`,
  )

  // Per-market resolution. Each market's lookup walks `allWeeth` for a
  // matching `poolMeta`. `null` matches `poolMeta = null/undefined` so the
  // Core market collects unlabelled pools (DefiLlama's convention).
  function matchMeta(p: YieldPool, target: string | null): boolean {
    const meta = (p as { poolMeta?: string | null }).poolMeta ?? null
    if (target === null) return meta === null
    return meta === target
  }

  const perMarketPools = MARKETS.map((m) => ({
    market: m,
    pools: allWeeth.filter((p) => matchMeta(p, m.pool_meta_match)),
  }))
  for (const { market, pools } of perMarketPools) {
    console.log(`  ${market.display_name}: ${pools.length} WEETH pool(s)`)
  }
  console.log("")

  // ─── Stage 2: per-market historical TVL ──────────────────────────
  console.log("[2/2] Fetching /chart per identified pool …")
  const snapshots: MarketSnapshot[] = []
  for (const { market, pools } of perMarketPools) {
    if (pools.length === 0) {
      snapshots.push({
        market_id: market.id,
        display_name: market.display_name,
        pool_meta_match: market.pool_meta_match,
        status: "not_listed",
        pool_id: null,
        june30: null,
        july31: null,
        change_usd: null,
        change_pct: null,
        current_tvl_usd: null,
        notes:
          "WEETH is not listed in this market. " +
          "DefiLlama Yields returns zero pools matching " +
          `project=aave-v3, chain=Ethereum, symbol=WEETH, poolMeta=${JSON.stringify(market.pool_meta_match)}.`,
      })
      continue
    }
    // If multiple pools matched (shouldn't happen for WEETH but the loop
    // handles it), pick the largest by current TVL.
    const pool = pools.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0]
    let chart: YieldChartPoint[] = []
    try {
      chart = await fetchYieldChart(pool.pool)
    } catch (err: any) {
      snapshots.push({
        market_id: market.id,
        display_name: market.display_name,
        pool_meta_match: market.pool_meta_match,
        status: "no_history",
        pool_id: pool.pool,
        june30: null,
        july31: null,
        change_usd: null,
        change_pct: null,
        current_tvl_usd: pool.tvlUsd ?? null,
        notes: `Pool exists (id=${pool.pool}) but /chart returned: ${err?.message ?? err}`,
      })
      continue
    }
    const valid = chart.filter(
      (p): p is YieldChartPoint & { tvlUsd: number } =>
        typeof p.tvlUsd === "number" && Number.isFinite(p.tvlUsd),
    )
    const apr = pickClosest(valid, juneTarget)
    const may = pickClosest(valid, julyTarget)
    const mayOk = apr != null && Math.abs(apr.timestamp - juneTarget) <= cap
    const juneOk = may != null && Math.abs(may.timestamp - julyTarget) <= cap
    const maySnap = mayOk
      ? {
          timestamp_iso: new Date(apr!.timestamp * 1000).toISOString(),
          tvl_usd: apr!.tvlUsd,
          delta_from_target_sec: apr!.timestamp - juneTarget,
        }
      : null
    const juneSnap = juneOk
      ? {
          timestamp_iso: new Date(may!.timestamp * 1000).toISOString(),
          tvl_usd: may!.tvlUsd,
          delta_from_target_sec: may!.timestamp - julyTarget,
        }
      : null
    const changeUsd =
      maySnap != null && juneSnap != null ? juneSnap.tvl_usd - maySnap.tvl_usd : null
    const changePct =
      maySnap != null && juneSnap != null && maySnap.tvl_usd !== 0
        ? (changeUsd! / maySnap.tvl_usd) * 100
        : null
    snapshots.push({
      market_id: market.id,
      display_name: market.display_name,
      pool_meta_match: market.pool_meta_match,
      status: "ok",
      pool_id: pool.pool,
      june30: maySnap,
      july31: juneSnap,
      change_usd: changeUsd,
      change_pct: changePct,
      current_tvl_usd: pool.tvlUsd ?? null,
      notes: null,
    })
  }
  console.log("")

  // ─── Roll-up totals ──────────────────────────────────────────────
  const okSnaps = snapshots.filter((s) => s.status === "ok")
  const totalApr =
    okSnaps.reduce((s, m) => s + (m.june30?.tvl_usd ?? 0), 0) || null
  const totalMay =
    okSnaps.reduce((s, m) => s + (m.july31?.tvl_usd ?? 0), 0) || null
  const totalChange =
    totalApr != null && totalMay != null ? totalMay - totalApr : null
  const totalChangePct =
    totalApr != null && totalApr !== 0 && totalChange != null
      ? (totalChange / totalApr) * 100
      : null

  // Concentration flag: if ≥95% of total WEETH supply sits in a single
  // market on both endpoints, we say so in the output (the §06.1
  // "all of it sat in Core" finding).
  const dominantMay = okSnaps.reduce((max, m) =>
    (m.june30?.tvl_usd ?? 0) > (max?.june30?.tvl_usd ?? 0) ? m : max,
  okSnaps[0])
  const dominantJune = okSnaps.reduce((max, m) =>
    (m.july31?.tvl_usd ?? 0) > (max?.july31?.tvl_usd ?? 0) ? m : max,
  okSnaps[0])
  const mayShare =
    totalApr && totalApr > 0
      ? (dominantMay?.june30?.tvl_usd ?? 0) / totalApr
      : null
  const juneShare =
    totalMay && totalMay > 0
      ? (dominantJune?.july31?.tvl_usd ?? 0) / totalMay
      : null
  const concentrationFinding =
    mayShare != null && juneShare != null && mayShare >= 0.95 && juneShare >= 0.95
      ? {
          dominant_market_id: dominantMay?.market_id ?? null,
          dominant_market_share_june30_pct: Number((mayShare * 100).toFixed(2)),
          dominant_market_share_july31_pct: Number((juneShare * 100).toFixed(2)),
          finding: `At both endpoints, ≥95% of Aave V3 Ethereum WEETH supply sits in the ${dominantMay?.display_name} market. The June 30 → July 31 change is effectively a single-market story.`,
        }
      : null

  // ─── Write JSON ───────────────────────────────────────────────────
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    issue: "002 §06.1 (Aave V3 WEETH by market)",
    targets: {
      june30_utc: JUNE30_TARGET_UTC,
      july31_utc: JULY31_TARGET_UTC,
      datapoint_tolerance_hours: MAX_DATAPOINT_DELTA_HOURS,
    },
    source: {
      method:
        "DefiLlama Yields /pools to enumerate Aave V3 Ethereum markets by poolMeta; /chart/<poolId> for per-pool TVL history.",
      market_split:
        "poolMeta=null → Core, 'Prime Instance' → Prime, 'Aave Horizon Market' → Horizon. 'Umbrella' / 'Legacy' poolMetas are not lending markets and excluded.",
      caveat:
        "DefiLlama tvlUsd per pool = available liquidity (supplied − borrowed). For aTokens with full utilization this can underread the supplied-stake figure, but for WEETH on Core the utilization is dominated by collateral-only deposits so tvlUsd ≈ supplied in practice.",
    },
    per_market: snapshots,
    totals: {
      june30_tvl_usd: totalApr,
      july31_tvl_usd: totalMay,
      change_usd: totalChange,
      change_pct: totalChangePct,
    },
    concentration_finding: concentrationFinding,
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n")

  // ─── Console summary ──────────────────────────────────────────────
  console.log("── Per-market WEETH ───────────────────────────────────────")
  for (const s of snapshots) {
    if (s.status === "not_listed") {
      console.log(`  ${s.display_name.padEnd(34)} NOT LISTED`)
      continue
    }
    if (s.status === "no_history") {
      console.log(
        `  ${s.display_name.padEnd(34)} pool exists, /chart unavailable ` +
          `(current ${fmtUsd(s.current_tvl_usd)})`,
      )
      continue
    }
    console.log(
      `  ${s.display_name.padEnd(34)} ` +
        `June 30 ${fmtUsd(s.june30?.tvl_usd ?? null).padStart(9)} → ` +
        `July 31 ${fmtUsd(s.july31?.tvl_usd ?? null).padStart(9)}  ` +
        `Δ ${fmtUsd(s.change_usd).padStart(9)} (${fmtPct(s.change_pct).padStart(7)})`,
    )
  }
  console.log("")
  console.log("── Totals across all listed markets ───────────────────────")
  console.log(`  June 30 : ${fmtUsd(totalApr)}`)
  console.log(`  July 31 : ${fmtUsd(totalMay)}`)
  console.log(`  Δ      : ${fmtUsd(totalChange)} (${fmtPct(totalChangePct)})`)
  if (concentrationFinding) {
    console.log("")
    console.log("── Concentration finding ──────────────────────────────────")
    console.log(`  ${concentrationFinding.finding}`)
  }
  console.log("")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
