/**
 * One-shot — cross-protocol supply APY dispersion at July 31, 2026 for
 * USDC, USDT, and WETH across the six protocols. For Issue 002 §03.
 *
 *   npm run query:rate-dispersion-july
 *
 * Data source NOTE (read before citing):
 *   The original brief asked the script to read from the `rate_snapshots`
 *   Neon table. That table only contains rows for 2026-04-24 and -25 —
 *   the `snapshot:rates` cron stopped firing well before June 30 — so it
 *   cannot answer the target-date question on its own. We pivot to
 *   DefiLlama Yields `/chart/<poolId>` per representative pool, which
 *   carries full daily apyBase history and gives an equivalent reading.
 *   When `rate_snapshots` is back-filled, this script can be re-pointed
 *   at it; the output schema is unchanged.
 *
 * Definitions:
 *   - "dispersion" per asset per day = max(supply_apy) − min(supply_apy)
 *     across the protocols that have a row for that asset on that day,
 *     expressed in basis points (1pp = 100bps).
 *   - "twelve-month average dispersion" = arithmetic mean of daily
 *     dispersions over the trailing 365 days ending June 30, using only
 *     days where ≥2 protocols had data for the asset.
 *   - "ratio" = july31_dispersion / twelve_month_average. >1 means June 30
 *     is wider than the 12-month baseline; <1 means it's tighter.
 *
 * Representative-pool selection:
 *   For each (protocol, asset) we pick the single largest TVL pool that
 *   matches `project=<protocol_yields_slug>, chain=Ethereum, symbol=<asset>`.
 *   Morpho selects its largest curated vault for the asset (same
 *   convention the dashboard's Rate Monitor uses). If a protocol does
 *   not list an asset at all (e.g. Compound V3's base markets), it is
 *   excluded from THAT asset's dispersion and named under
 *   excluded_protocols.
 *
 * Output: content/snapshots/2026-07-rate-dispersion.json
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
const TARGET_DATE = "2026-07-31"
const TARGET_TOLERANCE_HOURS = 48
const TRAILING_WINDOW_DAYS = 365
const ASSETS = ["USDC", "USDT", "WETH"] as const
const PROTOCOLS = [
  { slug: "aave-v3", name: "Aave V3", yields_projects: ["aave-v3"] },
  { slug: "spark", name: "Spark", yields_projects: ["sparklend", "spark"] },
  { slug: "morpho-blue", name: "Morpho", yields_projects: ["morpho-blue"] },
  { slug: "fluid", name: "Fluid", yields_projects: ["fluid-lending", "fluid"] },
  { slug: "compound-v3", name: "Compound V3", yields_projects: ["compound-v3"] },
  { slug: "euler-v2", name: "Euler V2", yields_projects: ["euler-v2"] },
] as const
const OUTPUT_PATH = "content/snapshots/2026-07-rate-dispersion.json"
const FETCH_CONCURRENCY = 4

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtPct(n: number | null, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(decimals)}%`
}

function fmtBps(n: number | null, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(decimals)}bps`
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return out
}

/** Bucket a chart timestamp to its UTC date string ("YYYY-MM-DD"). */
function utcDayKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function pickClosest(
  series: YieldChartPoint[],
  targetSec: number,
): YieldChartPoint | null {
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

// ─── Output schema ───────────────────────────────────────────────────────

interface ProtocolApy {
  protocol_slug: string
  protocol_name: string
  supply_apy_pct: number
  source_pool_id: string
  source_pool_meta: string | null
}

interface DispersionRow {
  asset: string
  representative_pools: Array<{
    protocol_slug: string
    pool_id: string
    pool_meta: string | null
    tvl_usd: number | null
  }>
  july31: {
    target_date: string
    per_protocol: ProtocolApy[]
    excluded_protocols: string[]
    max_supply_apy_pct: number | null
    min_supply_apy_pct: number | null
    dispersion_bps: number | null
    leader_protocol: string | null
    laggard_protocol: string | null
  }
  twelve_month: {
    window_start_date: string
    window_end_date: string
    daily_dispersions_bps: Array<{ day: string; dispersion_bps: number; protocol_count: number }>
    observed_days: number
    avg_dispersion_bps: number | null
    median_dispersion_bps: number | null
    min_dispersion_bps: number | null
    max_dispersion_bps: number | null
  }
  ratio_july31_vs_12mo_avg: number | null
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const targetSec = Math.floor(new Date(`${TARGET_DATE}T23:59:00Z`).getTime() / 1000)
  const tolerance = TARGET_TOLERANCE_HOURS * 3600
  const windowEnd = new Date(`${TARGET_DATE}T23:59:00Z`)
  const windowStart = new Date(windowEnd)
  windowStart.setUTCDate(windowStart.getUTCDate() - (TRAILING_WINDOW_DAYS - 1))
  const windowStartKey = windowStart.toISOString().slice(0, 10)
  const windowEndKey = windowEnd.toISOString().slice(0, 10)

  console.log(`Rate dispersion @ ${TARGET_DATE} — USDC, USDT, WETH × 6 protocols`)
  console.log("")

  // ─── Stage 1: pull /pools and pick representatives ─────────────────
  console.log("[1/3] Fetching DefiLlama Yields /pools and selecting representatives …")
  const allPools = await fetchAllYieldPools()

  function findRepresentative(
    protocolYieldsProjects: readonly string[],
    asset: string,
  ): YieldPool | null {
    const candidates = allPools.filter(
      (p) =>
        protocolYieldsProjects.includes(p.project) &&
        p.chain === "Ethereum" &&
        (p.symbol ?? "").toUpperCase() === asset.toUpperCase(),
    )
    if (candidates.length === 0) return null
    return candidates.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0]
  }

  interface RepresentativeEntry {
    asset: string
    protocol: (typeof PROTOCOLS)[number]
    pool: YieldPool | null
  }
  const representatives: RepresentativeEntry[] = []
  for (const asset of ASSETS) {
    for (const protocol of PROTOCOLS) {
      representatives.push({
        asset,
        protocol,
        pool: findRepresentative(protocol.yields_projects, asset),
      })
    }
  }
  for (const r of representatives) {
    const pool = r.pool
    const tag = pool
      ? `pool=${pool.pool} tvl=$${((pool.tvlUsd ?? 0) / 1e6).toFixed(1)}M poolMeta=${JSON.stringify((pool as any).poolMeta ?? null)}`
      : "(not listed)"
    console.log(
      `  ${r.asset.padEnd(5)} ${r.protocol.slug.padEnd(14)} ${tag}`,
    )
  }
  console.log("")

  // ─── Stage 2: pull /chart per representative ──────────────────────
  console.log(
    `[2/3] Fetching /chart for ${representatives.filter((r) => r.pool != null).length} representative pools …`,
  )
  interface ChartedEntry extends RepresentativeEntry {
    chart: YieldChartPoint[]
  }
  const charted: ChartedEntry[] = await mapConcurrent(
    representatives,
    FETCH_CONCURRENCY,
    async (r) => {
      if (!r.pool) return { ...r, chart: [] }
      try {
        const c = await fetchYieldChart(r.pool.pool)
        return {
          ...r,
          chart: c.filter(
            (p) => typeof p.apyBase === "number" && Number.isFinite(p.apyBase as number),
          ),
        }
      } catch {
        return { ...r, chart: [] }
      }
    },
  )
  console.log("")

  // ─── Stage 3: per-asset June 30 + 12-month aggregation ────────────
  console.log("[3/3] Computing per-asset July 31 + 12-month dispersion …")
  const perAsset: DispersionRow[] = []
  for (const asset of ASSETS) {
    const protocolEntries = charted.filter((c) => c.asset === asset)

    // ── June 30 reading per protocol ──
    const junePerProtocol: ProtocolApy[] = []
    const juneExcluded: string[] = []
    for (const e of protocolEntries) {
      if (!e.pool || e.chart.length === 0) {
        juneExcluded.push(e.protocol.slug)
        continue
      }
      const closest = pickClosest(e.chart, targetSec)
      if (!closest || Math.abs(closest.timestamp - targetSec) > tolerance) {
        juneExcluded.push(e.protocol.slug)
        continue
      }
      const apy = closest.apyBase
      if (apy == null || !Number.isFinite(apy)) {
        juneExcluded.push(e.protocol.slug)
        continue
      }
      junePerProtocol.push({
        protocol_slug: e.protocol.slug,
        protocol_name: e.protocol.name,
        supply_apy_pct: apy,
        source_pool_id: e.pool.pool,
        source_pool_meta: ((e.pool as any).poolMeta as string | null) ?? null,
      })
    }
    let juneMax: number | null = null
    let juneMin: number | null = null
    let leader: string | null = null
    let laggard: string | null = null
    let juneDispersionBps: number | null = null
    if (junePerProtocol.length >= 2) {
      const sorted = [...junePerProtocol].sort(
        (a, b) => a.supply_apy_pct - b.supply_apy_pct,
      )
      juneMin = sorted[0].supply_apy_pct
      juneMax = sorted[sorted.length - 1].supply_apy_pct
      laggard = sorted[0].protocol_slug
      leader = sorted[sorted.length - 1].protocol_slug
      juneDispersionBps = (juneMax - juneMin) * 100
    }

    // ── 12-month rolling dispersion ──
    // Bucket each chart point by UTC day, then for each day in the window
    // compute dispersion across the protocols that have a value that day.
    const byDay = new Map<string, Map<string, number>>()
    for (const e of protocolEntries) {
      if (!e.pool || e.chart.length === 0) continue
      for (const pt of e.chart) {
        if (pt.timestamp < Math.floor(windowStart.getTime() / 1000)) continue
        if (pt.timestamp > Math.floor(windowEnd.getTime() / 1000)) continue
        const apy = pt.apyBase
        if (apy == null || !Number.isFinite(apy)) continue
        const day = utcDayKey(pt.timestamp)
        const m = byDay.get(day) ?? new Map<string, number>()
        // Latest sample wins for that day (chart series can have multiple
        // hourly stamps per day on some endpoints).
        m.set(e.protocol.slug, apy)
        byDay.set(day, m)
      }
    }
    const dailyDispersions: Array<{ day: string; dispersion_bps: number; protocol_count: number }> = []
    for (const [day, perProto] of [...byDay.entries()].sort()) {
      const apys = [...perProto.values()]
      if (apys.length < 2) continue
      const max = Math.max(...apys)
      const min = Math.min(...apys)
      dailyDispersions.push({
        day,
        dispersion_bps: (max - min) * 100,
        protocol_count: apys.length,
      })
    }
    const vals = dailyDispersions.map((d) => d.dispersion_bps)
    const avg =
      vals.length > 0 ? vals.reduce((s, n) => s + n, 0) / vals.length : null
    const med = median(vals)
    const minD = vals.length > 0 ? Math.min(...vals) : null
    const maxD = vals.length > 0 ? Math.max(...vals) : null
    const ratio =
      juneDispersionBps != null && avg != null && avg !== 0
        ? juneDispersionBps / avg
        : null

    perAsset.push({
      asset,
      representative_pools: protocolEntries
        .filter((e) => e.pool != null)
        .map((e) => ({
          protocol_slug: e.protocol.slug,
          pool_id: e.pool!.pool,
          pool_meta: ((e.pool as any).poolMeta as string | null) ?? null,
          tvl_usd: e.pool!.tvlUsd ?? null,
        })),
      july31: {
        target_date: TARGET_DATE,
        per_protocol: junePerProtocol,
        excluded_protocols: juneExcluded,
        max_supply_apy_pct: juneMax,
        min_supply_apy_pct: juneMin,
        dispersion_bps: juneDispersionBps,
        leader_protocol: leader,
        laggard_protocol: laggard,
      },
      twelve_month: {
        window_start_date: windowStartKey,
        window_end_date: windowEndKey,
        daily_dispersions_bps: dailyDispersions,
        observed_days: dailyDispersions.length,
        avg_dispersion_bps: avg,
        median_dispersion_bps: med,
        min_dispersion_bps: minD,
        max_dispersion_bps: maxD,
      },
      ratio_july31_vs_12mo_avg: ratio,
    })
  }

  // ─── Write JSON ───────────────────────────────────────────────────
  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    issue: "002 §03 (cross-protocol rate dispersion)",
    target_date: TARGET_DATE,
    trailing_window_days: TRAILING_WINDOW_DAYS,
    assets: [...ASSETS],
    protocols_scope: PROTOCOLS.map((p) => p.slug),
    source: {
      pivot_note:
        "Original brief specified rate_snapshots Neon table; that table " +
        "stopped accumulating data after 2026-04-25 (snapshot:rates cron " +
        "halted), so it cannot answer the target-date question. Pivoted to " +
        "DefiLlama Yields /chart/<poolId> per representative pool — same " +
        "data shape (daily apyBase), equivalent reading.",
      pool_selection:
        "Largest TVL pool per (project=<yields_slug>, chain=Ethereum, symbol=<asset>). For Aave V3 this resolves to the Core market (poolMeta=null) by default. Morpho's representative is the largest curated vault for the asset.",
      apy_field: "apyBase from /chart (gross of reward incentives)",
      caveat:
        "A protocol with no /chart history within ±48h of the target date is excluded from that asset's dispersion (see per-asset excluded_protocols). Excluded protocols are also absent from the 12-month rolling calc for days they had no row.",
    },
    per_asset: perAsset,
  }
  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n")

  // ─── Console summary ──────────────────────────────────────────────
  console.log("")
  console.log("── Per-asset dispersion summary ───────────────────────────")
  console.log(
    `  ${"Asset".padEnd(6)} ${"July 31".padStart(10)}  ${"12mo avg".padStart(10)}  ${"ratio".padStart(8)}  protocols`,
  )
  for (const a of perAsset) {
    const ratioStr =
      a.ratio_july31_vs_12mo_avg != null
        ? `${a.ratio_july31_vs_12mo_avg.toFixed(2)}×`
        : "—"
    const excl = a.july31.excluded_protocols.length
      ? `  excluded: ${a.july31.excluded_protocols.join(", ")}`
      : ""
    console.log(
      `  ${a.asset.padEnd(6)} ${fmtBps(a.july31.dispersion_bps).padStart(10)}  ` +
        `${fmtBps(a.twelve_month.avg_dispersion_bps).padStart(10)}  ` +
        `${ratioStr.padStart(8)}  ` +
        `${a.july31.per_protocol.length}/6${excl}`,
    )
  }
  console.log("")
  console.log("── Per-protocol July 31 supply APYs by asset ───────────────")
  for (const a of perAsset) {
    console.log(`  ${a.asset}`)
    for (const p of [...a.july31.per_protocol].sort(
      (x, y) => y.supply_apy_pct - x.supply_apy_pct,
    )) {
      const meta = p.source_pool_meta ? ` [${p.source_pool_meta}]` : ""
      console.log(
        `    ${p.protocol_name.padEnd(14)} ${fmtPct(p.supply_apy_pct).padStart(7)}${meta}`,
      )
    }
    if (a.july31.excluded_protocols.length > 0) {
      console.log(`    excluded: ${a.july31.excluded_protocols.join(", ")}`)
    }
  }
  console.log("")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
