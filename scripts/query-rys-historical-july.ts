/**
 * Historical Real Yield Spread series — for Issue 002 §03.
 *
 *   npm run query:rys-historical-july
 *
 * Goal: confirm whether the +154 bps Real Yield Spread reading at June 30,
 * 2026 is the FIRST POSITIVE print of 2026 (or longer). Drives the §03
 * language: if the previous positive print was in 2025, "first positive of
 * 2026" works; if it was earlier, the language needs to be "first positive
 * in N months / since <month>".
 *
 * Source: lib/rates.ts → loadRates().realYieldSpreadHistory. This is the
 * same series the dashboard's Rate Monitor hero chart and verdict card
 * read, so the numbers are wire-compatible with what readers see online.
 *
 * Methodology summary (per lib/rates.ts):
 *   blended_stable_apy = TVL-weighted Σ(apyBase × tvl) across USDC, USDT,
 *                        DAI, USDS pools on Aave V3, Spark, Morpho, Fluid
 *   t_bill            = FRED TB4WK (4-week Treasury bill)
 *   real_yield_spread = blended_stable_apy − t_bill
 *
 *   Positive ⇒ stablecoins out-earn the risk-free rate (depositor's
 *   premium for taking smart-contract / curator / liquidity risk is being
 *   compensated). Negative ⇒ depositors are losing relative to T-bills.
 *
 * Window: HERO_WINDOW_DAYS in rates.ts is 540, so the series covers
 * roughly Nov 2024 → July 2026. Anything before that is "out of window"
 * and we'll surface that distinction explicitly in the JSON.
 *
 * Output: content/snapshots/2026-07-rys-historical.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { loadRates } from "../lib/rates"

const OUTPUT_PATH = "content/snapshots/2026-07-rys-historical.json"
const TARGET_DAY_UTC = "2026-07-31"

function utcDayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

function dayKeyToTs(dayKey: string): number {
  return Math.floor(new Date(`${dayKey}T00:00:00Z`).getTime() / 1000)
}

function fmtPp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  const sign = v >= 0 ? "+" : ""
  return `${sign}${v.toFixed(2)} pp`
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${v.toFixed(2)}%`
}

interface MonthlyReading {
  month_label: string
  day_utc: string
  spread_bps: number | null
  stable_apy_pct: number | null
  t_bill_pct: number | null
}

async function main(): Promise<void> {
  console.log("[1/3] Loading rates payload (this also fetches FRED TB4WK and the per-pool DefiLlama charts) …")
  const rates = await loadRates()
  const history = rates.realYieldSpreadHistory
  console.log(`  realYieldSpreadHistory: ${history.length} daily points`)
  if (history.length === 0) {
    throw new Error("realYieldSpreadHistory came back empty — cannot proceed")
  }
  const seriesStartDay = utcDayKey(history[0].timestamp)
  const seriesEndDay = utcDayKey(history[history.length - 1].timestamp)
  console.log(`  series window: ${seriesStartDay} → ${seriesEndDay}`)
  console.log("")

  // ─── Step 1 — Confirm the June 30 reading ─────────────────────────────
  const targetTs = dayKeyToTs(TARGET_DAY_UTC)
  // Snap to the last day at or before June 30 (the FRED series can lag by
  // a day around weekends, so we don't insist on exact match).
  let junePoint = null as (typeof history)[number] | null
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].timestamp <= targetTs && history[i].spreadPct != null) {
      junePoint = history[i]
      break
    }
  }
  if (!junePoint) {
    throw new Error(`No spread point at or before ${TARGET_DAY_UTC} in the series`)
  }
  const juneDay = utcDayKey(junePoint.timestamp)
  const juneBps = (junePoint.spreadPct as number) * 100
  console.log(`[2/3] June 30 anchor`)
  console.log(`  ${juneDay}: ${fmtPp(junePoint.spreadPct)} (= ${juneBps.toFixed(1)} bps)`)
  console.log(`           stables ${fmtPct(junePoint.stableApyPct)}, T-bill ${fmtPct(junePoint.tBillPct)}`)
  console.log("")

  // ─── Step 2 — Walk backward, find most recent prior positive print ──
  //
  // "Positive" here = spreadPct >= 0. We want the previous day on which
  // depositors out-earned T-bills before the June rebound.
  //
  // We also compute:
  //   • inverted_streak_days: how long the spread sat <0 between that
  //     last positive print and June 30's positive reading.
  //   • previous_positive_streak_end / start: the run of consecutive
  //     positive days that ended at the prior-positive print (so the
  //     writer knows whether the prior positive was a single-day blip
  //     or part of a sustained positive regime).
  const targetIdx = history.findIndex((p) => p.timestamp === junePoint!.timestamp)
  // Walk backward from the day BEFORE july31 looking for spread >= 0.
  let priorPositive: (typeof history)[number] | null = null
  let priorPositiveIdx = -1
  let invertedDays = 0
  for (let i = targetIdx - 1; i >= 0; i--) {
    const pt = history[i]
    if (pt.spreadPct == null) continue
    if (pt.spreadPct >= 0) {
      priorPositive = pt
      priorPositiveIdx = i
      break
    }
    invertedDays += 1
  }
  // Also walk further back to size the prior positive streak.
  let priorPositiveRunStart: (typeof history)[number] | null = null
  if (priorPositive) {
    for (let i = priorPositiveIdx; i >= 0; i--) {
      const pt = history[i]
      if (pt.spreadPct != null && pt.spreadPct >= 0) priorPositiveRunStart = pt
      else break
    }
  }
  const reachedWindowStart = priorPositive == null
  console.log("[3/3] Prior positive search")
  if (priorPositive) {
    console.log(`  Most recent prior positive: ${utcDayKey(priorPositive.timestamp)}  ${fmtPp(priorPositive.spreadPct)}`)
    console.log(`  Inverted streak between them: ${invertedDays} days`)
    if (priorPositiveRunStart) {
      console.log(
        `  That prior positive was part of a run from ${utcDayKey(priorPositiveRunStart.timestamp)} → ${utcDayKey(priorPositive.timestamp)}`,
      )
    }
  } else {
    console.log(
      `  No prior positive print found in the ${history.length}-day window ` +
        `(series starts ${seriesStartDay}); spread has been NEGATIVE for the ENTIRE captured window.`,
    )
    console.log(`  Inverted-streak days observed (within window): ${targetIdx}`)
  }
  console.log("")

  // ─── Step 3 — 12 monthly readings, June 2025 → July 2026 ──────────────
  // We pick the closest available point to each calendar month-end (with
  // a 3-day tolerance so weekend FRED holes don't drop the row).
  const monthlyAnchors: string[] = []
  for (let i = 12; i >= 0; i--) {
    // walk back i months from July 2026
    const d = new Date(Date.UTC(2026, 5 - i + 1, 0)) // last day of month (2026, June - i)
    monthlyAnchors.push(d.toISOString().slice(0, 10))
  }
  function nearestPoint(dayKey: string, toleranceDays = 3) {
    const ts = dayKeyToTs(dayKey)
    let best: (typeof history)[number] | null = null
    let bestDist = Infinity
    for (const pt of history) {
      const d = Math.abs(pt.timestamp - ts)
      if (d <= toleranceDays * 86400 && d < bestDist && pt.spreadPct != null) {
        best = pt
        bestDist = d
      }
    }
    return best
  }
  const monthly: MonthlyReading[] = []
  for (const dayKey of monthlyAnchors) {
    const pt = nearestPoint(dayKey)
    const dt = new Date(`${dayKey}T00:00:00Z`)
    const label = `${dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${dt.getUTCFullYear()}`
    monthly.push({
      month_label: label,
      day_utc: dayKey,
      spread_bps: pt && pt.spreadPct != null ? pt.spreadPct * 100 : null,
      stable_apy_pct: pt?.stableApyPct ?? null,
      t_bill_pct: pt?.tBillPct ?? null,
    })
  }

  // ─── Editorial framing ──────────────────────────────────────────────
  let framing: string
  if (priorPositive) {
    const priorDay = utcDayKey(priorPositive.timestamp)
    const priorYear = priorDay.slice(0, 4)
    if (priorYear < "2026") {
      framing = `July 31, 2026's ${fmtPp(junePoint.spreadPct)} print is the first positive Real Yield Spread reading of 2026. The previous positive print was ${priorDay} (${fmtPp(priorPositive.spreadPct)}); the spread was inverted for ${invertedDays} consecutive days between them.`
    } else {
      framing = `July 31, 2026's ${fmtPp(junePoint.spreadPct)} print follows a prior positive print earlier in 2026 (${priorDay}, ${fmtPp(priorPositive.spreadPct)}). The "first positive of 2026" framing does NOT hold — use "first positive in ${invertedDays} days" or "first positive since ${priorDay}" instead.`
    }
  } else if (reachedWindowStart) {
    framing = `July 31, 2026's ${fmtPp(junePoint.spreadPct)} print is the first positive Real Yield Spread reading in the full captured window (${seriesStartDay} → ${seriesEndDay}). The spread has been NEGATIVE for the entire series — "first positive of 2026" is conservative; "first positive since at least ${seriesStartDay}" is the strongest claim defensible from this data.`
  } else {
    framing = "unable to derive framing"
  }
  console.log("── Editorial framing ──────────────────────────────────────")
  console.log(`  ${framing}`)
  console.log("")

  // ─── Write JSON ─────────────────────────────────────────────────────
  const out = {
    source: {
      script: "scripts/query-rys-historical.ts",
      generated_at_utc: new Date(rates.fetchedAt * 1000).toISOString(),
      data_source: "lib/rates.ts loadRates() → realYieldSpreadHistory",
      methodology:
        "blended_stable_apy (TVL-weighted USDC/USDT/DAI/USDS across Aave V3 / Spark / Morpho / Fluid, from DefiLlama Yields /chart per pool) minus FRED TB4WK 4-week T-bill",
      series_window_days: history.length,
      series_first_day: seriesStartDay,
      series_last_day: seriesEndDay,
    },
    target_anchor: {
      day_utc: juneDay,
      spread_bps: juneBps,
      spread_pp: junePoint.spreadPct,
      stable_apy_pct: junePoint.stableApyPct,
      t_bill_pct: junePoint.tBillPct,
    },
    prior_positive_search: priorPositive
      ? {
          most_recent_prior_positive_day_utc: utcDayKey(priorPositive.timestamp),
          most_recent_prior_positive_spread_pp: priorPositive.spreadPct,
          most_recent_prior_positive_spread_bps:
            priorPositive.spreadPct != null ? priorPositive.spreadPct * 100 : null,
          inverted_streak_days_between: invertedDays,
          prior_positive_run_start_day_utc: priorPositiveRunStart
            ? utcDayKey(priorPositiveRunStart.timestamp)
            : null,
          prior_positive_run_length_days:
            priorPositiveRunStart && priorPositive
              ? Math.round(
                  (priorPositive.timestamp - priorPositiveRunStart.timestamp) / 86400,
                ) + 1
              : null,
        }
      : {
          most_recent_prior_positive_day_utc: null,
          note: `No positive spread print found anywhere in the captured ${history.length}-day window (${seriesStartDay} → ${seriesEndDay}). The spread has been negative for the entire window prior to ${juneDay}.`,
          inverted_streak_days_in_window: targetIdx,
        },
    trajectory_monthly_june2025_june2026: monthly,
    editorial_framing: framing,
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
