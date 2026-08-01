/**
 * One-shot — morpho daily constant-price net supply flow for July 2026,
 * with a WEETH-specific column (present for schema parity; not thesis-relevant here). For Issue 002 §05's rsETH-unpause /
 * WETH-LTV-restoration concentration thesis.
 *
 *   npm run query:morpho-july-daily-flows
 *
 * Output: content/snapshots/2026-07-morpho-daily-flows.csv (CSV, header
 * row included), plus a console summary with the top-3 outflow days and
 * the June 1-13 vs June 14-30 cumulative split.
 *
 * Source + methodology:
 *   No dedicated `net_flows_daily` Neon table exists — the dashboard's
 *   Sankey is computed in-app from DefiLlama `fetchProtocolHistory` token
 *   quantity series (lib/net-flows-sankey.ts). This script uses the same
 *   data path:
 *
 *   1. Pull morpho protocol history from DefiLlama (chainTvls.Ethereum
 *      + Ethereum-borrowed, plus per-asset suppliedByAssetQty + USD).
 *   2. Compute a per-asset "latest price" using the most recent day's
 *      (usd, qty) pair: price = usd / qty.
 *   3. For each day in June, total supplied at constant prices =
 *      Σ asset (qty_today × latest_price). Day-over-day delta of that
 *      number is the constant-price net supply flow — isolating real
 *      deposit/withdraw activity from price drift on the underlying
 *      collateral (this is the same convention the Sankey + the weekly
 *      net-flow series use, see lib/overview.ts → netFlowWeeklySeries).
 *   4. WEETH-specific column (present for schema parity; not thesis-relevant here) applies the same math to the WEETH key only.
 *   5. The "actual" (price-adjusted) end-of-day total is also emitted as
 *      a context column so a reader can sanity-check.
 *
 * Caveat: constant-price methodology bakes in the LATEST observed price.
 * For a fast-moving asset like WEETH, the "June 1 supply" implied by this
 * series is what June 1's QUANTITY would have been worth at the
 * latest-snapshot price, not what it was actually worth on June 1. The
 * point of doing this is precisely to filter price-drift OUT of the flow
 * signal — but it means the absolute USD numbers shouldn't be cross-cited
 * against the dashboard's price-current TVL. Net-CHANGES are the
 * trustworthy quantity here.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { fetchProtocolHistory } from "../lib/defillama"

// ─── Constants ───────────────────────────────────────────────────────────
const PROTOCOL_DEFILLAMA_SLUG = "morpho-blue"
const JULY_FIRST_UTC = "2026-07-01T00:00:00Z"
const JULY_LAST_UTC = "2026-07-31T23:59:00Z"
// TODO(issue-004): thesis split constant removed pending the July thesis
// workshop. The June version split on SPLIT_DAY (rsETH unpause June 14 /
// WETH LTV restoration June 17). Re-add a SPLIT_DAY here and restore the
// consuming block below once July's thesis-relevant split day is known.
const WEETH_KEY = "WEETH"
const OUTPUT_PATH = "content/snapshots/2026-07-morpho-daily-flows.csv"

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "       —"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function utcDayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const julyStart = Math.floor(new Date(JULY_FIRST_UTC).getTime() / 1000)
  const julyEnd = Math.floor(new Date(JULY_LAST_UTC).getTime() / 1000)

  console.log(`morpho July 2026 daily flows (constant-price methodology)`)
  console.log("")

  console.log("[1/3] Fetching DefiLlama morpho protocol history …")
  const history = await fetchProtocolHistory(PROTOCOL_DEFILLAMA_SLUG)
  console.log(
    `  suppliedByAssetQty: ${history.suppliedByAssetQty.length} daily points; ` +
      `assets observed: ${history.suppliedByAssetQty.at(-1)?.tokens ? Object.keys(history.suppliedByAssetQty.at(-1)!.tokens).length : 0}`,
  )
  console.log("")

  // ─── Compute latest price per asset ────────────────────────────────
  // Use the most recent day where both qty AND usd are non-zero per asset.
  const latestPrices = new Map<string, number>()
  // Walk from the most recent end backwards, pulling first non-zero
  // (usd, qty) pair per asset.
  const qtySeries = [...history.suppliedByAssetQty].sort(
    (a, b) => a.timestamp - b.timestamp,
  )
  const usdSeries = [...history.suppliedByAsset].sort(
    (a, b) => a.timestamp - b.timestamp,
  )
  // Index USD by timestamp for fast lookup.
  const usdByTs = new Map<number, Record<string, number>>()
  for (const pt of usdSeries) usdByTs.set(pt.timestamp, pt.tokens)
  // Walk from most recent back.
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
    if (latestPrices.size === Object.keys(qtyTokens).length) break
  }
  console.log(`[2/3] Latest prices resolved for ${latestPrices.size} assets`)
  const weethPrice = latestPrices.get(WEETH_KEY) ?? null
  console.log(`  WEETH latest price: ${weethPrice != null ? `$${weethPrice.toFixed(2)}` : "(not found)"}`)
  console.log("")

  // ─── Build per-day constant-price totals (whole window + WEETH) ───
  // Index by UTC day, capturing the LAST sample for that day if multiple.
  const totalByDay = new Map<string, number>()
  const weethByDay = new Map<string, number>()
  const actualUsdByDay = new Map<string, number>()
  for (const pt of qtySeries) {
    const day = utcDayKey(pt.timestamp)
    let total = 0
    for (const [asset, qty] of Object.entries(pt.tokens)) {
      const price = latestPrices.get(asset)
      if (price == null) continue
      total += qty * price
    }
    totalByDay.set(day, total)
    const weethQty = pt.tokens[WEETH_KEY] ?? 0
    weethByDay.set(day, weethPrice != null ? weethQty * weethPrice : 0)
  }
  for (const pt of usdSeries) {
    const day = utcDayKey(pt.timestamp)
    const actual = Object.values(pt.tokens).reduce((s, v) => s + v, 0)
    actualUsdByDay.set(day, actual)
  }

  // ─── Build July 2026 day-by-day rows ────────────────────────────────
  // We need the previous day (May 31) as the baseline for June 1's delta.
  const days: string[] = []
  for (let d = 0; d < 31; d++) {
    const date = new Date(`${JULY_FIRST_UTC}`)
    date.setUTCDate(date.getUTCDate() + d)
    days.push(date.toISOString().slice(0, 10))
  }
  const baselineDay = "2026-06-30"

  console.log(`[3/3] Building daily flow rows for July 2026 …`)
  interface DailyRow {
    date_utc: string
    aave_v3_constant_price_total_usd: number | null
    aave_v3_actual_total_supply_usd: number | null
    aave_v3_net_supply_change_usd: number | null
    aave_v3_weeth_constant_price_supply_usd: number | null
    aave_v3_weeth_net_supply_change_usd: number | null
  }
  const rows: DailyRow[] = []
  let prevTotal = totalByDay.get(baselineDay) ?? null
  let prevWeeth = weethByDay.get(baselineDay) ?? null
  for (const day of days) {
    const total = totalByDay.get(day) ?? null
    const actual = actualUsdByDay.get(day) ?? null
    const weeth = weethByDay.get(day) ?? null
    const netChange = total != null && prevTotal != null ? total - prevTotal : null
    const weethChange =
      weeth != null && prevWeeth != null ? weeth - prevWeeth : null
    rows.push({
      date_utc: day,
      aave_v3_constant_price_total_usd: total,
      aave_v3_actual_total_supply_usd: actual,
      aave_v3_net_supply_change_usd: netChange,
      aave_v3_weeth_constant_price_supply_usd: weeth,
      aave_v3_weeth_net_supply_change_usd: weethChange,
    })
    if (total != null) prevTotal = total
    if (weeth != null) prevWeeth = weeth
  }

  // ─── Write CSV ─────────────────────────────────────────────────────
  const header = [
    "date_utc",
    "aave_v3_constant_price_total_usd",
    "aave_v3_actual_total_supply_usd",
    "aave_v3_net_supply_change_usd",
    "aave_v3_weeth_constant_price_supply_usd",
    "aave_v3_weeth_net_supply_change_usd",
  ]
  const csvLines = [header.join(",")]
  for (const r of rows) {
    csvLines.push(
      [
        r.date_utc,
        r.aave_v3_constant_price_total_usd?.toFixed(2) ?? "",
        r.aave_v3_actual_total_supply_usd?.toFixed(2) ?? "",
        r.aave_v3_net_supply_change_usd?.toFixed(2) ?? "",
        r.aave_v3_weeth_constant_price_supply_usd?.toFixed(2) ?? "",
        r.aave_v3_weeth_net_supply_change_usd?.toFixed(2) ?? "",
      ].join(","),
    )
  }
  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, csvLines.join("\n") + "\n")

  // ─── Console summary ──────────────────────────────────────────────
  console.log("")
  // Top 3 outflow days = most negative net_change.
  const ranked = [...rows]
    .filter((r) => r.aave_v3_net_supply_change_usd != null)
    .sort(
      (a, b) =>
        (a.aave_v3_net_supply_change_usd as number) -
        (b.aave_v3_net_supply_change_usd as number),
    )
  const topOutflows = ranked.slice(0, 3)
  const topInflows = [...ranked]
    .reverse()
    .slice(0, 3)

  console.log("── Top 3 outflow days in July ──────────────────────────────")
  for (const r of topOutflows) {
    const weethTag =
      r.aave_v3_weeth_net_supply_change_usd != null
        ? `  (of which WEETH: ${fmtUsd(r.aave_v3_weeth_net_supply_change_usd)})`
        : ""
    console.log(
      `  ${r.date_utc}  ${fmtUsd(r.aave_v3_net_supply_change_usd)}${weethTag}`,
    )
  }
  console.log("")
  console.log("── Top 3 inflow days in July (for symmetry) ───────────────")
  for (const r of topInflows) {
    console.log(
      `  ${r.date_utc}  ${fmtUsd(r.aave_v3_net_supply_change_usd)}`,
    )
  }
  console.log("")

  // TODO(issue-004): pre-/post-event cumulative split removed pending the
  // July thesis workshop (depended on SPLIT_DAY, commented out above). The
  // June version reported cumulative net flow on either side of the
  // rsETH-unpause / WETH-LTV-restoration day. Restore once July's split
  // day is known.
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
