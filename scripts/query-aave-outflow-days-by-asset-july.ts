/**
 * Per-asset decomposition of the biggest July 2026 net-supply outflow days
 * on Aave V3 Ethereum — for Issue 003 (July 31, 2026 data capture).
 * Issue 003 variant of scripts/query-aave-outflow-days-by-asset.ts.
 * TARGET_DAYS_UTC below is a single placeholder; user will edit after
 * inspecting July daily-flows output.
 *
 *   npm run query:aave-outflow-days-by-asset-july
 *
 * Target dates (illustrative placeholders; fill after inspecting the July
 * daily-flows output, same as TARGET_DAYS_UTC below):
 *   2026-07-15  example outflow day — actual figures TBD at capture
 *   2026-07-18  example outflow day — actual figures TBD at capture
 *   2026-07-29  example outflow day — actual figures TBD at capture
 *
 * Hypothesis: post-May-14 outflow spikes on Aave V3 were NOT LRT-driven
 * but driven by other assets (stables, WSTETH, …). The WEETH share of
 * each total is small (-$20M / $130M = 15%), so the explanation for the
 * remaining ~85% lives elsewhere. This script puts a name on it.
 *
 * Source + methodology:
 *   Same `fetchProtocolHistory` → suppliedByAssetQty path used by
 *   scripts/query-aave-may-daily-flows.ts and lib/net-flows-sankey.ts.
 *   1. Compute a per-asset "latest price" from the most recent (usd, qty)
 *      pair: price = usd / qty.
 *   2. For each target day D, find the qty snapshot closest to D (and the
 *      qty snapshot closest to D-1).
 *   3. Per-asset delta_usd = (qty_D − qty_{D-1}) × latest_price.
 *      Positive ⇒ inflow contribution to that day's net.
 *      Negative ⇒ outflow contribution to that day's net.
 *   4. Rank, surface top 5 outflows + top 3 inflows per day.
 *
 * Caveat (carried from daily-flows script): constant-price methodology
 * uses the LATEST observed price per asset, so a delta on, say, May 15
 * is "the qty change × the May 31 price." That's exactly what we want for
 * filtering price drift out of flow signal, but the absolute USDs should
 * not be cross-cited against the dashboard's price-current TVL.
 *
 * Output: content/snapshots/2026-07-aave-outflow-days-by-asset.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fetchProtocolHistory } from "../lib/defillama"

const AAVE_V3_DEFILLAMA_SLUG = "aave-v3"
const TARGET_DAYS_UTC: string[] = [] // TODO(issue-004): fill after inspecting July daily-flows output (the June capture used June 15).
const OUTPUT_PATH = "content/snapshots/2026-07-aave-outflow-days-by-asset.json"

function utcDayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

function dayKeyToTs(dayKey: string): number {
  return Math.floor(new Date(`${dayKey}T00:00:00Z`).getTime() / 1000)
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "       —"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

interface AssetDelta {
  asset: string
  delta_usd: number
  // Carried alongside for context, but ranking key is delta_usd.
  qty_t: number
  qty_t_minus_1: number
  price_latest: number
}

interface DayResult {
  date_utc: string
  total_constant_price_net_flow_usd: number
  total_assets_observed: number
  top_5_outflows: AssetDelta[]
  top_3_inflows: AssetDelta[]
}

async function main(): Promise<void> {
  console.log("Aave V3 — per-asset breakdown of the three biggest July 2026 outflow days")
  console.log("")

  console.log("[1/3] Fetching DefiLlama Aave V3 protocol history …")
  const history = await fetchProtocolHistory(AAVE_V3_DEFILLAMA_SLUG)
  const qtySeries = [...history.suppliedByAssetQty].sort((a, b) => a.timestamp - b.timestamp)
  const usdSeries = [...history.suppliedByAsset].sort((a, b) => a.timestamp - b.timestamp)
  console.log(
    `  qty points: ${qtySeries.length} · usd points: ${usdSeries.length} · ` +
      `assets observed at last snapshot: ${qtySeries.at(-1)?.tokens ? Object.keys(qtySeries.at(-1)!.tokens).length : 0}`,
  )
  console.log("")

  // ─── Latest prices (same as daily-flows script) ──────────────────────
  const usdByTs = new Map<number, Record<string, number>>()
  for (const pt of usdSeries) usdByTs.set(pt.timestamp, pt.tokens)
  const latestPrices = new Map<string, number>()
  for (let i = qtySeries.length - 1; i >= 0; i--) {
    const qtyTokens = qtySeries[i].tokens
    const usdTokens = usdByTs.get(qtySeries[i].timestamp) ?? {}
    for (const [asset, qty] of Object.entries(qtyTokens)) {
      if (latestPrices.has(asset)) continue
      const usd = usdTokens[asset]
      if (typeof usd === "number" && usd > 0 && qty > 0) {
        latestPrices.set(asset, usd / qty)
      }
    }
  }
  console.log(`[2/3] Resolved latest prices for ${latestPrices.size} assets`)
  console.log("")

  // ─── Index qty snapshots by UTC day ──────────────────────────────────
  // If a day has multiple snapshots we keep the LAST (matches the daily
  // flows convention — DefiLlama publishes per UTC day so duplicates are
  // rare, but be defensive).
  const qtyByDay = new Map<string, Record<string, number>>()
  for (const pt of qtySeries) {
    const day = utcDayKey(pt.timestamp)
    qtyByDay.set(day, pt.tokens)
  }

  function prevDayKey(dayKey: string): string {
    const ts = dayKeyToTs(dayKey)
    return utcDayKey(ts - 86400)
  }

  function dayDelta(dayKey: string): { perAsset: AssetDelta[]; total: number } {
    const today = qtyByDay.get(dayKey)
    const yesterdayKey = prevDayKey(dayKey)
    const yesterday = qtyByDay.get(yesterdayKey)
    if (!today || !yesterday) {
      console.warn(
        `  [warn] missing qty snapshot for ${dayKey} or ${yesterdayKey} — returning empty deltas`,
      )
      return { perAsset: [], total: 0 }
    }
    const allAssets = new Set<string>([...Object.keys(today), ...Object.keys(yesterday)])
    const perAsset: AssetDelta[] = []
    let total = 0
    for (const asset of allAssets) {
      const price = latestPrices.get(asset)
      if (price == null) continue
      const qT = today[asset] ?? 0
      const qP = yesterday[asset] ?? 0
      const delta = (qT - qP) * price
      if (!Number.isFinite(delta) || delta === 0) continue
      perAsset.push({
        asset,
        delta_usd: delta,
        qty_t: qT,
        qty_t_minus_1: qP,
        price_latest: price,
      })
      total += delta
    }
    return { perAsset, total }
  }

  console.log(`[3/3] Building per-asset breakdowns for ${TARGET_DAYS_UTC.length} target days …`)
  const days: DayResult[] = []
  for (const dayKey of TARGET_DAYS_UTC) {
    const { perAsset, total } = dayDelta(dayKey)
    // Outflows = negative, sort ascending (most negative first).
    const outflows = perAsset
      .filter((a) => a.delta_usd < 0)
      .sort((a, b) => a.delta_usd - b.delta_usd)
      .slice(0, 5)
    // Inflows = positive, sort descending.
    const inflows = perAsset
      .filter((a) => a.delta_usd > 0)
      .sort((a, b) => b.delta_usd - a.delta_usd)
      .slice(0, 3)
    days.push({
      date_utc: dayKey,
      total_constant_price_net_flow_usd: total,
      total_assets_observed: perAsset.length,
      top_5_outflows: outflows,
      top_3_inflows: inflows,
    })
  }
  console.log("")

  // ─── Console summary ─────────────────────────────────────────────────
  for (const d of days) {
    console.log(
      `── ${d.date_utc}  net ${fmtUsd(d.total_constant_price_net_flow_usd)}  (${d.total_assets_observed} assets observed) ──`,
    )
    console.log("  Top 5 outflows:")
    for (const a of d.top_5_outflows) {
      console.log(`    ${a.asset.padEnd(8)} ${fmtUsd(a.delta_usd)}`)
    }
    console.log("  Top 3 inflows:")
    for (const a of d.top_3_inflows) {
      console.log(`    ${a.asset.padEnd(8)} ${fmtUsd(a.delta_usd)}`)
    }
    console.log("")
  }

  // ─── Editorial note: does one asset dominate ≥2 of 3 days? ───────────
  // "Dominate" = appears as the #1 outflow on at least 2 of the 3 target days.
  const topOutflowAssets = days
    .map((d) => d.top_5_outflows[0]?.asset)
    .filter(Boolean) as string[]
  const counts = new Map<string, number>()
  for (const a of topOutflowAssets) counts.set(a, (counts.get(a) ?? 0) + 1)
  const dominant = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])[0]

  let editorialNote: string
  if (dominant) {
    editorialNote = `${dominant[0]} is the #1 outflow asset on ${dominant[1]} of the 3 target days — it is the consistent driver of the post-May-14 outflow spikes on Aave V3 Ethereum.`
  } else {
    editorialNote = `No single asset is the #1 outflow on more than 1 of the 3 target days. The three big outflow days were each driven by a different asset; the post-May-14 outflow story on Aave V3 is not one-asset-led.`
  }

  // Also surface USDC + USDT + WSTETH + WEETH cumulative across the three days
  // so the writer can scan the breakdown at a glance.
  const SUMMARY_ASSETS = ["USDC", "USDT", "DAI", "WETH", "WSTETH", "WEETH", "WBTC"]
  const cumulativeByAsset = new Map<string, number>()
  for (const d of days) {
    for (const a of [...d.top_5_outflows, ...d.top_3_inflows]) {
      cumulativeByAsset.set(a.asset, (cumulativeByAsset.get(a.asset) ?? 0) + a.delta_usd)
    }
  }
  const summaryRollup = SUMMARY_ASSETS.map((sym) => ({
    asset: sym,
    cumulative_across_3_days_usd: cumulativeByAsset.get(sym) ?? 0,
  }))

  console.log("── Editorial note ─────────────────────────────────────────")
  console.log(`  ${editorialNote}`)
  console.log("")

  // ─── Write JSON ──────────────────────────────────────────────────────
  const out = {
    source: {
      script: "scripts/query-aave-outflow-days-by-asset.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      data_source:
        "DefiLlama fetchProtocolHistory (suppliedByAssetQty per asset, per day) for protocol slug 'aave-v3'",
      methodology:
        "Per-asset delta on day D = (qty_D − qty_{D-1}) × latest_observed_price. Constant-price flow methodology — isolates real deposit/withdraw activity from collateral price drift. Same data path as scripts/query-aave-may-daily-flows.ts and the dashboard's Sankey aggregator (lib/net-flows-sankey.ts).",
      caveat:
        "USD figures use the LATEST observed price per asset, not the price on the target day. Cross-citing against the dashboard's price-current TVL is not valid — only the net-change figures are.",
      note: editorialNote,
    },
    target_days: days,
    cumulative_across_3_days_by_asset: summaryRollup,
    cumulative_total_across_3_days_usd: days.reduce(
      (s, d) => s + d.total_constant_price_net_flow_usd,
      0,
    ),
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
