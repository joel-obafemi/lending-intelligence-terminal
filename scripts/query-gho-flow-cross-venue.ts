/**
 * Cross-venue GHO supply + borrow flow — Aave V3 vs Fluid, last 90 days.
 *
 *   npm run query:gho-flow
 *
 * Investigates whether the matrix-level finding (Fluid runs the only
 * supply-yield market for GHO among the major Ethereum lending venues)
 * is backed by a sustained flow story. The matrix is point-in-time;
 * a flow read requires history.
 *
 * Output:
 *   1. Console: 30/60/90-day deltas for each (protocol, side) pair,
 *      plus a daily table for the most recent 30 days.
 *   2. content/snapshots/2026-07-gho-cross-venue-flow.json — joined
 *      time series for re-use in prose and chart cards.
 *
 * Method:
 *   - fetchProtocolHistory pulls the DefiLlama protocol payload (same
 *     data the dashboard already uses via lib/net-flows-sankey.ts).
 *   - suppliedByAsset / borrowedByAsset are filtered for the GHO key.
 *     Fluid GHO supply is the real signal — that's the lend-side market.
 *     Aave V3 GHO is mostly the mint-facilitator side, surfaced through
 *     borrowedByAsset rather than suppliedByAsset.
 *   - We report USD figures from DefiLlama directly (they apply current
 *     spot price daily; for GHO this is ~1.00 USD with minimal drift,
 *     so USD ≈ token quantity).
 *
 * Caveat:
 *   - DefiLlama's per-day GHO entries for Aave V3 sometimes lag the
 *     mint-facilitator on-chain count by 12-24 hours. Treat reported
 *     latest-day figures as approximate.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fetchProtocolHistory, type AssetDayPoint } from "../lib/defillama"

const AAVE_V3_SLUG = "aave-v3"
// Fluid is multi-slug on DefiLlama — the dashboard's lib/fluid-stats.ts
// aggregates across these four. fluid-lending alone is one slice; the
// real Fluid GHO surface is the sum.
const FLUID_SLUGS = ["fluid-lending", "fluid-dex", "fluid-lite", "fluid"] as const
const GHO = "GHO"
const LOOKBACK_DAYS = 90
const TABLE_DAYS = 30
const OUTPUT_PATH = "content/snapshots/2026-07-gho-cross-venue-flow.json"

// ─── Helpers ─────────────────────────────────────────────────────────────

type Series = Array<{ date: string; usd: number }>

/** Extract a single-asset USD time series from an AssetDayPoint array. */
function extractAsset(points: AssetDayPoint[], asset: string): Series {
  return points
    .map((p) => {
      const usd = p.tokens[asset]
      if (usd === undefined || usd === null) return null
      const dateIso = new Date(p.timestamp * 1000).toISOString().slice(0, 10)
      return { date: dateIso, usd: Number(usd) }
    })
    .filter((x): x is { date: string; usd: number } => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function latest(s: Series) {
  return s.length ? s[s.length - 1] : null
}

function findLookback(s: Series, daysAgo: number) {
  if (!s.length) return null
  const last = s[s.length - 1]
  const lastTs = new Date(last.date + "T00:00:00Z").getTime()
  const targetTs = lastTs - daysAgo * 86400_000
  let best: { date: string; usd: number } | null = null
  for (const row of s) {
    const ts = new Date(row.date + "T00:00:00Z").getTime()
    if (ts <= targetTs) best = row
  }
  return best
}

function pctChange(current: number, prior: number) {
  if (!prior) return null
  return ((current - prior) / prior) * 100
}

function fmtUsd(n: number | null | undefined) {
  if (n === null || n === undefined) return "—"
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtPct(n: number | null) {
  if (n === null) return "—"
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`
}

// ─── Main ────────────────────────────────────────────────────────────────

/** Sum per-asset series across Fluid sub-slugs, per date. Missing days
 *  on a slug are treated as 0 contribution (we don't impute). */
function aggregateAcrossSlugs(perSlug: Record<string, Series>): Series {
  const byDate: Record<string, number> = {}
  for (const series of Object.values(perSlug)) {
    for (const { date, usd } of series) {
      byDate[date] = (byDate[date] ?? 0) + usd
    }
  }
  return Object.entries(byDate)
    .map(([date, usd]) => ({ date, usd }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function main() {
  console.log(`\nFetching protocol history…`)
  console.log(`  Aave V3: ${AAVE_V3_SLUG}`)
  console.log(`  Fluid:   ${FLUID_SLUGS.join(", ")} (multi-slug aggregation)`)

  const aavePromise = fetchProtocolHistory(AAVE_V3_SLUG)

  // Per-slug fetch — tolerate individual slug failures so one bad slug
  // doesn't kill the aggregate.
  const fluidResults = await Promise.all(
    FLUID_SLUGS.map(async (slug) => {
      try {
        const ph = await fetchProtocolHistory(slug)
        return { slug, ph, ok: true as const, error: null as string | null }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`  [warn] slug ${slug} failed: ${msg}`)
        return { slug, ph: null, ok: false as const, error: msg }
      }
    })
  )
  const aave = await aavePromise

  // Per-slug GHO series — kept for transparency in the snapshot + console.
  const fluidPerSlug: {
    supplied: Record<string, Series>
    borrowed: Record<string, Series>
  } = { supplied: {}, borrowed: {} }
  for (const { slug, ph, ok } of fluidResults) {
    if (!ok || !ph) continue
    fluidPerSlug.supplied[slug] = extractAsset(ph.suppliedByAsset, GHO)
    fluidPerSlug.borrowed[slug] = extractAsset(ph.borrowedByAsset, GHO)
  }

  const series = {
    aave_supplied: extractAsset(aave.suppliedByAsset, GHO),
    aave_borrowed: extractAsset(aave.borrowedByAsset, GHO),
    fluid_supplied: aggregateAcrossSlugs(fluidPerSlug.supplied),
    fluid_borrowed: aggregateAcrossSlugs(fluidPerSlug.borrowed),
  }

  // ─── Per-slug breakdown for traceability ─────────────────────────────
  console.log(`\n=== Fluid per-slug GHO supplied (latest) ===`)
  let aggregateLatestSupplied = 0
  let dominantSlug = { slug: "—", usd: 0 }
  for (const slug of FLUID_SLUGS) {
    const s = fluidPerSlug.supplied[slug]
    const last = s ? latest(s) : null
    const usd = last?.usd ?? 0
    aggregateLatestSupplied += usd
    if (usd > dominantSlug.usd) dominantSlug = { slug, usd }
    const lastDate = last?.date ?? "—"
    const status = !fluidResults.find((r) => r.slug === slug)?.ok
      ? "[FAILED]"
      : s && s.length === 0
        ? "[no GHO]"
        : ""
    console.log(`  ${slug.padEnd(16)} ${fmtUsd(usd).padStart(10)}  (last=${lastDate}) ${status}`)
  }
  console.log(`  ${"AGGREGATE".padEnd(16)} ${fmtUsd(aggregateLatestSupplied).padStart(10)}`)
  console.log(`  (largest slug: ${dominantSlug.slug} at ${fmtUsd(dominantSlug.usd)})`)

  // Staleness check across slugs — flag if dates diverge by >3 days.
  const slugLatestDates = FLUID_SLUGS
    .map((slug) => latest(fluidPerSlug.supplied[slug] ?? [])?.date)
    .filter((d): d is string => !!d)
    .sort()
  if (slugLatestDates.length >= 2) {
    const earliestTs = new Date(slugLatestDates[0] + "T00:00:00Z").getTime()
    const latestTs = new Date(slugLatestDates[slugLatestDates.length - 1] + "T00:00:00Z").getTime()
    const spanDays = (latestTs - earliestTs) / 86400_000
    if (spanDays > 3) {
      console.log(
        `  [flag] Per-slug latest dates span ${spanDays} days (${slugLatestDates[0]} → ${slugLatestDates[slugLatestDates.length - 1]}). Aggregate may include stale legs.`
      )
    }
  }

  // Token-key sanity — log first few keys per slug to confirm "GHO" key
  // is the right casing. (Cheap to do, expensive if we miss it.)
  console.log(`\n=== Token-key sanity (first 6 keys per slug, supplied side) ===`)
  for (const { slug, ph, ok } of fluidResults) {
    if (!ok || !ph) continue
    const firstPoint = ph.suppliedByAsset[ph.suppliedByAsset.length - 1]
    const keys = firstPoint ? Object.keys(firstPoint.tokens).slice(0, 6) : []
    const ghoVariants = firstPoint
      ? Object.keys(firstPoint.tokens).filter((k) => k.toUpperCase() === "GHO")
      : []
    console.log(`  ${slug.padEnd(16)} keys=[${keys.join(", ")}]  GHO-variants: ${ghoVariants.length ? ghoVariants.join(",") : "(none)"}`)
  }

  console.log(`\n=== Series lengths (aggregated) ===`)
  for (const [k, v] of Object.entries(series)) {
    console.log(`  ${k.padEnd(20)} ${v.length} days, first=${v[0]?.date ?? "—"}, last=${v.at(-1)?.date ?? "—"}`)
  }

  console.log(`\n=== Latest reading + lookback comparisons ===`)
  const summary: Record<string, any> = {}
  for (const [k, v] of Object.entries(series)) {
    const last = latest(v)
    const d30 = findLookback(v, 30)
    const d60 = findLookback(v, 60)
    const d90 = findLookback(v, 90)
    summary[k] = {
      latest: last,
      d30,
      d60,
      d90,
      delta_30d_usd: last && d30 ? last.usd - d30.usd : null,
      delta_60d_usd: last && d60 ? last.usd - d60.usd : null,
      delta_90d_usd: last && d90 ? last.usd - d90.usd : null,
      pct_30d: last && d30 ? pctChange(last.usd, d30.usd) : null,
      pct_60d: last && d60 ? pctChange(last.usd, d60.usd) : null,
      pct_90d: last && d90 ? pctChange(last.usd, d90.usd) : null,
    }
    console.log(
      `\n  [${k}]\n` +
      `    latest ${last?.date ?? "—"}: ${fmtUsd(last?.usd)}\n` +
      `    30d ago (${d30?.date ?? "—"}): ${fmtUsd(d30?.usd)}  Δ ${fmtUsd(summary[k].delta_30d_usd)} (${fmtPct(summary[k].pct_30d)})\n` +
      `    60d ago (${d60?.date ?? "—"}): ${fmtUsd(d60?.usd)}  Δ ${fmtUsd(summary[k].delta_60d_usd)} (${fmtPct(summary[k].pct_60d)})\n` +
      `    90d ago (${d90?.date ?? "—"}): ${fmtUsd(d90?.usd)}  Δ ${fmtUsd(summary[k].delta_90d_usd)} (${fmtPct(summary[k].pct_90d)})`
    )
  }

  // ─── Daily table for the last TABLE_DAYS ─────────────────────────────
  console.log(`\n=== Daily series, last ${TABLE_DAYS} days ===`)
  console.log(
    `${"date".padEnd(12)}` +
    `${"Aave V3 GHO sup.".padStart(18)}` +
    `${"Aave V3 GHO bor.".padStart(18)}` +
    `${"Fluid GHO sup.".padStart(18)}` +
    `${"Fluid GHO bor.".padStart(18)}`
  )

  // Use the supply-side of Fluid as the primary date axis (it's the
  // signal the matrix headline is about). If empty, fall back to Aave.
  const axis = series.fluid_supplied.length ? series.fluid_supplied : series.aave_borrowed
  const recentDates = axis.slice(-TABLE_DAYS).map((p) => p.date)

  const lookup = (s: Series) => Object.fromEntries(s.map((r) => [r.date, r.usd]))
  const lk = {
    aave_supplied: lookup(series.aave_supplied),
    aave_borrowed: lookup(series.aave_borrowed),
    fluid_supplied: lookup(series.fluid_supplied),
    fluid_borrowed: lookup(series.fluid_borrowed),
  }

  for (const d of recentDates) {
    console.log(
      `${d.padEnd(12)}` +
      `${fmtUsd(lk.aave_supplied[d]).padStart(18)}` +
      `${fmtUsd(lk.aave_borrowed[d]).padStart(18)}` +
      `${fmtUsd(lk.fluid_supplied[d]).padStart(18)}` +
      `${fmtUsd(lk.fluid_borrowed[d]).padStart(18)}`
    )
  }

  // ─── Cross-correlation interpretation ────────────────────────────────
  const last = {
    aave_sup: latest(series.aave_supplied)?.usd,
    aave_bor: latest(series.aave_borrowed)?.usd,
    fluid_sup: latest(series.fluid_supplied)?.usd,
    fluid_bor: latest(series.fluid_borrowed)?.usd,
  }
  const d30 = {
    aave_sup: findLookback(series.aave_supplied, 30)?.usd,
    aave_bor: findLookback(series.aave_borrowed, 30)?.usd,
    fluid_sup: findLookback(series.fluid_supplied, 30)?.usd,
    fluid_bor: findLookback(series.fluid_borrowed, 30)?.usd,
  }

  console.log(`\n=== Interpretation (30d window) ===`)
  if (last.aave_bor && d30.aave_bor && last.fluid_sup && d30.fluid_sup) {
    const aave_bor_d = last.aave_bor - d30.aave_bor
    const fluid_sup_d = last.fluid_sup - d30.fluid_sup
    console.log(`  Aave V3 GHO borrowed (mint facilitator):  Δ ${fmtUsd(aave_bor_d)} over 30d`)
    console.log(`  Fluid GHO supplied (lend side):           Δ ${fmtUsd(fluid_sup_d)} over 30d`)
    if (aave_bor_d > 0 && fluid_sup_d > 0) {
      console.log(`  → Both rising. Consistent with mint-and-supply carry trade.`)
    } else if (aave_bor_d > 0 && fluid_sup_d <= 0) {
      console.log(`  → Aave mints up, Fluid supply flat/down. GHO being borrowed elsewhere.`)
    } else if (aave_bor_d <= 0 && fluid_sup_d > 0) {
      console.log(`  → Fluid supply up while Aave mint flat/down. Re-allocation, not new mint.`)
    } else {
      console.log(`  → Both flat or declining. Cross-venue GHO flow is not currently the story.`)
    }
  }

  // ─── Persist snapshot ────────────────────────────────────────────────
  const snapshotPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(snapshotPath), { recursive: true })
  writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        snapshot_date: new Date().toISOString().slice(0, 10),
        captured_at: new Date().toISOString(),
        source: {
          primary: "DefiLlama protocol API (chainTvls.Ethereum.tokensInUsd)",
          methodology:
            "Aave V3 GHO USD is pulled from the aave-v3 slug. Fluid GHO USD is summed across the fluid-lending, fluid-dex, fluid-lite, and fluid DefiLlama slugs — same aggregation lib/fluid-stats.ts uses for the dashboard. Per-slug breakdown is preserved in fluid_per_slug for traceability. " +
            "30/60/90-day deltas computed against the closest earlier-or-equal date in each aggregated series.",
        },
        lookback_days: LOOKBACK_DAYS,
        fluid_slug_status: fluidResults.map((r) => ({
          slug: r.slug,
          ok: r.ok,
          error: r.error,
          gho_supplied_days: (fluidPerSlug.supplied[r.slug] ?? []).length,
          gho_borrowed_days: (fluidPerSlug.borrowed[r.slug] ?? []).length,
          latest_supplied_usd:
            latest(fluidPerSlug.supplied[r.slug] ?? [])?.usd ?? null,
        })),
        fluid_per_slug: fluidPerSlug,
        summary,
        series,
      },
      null,
      2
    )
  )
  console.log(`\nWrote snapshot: ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error("[gho-flow] FAILED:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
