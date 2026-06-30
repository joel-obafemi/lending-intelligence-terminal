/**
 * One-shot — APY trajectory across May for the Euler V2 vaults that
 * drove the outflow. Reads pool IDs from the previous run's output
 * (`content/snapshots/2026-06-euler-vault-flows.json`) and pulls
 * DefiLlama `/chart/<poolId>` per vault to extract apyBase on key
 * dates in May. For Issue 003 §06.6 yield-vs-event analysis.
 *
 *   npm run query:euler-vault-apys
 *   # or: npx tsx scripts/query-euler-vault-apys.ts
 *
 * The question this script answers: was the bleed YIELD-DRIVEN
 * (APYs collapsed across the month, capital chased better rates
 * elsewhere) or EVENT-DRIVEN (APYs held but capital left anyway,
 * pointing to security / governance / curator-mandated rotation)?
 *
 * Output: top_outflows (and top_inflows for contrast) get their May 1,
 * May 15, May 31, May average, May min, and May max apyBase. The
 * console summary highlights any vault whose May 31 APY is dramatically
 * below its May 1 value — that's the yield-collapse story.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { readFileSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fetchYieldChart, type YieldChartPoint } from "../lib/defillama"

// ─── Constants ───────────────────────────────────────────────────────────
const INPUT_PATH = "content/snapshots/2026-06-euler-vault-flows.json"
const OUTPUT_PATH = "content/snapshots/2026-06-euler-vault-apys.json"

// Probe dates within May. Mid-month gives us a clue whether the change
// was abrupt or gradual; min/max across May surface any short-lived
// spike or capitulation we'd otherwise miss with three discrete points.
const PROBE_DATES_UTC = [
  { label: "may1", iso: "2026-06-01T00:00:00Z" },
  { label: "may15", iso: "2026-06-15T00:00:00Z" },
  { label: "may31", iso: "2026-06-30T23:59:00Z" },
]
const WINDOW_START_UTC = "2026-06-01T00:00:00Z"
const WINDOW_END_UTC = "2026-06-30T23:59:00Z"

const MAX_DATAPOINT_DELTA_HOURS = 48
const FETCH_CONCURRENCY = 4

// ─── Types — shape of the upstream flows JSON we read ────────────────────
interface FlowsFileRanked {
  rank: number
  display_name: string
  symbol: string
  pool_meta: string | null
  may1_supply_usd: number
  may31_supply_usd: number
  change_usd: number
  change_pct: number | null
}

interface FlowsFile {
  top_outflows: FlowsFileRanked[]
  top_inflows: FlowsFileRanked[]
  all_pools: Array<{
    pool_id: string
    display_name: string
    symbol: string
    pool_meta: string | null
  }>
}

// ─── Output schema ───────────────────────────────────────────────────────
interface ApyProbe {
  date_label: string
  target_utc: string
  apy_base_pct: number | null
  source_timestamp_iso: string | null
  delta_from_target_sec: number | null
}

interface ApyTrajectory {
  pool_id: string
  display_name: string
  symbol: string
  pool_meta: string | null
  probes: ApyProbe[]
  /** Average apyBase across all May datapoints. */
  may_avg_apy_pct: number | null
  /** Minimum apyBase observed in May (rate compression low). */
  may_min_apy_pct: number | null
  /** Maximum apyBase observed in May. */
  may_max_apy_pct: number | null
  /** apyBase May 31 minus May 1, in percentage points. Positive = APY rose. */
  may_delta_pp: number | null
  /** Quick classification for the console summary. */
  hypothesis: "yield_collapse" | "yield_stable" | "yield_rose" | "ambiguous" | "no_data"
}

// ─── Helpers ─────────────────────────────────────────────────────────────

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

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  const workers: Promise<void>[] = []
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return out
}

function fmtPct(n: number | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(decimals)}%`
}

function fmtPp(n: number | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(decimals)}pp`
}

/** Heuristic for the console summary line — what story does the May
 *  trajectory most likely tell? Calibrated for stablecoin lending APYs
 *  in the 1-20% range; not robust against pathological cases. */
function classifyHypothesis(t: {
  may_delta_pp: number | null
  may_max_apy_pct: number | null
  may_min_apy_pct: number | null
}): ApyTrajectory["hypothesis"] {
  if (t.may_delta_pp == null) return "no_data"
  // Yield collapse: APY dropped > 1.5pp AND lost > 30% of its starting
  // level. Both conditions catch the "8% → 3%" case but ignore a
  // "0.5% → 0.1%" twitchy series.
  if (
    t.may_max_apy_pct != null &&
    t.may_min_apy_pct != null &&
    t.may_delta_pp < -1.5 &&
    t.may_max_apy_pct > 0 &&
    t.may_min_apy_pct / t.may_max_apy_pct < 0.7
  ) {
    return "yield_collapse"
  }
  if (t.may_delta_pp > 1.5) return "yield_rose"
  if (Math.abs(t.may_delta_pp) < 0.5) return "yield_stable"
  return "ambiguous"
}

