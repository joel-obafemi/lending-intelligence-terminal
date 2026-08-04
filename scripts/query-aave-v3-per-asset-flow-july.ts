/**
 * Per-asset decomposition of Aave V3's July 2026 constant-price net flow
 * across the FULL MONTH. For Issue 004, verifies whether the protocol-level
 * net inflow was USDC-driven, non-USDC-driven, or mixed.
 *
 *   npx tsx scripts/query-aave-v3-per-asset-flow-july.ts
 *
 * Follows the same fetchProtocolHistory → suppliedByAssetQty × latest_price
 * methodology used by query-aave-july-daily-flows.ts and query-aave-
 * outflow-days-by-asset-july.ts. Sums per-asset daily deltas across every
 * day in July (July 1 to July 31); the ranked per-asset sum is the
 * decomposition of the month's protocol-level constant-price flow.
 *
 * Output: content/snapshots/2026-07-aave-v3-per-asset-flow.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fetchProtocolHistory } from "../lib/defillama"

const AAVE_V3_DEFILLAMA_SLUG = "aave-v3"
const JULY_FIRST_UTC = "2026-07-01T00:00:00Z"
const JULY_LAST_UTC = "2026-07-31T23:59:00Z"
const OUTPUT_PATH = "content/snapshots/2026-07-aave-v3-per-asset-flow.json"

function utcDayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

interface AssetTotal {
  asset: string
  cumulative_delta_usd: number
  contributing_days: number
  price_latest: number
}

async function main() {
  console.log("Aave V3 per-asset July 2026 flow (constant-price, full month)")
  console.log("")

  const julyStart = Math.floor(new Date(JULY_FIRST_UTC).getTime() / 1000)
  const julyEnd = Math.floor(new Date(JULY_LAST_UTC).getTime() / 1000)

  console.log("[1/3] Fetching Aave V3 protocol history from DefiLlama …")
  const hist = await fetchProtocolHistory(AAVE_V3_DEFILLAMA_SLUG)
  console.log(`  suppliedByAssetQty: ${hist.suppliedByAssetQty.length} daily points`)
  console.log(`  suppliedByAsset (USD): ${hist.suppliedByAsset.length} daily points`)
  console.log("")

  console.log("[2/3] Computing latest per-asset prices …")
  // latest_price[asset] = usd_latest / qty_latest, using the most recent
  // day where BOTH are present and non-zero.
  const latestPriceByAsset = new Map<string, number>()
  const usdByDayByAsset = new Map<string, Map<number, number>>()
  const qtyByDayByAsset = new Map<string, Map<number, number>>()
  for (const pt of hist.suppliedByAsset) {
    for (const [asset, usd] of Object.entries(pt.tokens)) {
      if (!usdByDayByAsset.has(asset)) usdByDayByAsset.set(asset, new Map())
      usdByDayByAsset.get(asset)!.set(pt.timestamp, usd)
    }
  }
  for (const pt of hist.suppliedByAssetQty) {
    for (const [asset, qty] of Object.entries(pt.tokens)) {
      if (!qtyByDayByAsset.has(asset)) qtyByDayByAsset.set(asset, new Map())
      qtyByDayByAsset.get(asset)!.set(pt.timestamp, qty)
    }
  }
  const allAssets = new Set([...usdByDayByAsset.keys(), ...qtyByDayByAsset.keys()])
  for (const asset of allAssets) {
    const usdMap = usdByDayByAsset.get(asset) ?? new Map()
    const qtyMap = qtyByDayByAsset.get(asset) ?? new Map()
    const sharedDays = [...qtyMap.keys()].filter((t) => usdMap.has(t)).sort((a, b) => b - a)
    for (const t of sharedDays) {
      const q = qtyMap.get(t)!
      const u = usdMap.get(t)!
      if (q > 0 && u > 0) {
        latestPriceByAsset.set(asset, u / q)
        break
      }
    }
  }
  console.log(`  latest prices resolved for ${latestPriceByAsset.size} assets`)
  console.log("")

  console.log("[3/3] Summing per-asset constant-price deltas across July …")
  const totals = new Map<string, AssetTotal>()
  for (const asset of qtyByDayByAsset.keys()) {
    const price = latestPriceByAsset.get(asset)
    if (!price) continue
    const qtyMap = qtyByDayByAsset.get(asset)!
    const julyQtyDays = [...qtyMap.keys()]
      .filter((t) => t >= julyStart - 86400 && t <= julyEnd + 86400)
      .sort((a, b) => a - b)
    if (julyQtyDays.length < 2) continue
    let cumDeltaUsd = 0
    let contributingDays = 0
    for (let i = 1; i < julyQtyDays.length; i++) {
      const t = julyQtyDays[i]
      const tPrev = julyQtyDays[i - 1]
      // Only accrue the delta if the CURRENT day is within July proper
      // (t >= julyStart and t <= julyEnd)
      if (t < julyStart || t > julyEnd + 86400) continue
      const q = qtyMap.get(t)!
      const qPrev = qtyMap.get(tPrev)!
      const dUsd = (q - qPrev) * price
      cumDeltaUsd += dUsd
      contributingDays++
    }
    if (contributingDays === 0) continue
    totals.set(asset, {
      asset,
      cumulative_delta_usd: cumDeltaUsd,
      contributing_days: contributingDays,
      price_latest: price,
    })
  }

  const ranked = [...totals.values()].sort(
    (a, b) => Math.abs(b.cumulative_delta_usd) - Math.abs(a.cumulative_delta_usd),
  )
  const sum = ranked.reduce((s, r) => s + r.cumulative_delta_usd, 0)

  console.log("")
  console.log("── Ranked per-asset July 2026 constant-price flow ────────────")
  console.log("  Asset       Δ USD           Days   Price")
  for (const r of ranked.slice(0, 20)) {
    console.log(
      `  ${r.asset.padEnd(10)} ${(r.cumulative_delta_usd / 1e6).toFixed(2).padStart(10)}M   ${String(r.contributing_days).padStart(3)}    $${r.price_latest.toFixed(6)}`,
    )
  }
  console.log("")
  console.log(`  Sum across all assets: ${(sum / 1e6).toFixed(2)}M USD`)
  console.log("")

  const payload = {
    source: {
      script: "scripts/query-aave-v3-per-asset-flow-july.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      methodology:
        "Per-day, per-asset delta = (qty_D − qty_{D-1}) × latest_price. Sum across all days in July 2026. Constant-price methodology matches the daily-flows CSV convention.",
    },
    window: { first_day_utc: "2026-07-01", last_day_utc: "2026-07-31" },
    per_asset_ranked: ranked.map((r) => ({
      asset: r.asset,
      cumulative_delta_usd: r.cumulative_delta_usd,
      cumulative_delta_millions: Number((r.cumulative_delta_usd / 1e6).toFixed(2)),
      contributing_days: r.contributing_days,
      price_latest_usd: r.price_latest,
    })),
    reconciliation: {
      per_asset_sum_usd: sum,
      per_asset_sum_millions: Number((sum / 1e6).toFixed(2)),
    },
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
