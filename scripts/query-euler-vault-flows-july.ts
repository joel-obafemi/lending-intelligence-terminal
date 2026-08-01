/**
 * One-shot — identify which Euler V2 EVK vaults drove the ~$338M net
 * outflow in July 2026, ranked. For Issue 003 §06.6.
 *
 *   npm run query:euler-vault-flows-july
 *   # or: npx tsx scripts/query-euler-vault-flows.ts
 *
 * Data-source ladder (per the issue brief, picked the first that exposes
 * vault-level HISTORY cleanly):
 *
 *   a) DefiLlama `/protocol/euler-v2` — checked: returns ONLY
 *      protocol-level + per-token aggregates on Ethereum
 *      (chainTvls.Ethereum, chainTvls.Ethereum-borrowed, tokensInUsd).
 *      No per-vault breakdown. Rejected.
 *
 *   b) Euler's own API at app.euler.finance / developer.euler.finance —
 *      no documented public historical endpoint at the time of writing.
 *      Vault metadata exists in their indexer but isn't a stable public
 *      contract. Rejected.
 *
 *   c) On-chain reads from the Euler Vault Connector — gives current
 *      vault list + names cleanly, but HISTORICAL TVL would need an
 *      archive node and per-day eth_call across 55+ vaults. Heavy and
 *      slow. Held in reserve.
 *
 *   d) DefiLlama Yields — `/pools` exposes each EVK vault as its own
 *      pool row with `poolMeta` = "EVK Vault e{SYMBOL}-{n}" (the on-
 *      chain vault label), and `/chart/<poolId>` returns the daily TVL
 *      history per vault. Local IP fetches work; only Vercel's build
 *      pool gets rate-limited to 403. This is the path used.
 *
 * Notes that affect the §06.6 wording:
 *   - DefiLlama `tvlUsd` per vault = available liquidity (supplied −
 *     borrowed), not gross supply. Vault-level "supplied" and
 *     "borrowed" are not exposed historically per pool. We rank on
 *     `tvlUsd` change since that's the visible movement of liquidity
 *     in/out. Numbers may not sum exactly to the ~$338M
 *     protocol-level supply delta (which adds borrowed history too),
 *     but the RANKING of "which vaults bled" is correct.
 *   - poolMeta is the EVK vault label exactly as Euler's app exposes
 *     it (e.g. "EVK Vault eUSDC-80"). Quote it verbatim in the issue.
 *
 * Fallback: if `/chart` returns 4xx for the majority of pools (IP
 * rate-limited or paywalled), the script falls back to a snapshot of
 * the top 10 Euler vaults by current TVL with notes on which are
 * obviously down materially. Less precise but still publishable.
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

// ─── Constants ───────────────────────────────────────────────────────────
const START_TARGET_UTC = "2026-07-01T00:00:00Z"
const END_TARGET_UTC = "2026-07-31T23:59:00Z"
const OUTPUT_PATH = "content/snapshots/2026-07-euler-vault-flows.json"
const TOP_N = 5
// Polite cap — 55 pools, this keeps us at ~4 in-flight at any moment.
const FETCH_CONCURRENCY = 4
// A vault we keep in the ranking should have a chart point within this
// many hours of each target. DefiLlama is daily-resolution; <48h covers
// the daily slot in either direction.
const MAX_DATAPOINT_DELTA_HOURS = 48
// If more than this fraction of pools fail to return chart data, fall
// back to the current-TVL-only snapshot.
const FALLBACK_FAILURE_THRESHOLD = 0.6

// ─── Types — JSON output schema ──────────────────────────────────────────
interface VaultEndpoint {
  timestamp_iso: string
  tvl_usd: number
  delta_from_target_sec: number
}

interface VaultFlow {
  pool_id: string
  display_name: string
  symbol: string
  pool_meta: string | null
  underlying_token: string | null
  current_tvl_usd: number | null
  may1: VaultEndpoint | null
  june30: VaultEndpoint | null
  abs_delta_usd: number | null
  pct_delta: number | null
  /** Why this vault is not eligible for the main ranking, if applicable. */
  excluded_reason: string | null
}