// ─── Per-vault trajectory build ──────────────────────────────────────────

async function buildTrajectory(input: {
  pool_id: string
  display_name: string
  symbol: string
  pool_meta: string | null
}): Promise<ApyTrajectory> {
  const base: Omit<
    ApyTrajectory,
    | "probes"
    | "may_avg_apy_pct"
    | "may_min_apy_pct"
    | "may_max_apy_pct"
    | "may_delta_pp"
    | "hypothesis"
  > = {
    pool_id: input.pool_id,
    display_name: input.display_name,
    symbol: input.symbol,
    pool_meta: input.pool_meta,
  }

  type ApyPoint = { timestamp: number; apyBase: number }
  let raw: YieldChartPoint[] = []
  try {
    raw = await fetchYieldChart(input.pool_id)
  } catch (err: any) {
    return {
      ...base,
      probes: PROBE_DATES_UTC.map((d) => ({
        date_label: d.label,
        target_utc: d.iso,
        apy_base_pct: null,
        source_timestamp_iso: null,
        delta_from_target_sec: null,
      })),
      may_avg_apy_pct: null,
      may_min_apy_pct: null,
      may_max_apy_pct: null,
      may_delta_pp: null,
      hypothesis: "no_data",
    }
  }
  // Keep only points with a real apyBase number.
  const chart: ApyPoint[] = raw
    .filter(
      (p): p is YieldChartPoint & { apyBase: number } =>
        typeof p.apyBase === "number" && Number.isFinite(p.apyBase),
    )
    .map((p) => ({ timestamp: p.timestamp, apyBase: p.apyBase }))

  // ─── Build the discrete probes for the three target dates ────────
  const cap = MAX_DATAPOINT_DELTA_HOURS * 3600
  const probes: ApyProbe[] = PROBE_DATES_UTC.map((d) => {
    const targetSec = Math.floor(new Date(d.iso).getTime() / 1000)
    const point = pickClosest(chart, targetSec)
    const delta = point ? point.timestamp - targetSec : null
    const inRange = point != null && Math.abs(delta!) <= cap
    return {
      date_label: d.label,
      target_utc: d.iso,
      apy_base_pct: inRange ? point!.apyBase : null,
      source_timestamp_iso: inRange
        ? new Date(point!.timestamp * 1000).toISOString()
        : null,
      delta_from_target_sec: inRange ? delta : null,
    }
  })

  // ─── May window stats (avg / min / max / Δ) ────────────────────
  const winStart = Math.floor(new Date(WINDOW_START_UTC).getTime() / 1000)
  const winEnd = Math.floor(new Date(WINDOW_END_UTC).getTime() / 1000)
  const inWindow = chart.filter(
    (p) => p.timestamp >= winStart && p.timestamp <= winEnd,
  )
  const apys = inWindow.map((p) => p.apyBase)
  const avg =
    apys.length > 0 ? apys.reduce((s, n) => s + n, 0) / apys.length : null
  const min = apys.length > 0 ? Math.min(...apys) : null
  const max = apys.length > 0 ? Math.max(...apys) : null

  const may1 = probes.find((p) => p.date_label === "may1")?.apy_base_pct ?? null
  const may31 = probes.find((p) => p.date_label === "may31")?.apy_base_pct ?? null
  const delta = may1 != null && may31 != null ? may31 - may1 : null

  const traj: ApyTrajectory = {
    ...base,
    probes,
    may_avg_apy_pct: avg,
    may_min_apy_pct: min,
    may_max_apy_pct: max,
    may_delta_pp: delta,
    hypothesis: "no_data",
  }
  traj.hypothesis = classifyHypothesis(traj)
  return traj
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Read the upstream flows JSON.
  const inPath = join(process.cwd(), INPUT_PATH)
  let flowsFile: FlowsFile
  try {
    flowsFile = JSON.parse(readFileSync(inPath, "utf-8")) as FlowsFile
  } catch (err: any) {
    console.error(`Could not read ${INPUT_PATH}: ${err?.message ?? err}`)
    console.error(`Run \`npm run query:euler-vault-flows\` first.`)
    process.exit(1)
  }

  // Resolve full vault metadata for each ranked entry via all_pools so we
  // pick up the canonical pool_meta even if a top_outflows row was
  // truncated.
  const byName = new Map(
    flowsFile.all_pools.map((p) => [p.display_name, p]),
  )
  function resolve(r: FlowsFileRanked) {
    const meta = byName.get(r.display_name)
    return {
      pool_id: meta?.pool_id ?? "",
      display_name: r.display_name,
      symbol: r.symbol,
      pool_meta: r.pool_meta ?? meta?.pool_meta ?? null,
    }
  }

  const targets = [
    ...flowsFile.top_outflows.map(resolve),
    ...flowsFile.top_inflows.map(resolve),
  ].filter((t) => t.pool_id.length > 0)
  const isOutflow = (idx: number) => idx < flowsFile.top_outflows.length

  console.log(
    `Pulling apyBase trajectories for ${targets.length} vaults ` +
      `(${flowsFile.top_outflows.length} outflows + ${flowsFile.top_inflows.length} inflows) …`,
  )
  console.log("")

  const trajectories = await mapConcurrent(targets, FETCH_CONCURRENCY, (t) =>
    buildTrajectory(t),
  )
  const outflowTrajectories = trajectories.slice(
    0,
    flowsFile.top_outflows.length,
  )
  const inflowTrajectories = trajectories.slice(
    flowsFile.top_outflows.length,
  )

  // ─── Write output JSON ────────────────────────────────────────────
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    issue: "002 §06.6 (yield-vs-event analysis)",
    source: {
      input: INPUT_PATH,
      chart_endpoint: "https://yields.llama.fi/chart/<poolId>",
      note:
        "apyBase is DefiLlama's headline supply APY (gross of reward " +
        "tokens). Use it for stable comparisons — apy (= apyBase + " +
        "apyReward) would conflate incentive-driven and rate-driven " +
        "movements.",
    },
    probes: PROBE_DATES_UTC,
    window: { start_utc: WINDOW_START_UTC, end_utc: WINDOW_END_UTC },
    outflow_vault_trajectories: outflowTrajectories,
    inflow_vault_trajectories: inflowTrajectories,
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n")

  // ─── Console summary ──────────────────────────────────────────────
  console.log("── Outflow vaults · apyBase trajectory (May 2026) ─────────")
  for (const t of outflowTrajectories) {
    const may1 = t.probes.find((p) => p.date_label === "may1")?.apy_base_pct ?? null
    const may15 = t.probes.find((p) => p.date_label === "may15")?.apy_base_pct ?? null
    const may31 = t.probes.find((p) => p.date_label === "may31")?.apy_base_pct ?? null
    console.log(
      `  ${t.display_name.padEnd(28)}  ` +
        `May 1: ${fmtPct(may1).padStart(6)}  ` +
        `Mid: ${fmtPct(may15).padStart(6)}  ` +
        `May 31: ${fmtPct(may31).padStart(6)}  ` +
        `Δ ${fmtPp(t.may_delta_pp).padStart(8)}  ` +
        `[${t.hypothesis}]`,
    )
    console.log(
      `${" ".repeat(30)}  May avg: ${fmtPct(t.may_avg_apy_pct).padStart(6)}  ` +
        `min: ${fmtPct(t.may_min_apy_pct).padStart(6)}  ` +
        `max: ${fmtPct(t.may_max_apy_pct).padStart(6)}`,
    )
  }
  console.log("")
  console.log("── Inflow vaults · apyBase trajectory (for contrast) ─────")
  for (const t of inflowTrajectories) {
    const may1 = t.probes.find((p) => p.date_label === "may1")?.apy_base_pct ?? null
    const may31 = t.probes.find((p) => p.date_label === "may31")?.apy_base_pct ?? null
    console.log(
      `  ${t.display_name.padEnd(28)}  ` +
        `May 1: ${fmtPct(may1).padStart(6)}  ` +
        `May 31: ${fmtPct(may31).padStart(6)}  ` +
        `Δ ${fmtPp(t.may_delta_pp).padStart(8)}  ` +
        `[${t.hypothesis}]`,
    )
  }
  console.log("")

  // ─── Narrative aid ────────────────────────────────────────────────
  const collapsed = outflowTrajectories.filter(
    (t) => t.hypothesis === "yield_collapse",
  )
  const stable = outflowTrajectories.filter(
    (t) => t.hypothesis === "yield_stable",
  )
  console.log("── Narrative classification ───────────────────────────────")
  console.log(
    `  ${collapsed.length}/${outflowTrajectories.length} bleeding vaults show APY collapse ` +
      `(> -1.5pp AND >30% of starting level erased)`,
  )
  console.log(
    `  ${stable.length}/${outflowTrajectories.length} bleeding vaults had STABLE APY ` +
      `(|Δ| < 0.5pp) — capital left despite unchanged yield`,
  )
  if (collapsed.length === outflowTrajectories.length) {
    console.log("")
    console.log(
      "  → Story: yield-driven. Capital chased better rates elsewhere.",
    )
  } else if (stable.length === outflowTrajectories.length) {
    console.log("")
    console.log(
      "  → Story: event-driven. APYs held but capital still left — " +
        "investigate governance, security, or curator-mandated rotation.",
    )
  } else if (collapsed.length > 0 && stable.length > 0) {
    console.log("")
    console.log(
      "  → Story: mixed. Some vaults look yield-driven, others event-driven. " +
        "Worth disaggregating in the writeup.",
    )
  }
  console.log("")

  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