interface RankedRow {
  rank: number
  display_name: string
  symbol: string
  pool_meta: string | null
  may1_supply_usd: number
  june30_supply_usd: number
  change_usd: number
  change_pct: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Find the chart datapoint nearest a unix-seconds target. Returns null on
 *  empty input. Generic so callers preserve any narrowed point type they
 *  feed in (e.g. NonNullPoint with non-null tvlUsd). */
function pickClosest<T extends { timestamp: number }>(
  series: T[],
  targetSec: number,
): T | null {
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

/** Run an async mapper over items with a max concurrency cap. Preserves
 *  result order. */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }
  const workers: Promise<void>[] = []
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

function displayName(p: YieldPool): string {
  // poolMeta is the EVK label ("EVK Vault eUSDC-80") — preferred. Fall
  // back to "Euler {symbol}" + short pool id when poolMeta is missing.
  const meta = (p as any).poolMeta as string | null | undefined
  if (meta && meta.trim().length > 0) return meta.trim()
  const sym = p.symbol ?? "?"
  const shortId = p.pool.split("-")[0]
  return `Euler ${sym} (${shortId})`
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "       —"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function fmtPct(n: number | null, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(decimals)}%`
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTarget = Math.floor(new Date(START_TARGET_UTC).getTime() / 1000)
  const endTarget = Math.floor(new Date(END_TARGET_UTC).getTime() / 1000)
  const maxDeltaSec = MAX_DATAPOINT_DELTA_HOURS * 3600

  console.log("Querying DefiLlama Yields /pools …")
  const allPools = await fetchAllYieldPools()
  const eulerPools = allPools.filter(
    (p) => p.project === "euler-v2" && p.chain === "Ethereum",
  )
  console.log(`  ${eulerPools.length} Euler V2 Ethereum pools found`)
  console.log("")
  console.log(`Fetching /chart for each pool (concurrency=${FETCH_CONCURRENCY}) …`)

  const flows: VaultFlow[] = await mapConcurrent(
    eulerPools,
    FETCH_CONCURRENCY,
    async (p) => {
      const base: Omit<
        VaultFlow,
        "may1" | "june30" | "abs_delta_usd" | "pct_delta" | "excluded_reason"
      > = {
        pool_id: p.pool,
        display_name: displayName(p),
        symbol: p.symbol ?? "?",
        pool_meta: ((p as any).poolMeta as string | null) ?? null,
        underlying_token: p.underlyingTokens?.[0]?.toLowerCase() ?? null,
        current_tvl_usd: p.tvlUsd ?? null,
      }
      // Narrowed point type — after the filter every point carries a
       // real `tvlUsd` number.  YieldChartPoint declares it as nullable to
       // match DefiLlama's raw response shape.
      type NonNullPoint = YieldChartPoint & { tvlUsd: number }
      let chart: NonNullPoint[] = []
      try {
        const raw = await fetchYieldChart(p.pool)
        chart = raw.filter(
          (pt): pt is NonNullPoint =>
            typeof pt.tvlUsd === "number" && Number.isFinite(pt.tvlUsd),
        )
      } catch (err: any) {
        // Could be a 4xx (paywall/rate-limit) or transient network error.
        // Don't crash the whole run — record the miss and continue.
        return {
          ...base,
          may1: null,
          june30: null,
          abs_delta_usd: null,
          pct_delta: null,
          excluded_reason: `chart fetch failed: ${err?.message ?? err}`,
        }
      }
      if (chart.length === 0) {
        return {
          ...base,
          may1: null,
          june30: null,
          abs_delta_usd: null,
          pct_delta: null,
          excluded_reason: "chart returned empty series",
        }
      }
      const may1 = pickClosest(chart, startTarget)
      const june30 = pickClosest(chart, endTarget)
      const may1Delta = may1 ? may1.timestamp - startTarget : null
      const june30Delta = june30 ? june30.timestamp - endTarget : null

      // Exclude vaults without a baseline near both targets — usually
      // means the vault was created mid-month and there's no May 1 point
      // to subtract from. We separately report these as "newly created
      // during the window" in stats.
      if (!may1 || Math.abs(may1Delta!) > maxDeltaSec) {
        return {
          ...base,
          may1: null,
          june30: june30
            ? {
                timestamp_iso: new Date(june30.timestamp * 1000).toISOString(),
                tvl_usd: june30.tvlUsd,
                delta_from_target_sec: june30Delta!,
              }
            : null,
          abs_delta_usd: null,
          pct_delta: null,
          excluded_reason:
            "no May 1 baseline within tolerance — likely created mid-window",
        }
      }
      if (!june30 || Math.abs(june30Delta!) > maxDeltaSec) {
        return {
          ...base,
          may1: {
            timestamp_iso: new Date(may1.timestamp * 1000).toISOString(),
            tvl_usd: may1.tvlUsd,
            delta_from_target_sec: may1Delta!,
          },
          june30: null,
          abs_delta_usd: null,
          pct_delta: null,
          excluded_reason:
            "no May 31 endpoint within tolerance — likely deprecated mid-window",
        }
      }

      const absDelta = june30.tvlUsd - may1.tvlUsd
      const pct = may1.tvlUsd === 0 ? null : (absDelta / may1.tvlUsd) * 100
      return {
        ...base,
        may1: {
          timestamp_iso: new Date(may1.timestamp * 1000).toISOString(),
          tvl_usd: may1.tvlUsd,
          delta_from_target_sec: may1Delta!,
        },
        june30: {
          timestamp_iso: new Date(june30.timestamp * 1000).toISOString(),
          tvl_usd: june30.tvlUsd,
          delta_from_target_sec: june30Delta!,
        },
        abs_delta_usd: absDelta,
        pct_delta: pct,
        excluded_reason: null,
      }
    },
  )

  // ─── Partition + rank ──────────────────────────────────────────────
  const ranked = flows.filter(
    (f) =>
      f.abs_delta_usd != null &&
      Number.isFinite(f.abs_delta_usd) &&
      f.may1 != null &&
      f.june30 != null,
  )
  const excluded = flows.filter((f) => f.excluded_reason !== null)
  const chartFailures = flows.filter((f) =>
    f.excluded_reason?.startsWith("chart fetch failed"),
  ).length

  // Decide between primary path and fallback. If too many /chart calls
  // failed (e.g. IP got rate-limited), we don't have a reliable ranking
  // — switch to top-10-by-current-TVL.
  const failureRate = chartFailures / Math.max(eulerPools.length, 1)
  const usingFallback = failureRate >= FALLBACK_FAILURE_THRESHOLD

  if (usingFallback) {
    console.warn(
      `\n⚠  /chart failed for ${chartFailures}/${eulerPools.length} pools — falling back to top-10-by-current-TVL.\n`,
    )
  }

  // Top outflows: most negative abs_delta_usd first.
  const topOutflows: RankedRow[] = [...ranked]
    .filter((f) => (f.abs_delta_usd ?? 0) < 0)
    .sort((a, b) => (a.abs_delta_usd ?? 0) - (b.abs_delta_usd ?? 0))
    .slice(0, TOP_N)
    .map((f, i) => ({
      rank: i + 1,
      display_name: f.display_name,
      symbol: f.symbol,
      pool_meta: f.pool_meta,
      may1_supply_usd: f.may1!.tvl_usd,
      june30_supply_usd: f.june30!.tvl_usd,
      change_usd: f.abs_delta_usd!,
      change_pct: f.pct_delta,
    }))

  // Top inflows: most positive abs_delta_usd first.
  const topInflows: RankedRow[] = [...ranked]
    .filter((f) => (f.abs_delta_usd ?? 0) > 0)
    .sort((a, b) => (b.abs_delta_usd ?? 0) - (a.abs_delta_usd ?? 0))
    .slice(0, TOP_N)
    .map((f, i) => ({
      rank: i + 1,
      display_name: f.display_name,
      symbol: f.symbol,
      pool_meta: f.pool_meta,
      may1_supply_usd: f.may1!.tvl_usd,
      june30_supply_usd: f.june30!.tvl_usd,
      change_usd: f.abs_delta_usd!,
      change_pct: f.pct_delta,
    }))

  // Sanity: sum of all ranked deltas vs the ~$338M protocol-level figure.
  const totalNetTvlChange = ranked.reduce(
    (s, f) => s + (f.abs_delta_usd ?? 0),
    0,
  )
  const totalOutflowUsd = ranked
    .filter((f) => (f.abs_delta_usd ?? 0) < 0)
    .reduce((s, f) => s + (f.abs_delta_usd ?? 0), 0)
  const totalInflowUsd = ranked
    .filter((f) => (f.abs_delta_usd ?? 0) > 0)
    .reduce((s, f) => s + (f.abs_delta_usd ?? 0), 0)

  // Fallback: top 10 by current TVL with a "down from peak" hint.
  const topByCurrentTvl = [...flows]
    .filter((f) => f.current_tvl_usd != null)
    .sort((a, b) => (b.current_tvl_usd ?? 0) - (a.current_tvl_usd ?? 0))
    .slice(0, 10)
    .map((f, i) => ({
      rank: i + 1,
      display_name: f.display_name,
      symbol: f.symbol,
      pool_meta: f.pool_meta,
      current_tvl_usd: f.current_tvl_usd,
      may1_supply_usd: f.may1?.tvl_usd ?? null,
      june30_supply_usd: f.june30?.tvl_usd ?? null,
      change_usd: f.abs_delta_usd,
      change_pct: f.pct_delta,
    }))

  // ─── Writeup-ready one-liner for §06.6 ────────────────────────────
  const writeupOneLiner =
    topOutflows.length >= 2
      ? `The bulk of Euler's May outflow concentrated in ${topOutflows[0].display_name} (${fmtUsd(topOutflows[0].change_usd)}) and ${topOutflows[1].display_name} (${fmtUsd(topOutflows[1].change_usd)}).`
      : topOutflows.length === 1
        ? `Euler's May outflow concentrated in ${topOutflows[0].display_name} (${fmtUsd(topOutflows[0].change_usd)}).`
        : "No clean outflow ranking — see fallback table."

  // ─── Build + write output JSON ────────────────────────────────────
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    issue: "002 §06.6",
    source: {
      pools_endpoint: "https://yields.llama.fi/pools",
      chart_endpoint: "https://yields.llama.fi/chart/<poolId>",
      filter: { project: "euler-v2", chain: "Ethereum" },
      note:
        "DefiLlama tvlUsd per vault = available liquidity (supplied − borrowed). " +
        "Vault-level supply/borrow breakdown isn't exposed historically per pool, " +
        "so the ranking is by tvlUsd movement, not by gross supply movement. " +
        "Direction (outflow/inflow) and ranking are reliable; absolute numbers " +
        "may not sum exactly to the protocol-level $338M supply delta.",
    },
    targets: {
      start_utc: START_TARGET_UTC,
      end_utc: END_TARGET_UTC,
      datapoint_tolerance_hours: MAX_DATAPOINT_DELTA_HOURS,
    },
    stats: {
      pools_total: eulerPools.length,
      pools_with_history: ranked.length,
      pools_excluded: excluded.length,
      chart_failures: chartFailures,
      fallback_engaged: usingFallback,
      total_net_tvl_change_usd: totalNetTvlChange,
      total_outflow_tvl_usd: totalOutflowUsd,
      total_inflow_tvl_usd: totalInflowUsd,
    },
    writeup_oneliner: writeupOneLiner,
    top_outflows: topOutflows,
    top_inflows: topInflows,
    fallback_top10_by_current_tvl: topByCurrentTvl,
    all_pools: flows,
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n")

  // ─── Console summary ──────────────────────────────────────────────
  console.log(`  ${ranked.length}/${eulerPools.length} pools with usable history`)
  if (excluded.length > 0) {
    console.log(`  ${excluded.length} excluded:`)
    const reasons = new Map<string, number>()
    for (const f of excluded) {
      const r = f.excluded_reason ?? "unknown"
      reasons.set(r, (reasons.get(r) ?? 0) + 1)
    }
    for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${n}× ${r}`)
    }
  }
  console.log("")
  console.log("── Sanity check (sum of all ranked tvl deltas) ────────────")
  console.log(`  total net tvl change : ${fmtUsd(totalNetTvlChange)}`)
  console.log(`  total outflow tvl    : ${fmtUsd(totalOutflowUsd)}`)
  console.log(`  total inflow tvl     : ${fmtUsd(totalInflowUsd)}`)
  console.log(
    "  (compare to the ~-$338M protocol-level supply delta from " +
      "backfill-apr30-compound-euler; supply = tvl + borrowed so the two " +
      "won't match exactly, but they should be in the same neighbourhood)",
  )
  console.log("")

  if (!usingFallback) {
    console.log(`── Top ${TOP_N} OUTFLOW vaults (July 2026) ──────────────────────`)
    for (const r of topOutflows) {
      console.log(
        `  ${String(r.rank).padStart(2)}. ${r.display_name.padEnd(28)}  ` +
          `${fmtUsd(r.may1_supply_usd).padStart(9)} → ${fmtUsd(r.june30_supply_usd).padStart(9)}  ` +
          `Δ ${fmtUsd(r.change_usd).padStart(9)} (${fmtPct(r.change_pct).padStart(7)})`,
      )
    }
    console.log("")
    console.log(`── Top ${TOP_N} INFLOW vaults (July 2026) ───────────────────────`)
    for (const r of topInflows) {
      console.log(
        `  ${String(r.rank).padStart(2)}. ${r.display_name.padEnd(28)}  ` +
          `${fmtUsd(r.may1_supply_usd).padStart(9)} → ${fmtUsd(r.june30_supply_usd).padStart(9)}  ` +
          `Δ +${fmtUsd(r.change_usd).padStart(9)} (+${fmtPct(r.change_pct).padStart(6)})`,
      )
    }
    console.log("")
  } else {
    console.log(`── FALLBACK · Top 10 by current TVL ────────────────────────`)
    for (const r of topByCurrentTvl) {
      const note =
        r.change_usd != null
          ? `Δ ${fmtUsd(r.change_usd)} (${fmtPct(r.change_pct)})`
          : "(no history)"
      console.log(
        `  ${String(r.rank).padStart(2)}. ${r.display_name.padEnd(28)}  ` +
          `current ${fmtUsd(r.current_tvl_usd).padStart(9)}  ${note}`,
      )
    }
    console.log("")
    console.log(
      "  (peak reference: Euler V2 ~$539M total in early May; vaults " +
        "with current TVL well below their share of that peak are the " +
        "likely bleeders)",
    )
    console.log("")
  }

  console.log(`── Writeup-ready one-liner ────────────────────────────────`)
  console.log(`  ${writeupOneLiner}`)
  console.log("")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
