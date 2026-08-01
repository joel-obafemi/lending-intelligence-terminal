/**
 * July 2026 daily liquidations across four ingested protocols (Aave V3,
 * Spark, Morpho, Fluid). Groups events by UTC day so we can identify
 * whether June 5, 2026 was a material spike (a day whose collateral
 * seized was >$50M or >3x the prior 7-day median).
 *
 *   npx tsx scripts/query-liquidations-july-daily.ts
 *
 * Output: content/snapshots/2026-07-liquidations-daily.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { liquidatorSql, hasLiquidatorDb } from "../lib/liquidator-db"

const WINDOW_START_UTC = "2026-07-01T00:00:00Z"
const WINDOW_END_UTC = "2026-07-31T23:59:00Z"
const OUTPUT_PATH = "content/snapshots/2026-07-liquidations-daily.json"

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "     —"
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

async function main() {
  if (!hasLiquidatorDb()) {
    console.error("LIQUIDATOR_DATABASE_URL is not set in .env")
    process.exit(1)
  }
  const startSec = Math.floor(new Date(WINDOW_START_UTC).getTime() / 1000)
  const endSec = Math.floor(new Date(WINDOW_END_UTC).getTime() / 1000)
  console.log("July 2026 daily liquidations")
  console.log(`  window: ${WINDOW_START_UTC} → ${WINDOW_END_UTC}`)
  console.log("")

  // Daily rollup across all protocols combined.
  const dailyRows = await liquidatorSql<{
    day: string
    n: string
    col: number | null
    debt: number | null
    profit: number | null
  }>`
    SELECT
      to_char(to_timestamp(block_timestamp) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS n,
      COALESCE(SUM(collateral_amount_usd), 0) AS col,
      COALESCE(SUM(debt_amount_usd), 0) AS debt,
      COALESCE(SUM(gross_profit_usd), 0) AS profit
    FROM liquidation_events
    WHERE block_timestamp >= ${startSec}
      AND block_timestamp <= ${endSec}
    GROUP BY day
    ORDER BY day ASC
  `

  // TODO(issue-004): the material-liquidation-day analysis below is
  // Issue-003-specific (June 5 was the June spike). July's material day, if
  // any, is unknown until capture. Re-add the per-protocol query, rank,
  // trailing-median spike check, and the payload.july_N_analysis block once
  // the July thesis workshop identifies the day. The daily series above is
  // generic and still captured.

  // Ranked daily by collateral seized to see whether June 5 tops.
  console.log("Daily totals (sector-wide, top 10 by collateral seized):")
  const ranked = [...dailyRows].sort((a, b) => Number(b.col ?? 0) - Number(a.col ?? 0))
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${r.day}  events=${String(r.n).padStart(5)}  coll=${fmtUsd(Number(r.col ?? 0)).padStart(9)}  debt=${fmtUsd(Number(r.debt ?? 0)).padStart(9)}`)
  }
  console.log("")

  // TODO(issue-004): June-5 rank / trailing-median spike / per-protocol
  // console block removed with the query above. Restore for July's material
  // liquidation day once identified in the thesis workshop.

  const payload = {
    generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    window: { start_utc: WINDOW_START_UTC, end_utc: WINDOW_END_UTC },
    daily: dailyRows.map((r) => ({
      day_utc: r.day,
      events: Number(r.n ?? 0),
      collateral_seized_usd: Number(r.col ?? 0),
      debt_repaid_usd: Number(r.debt ?? 0),
      gross_profit_usd: Number(r.profit ?? 0),
    })),
    // TODO(issue-004): material-liquidation-day analysis object removed
    // pending the July thesis workshop (June's was june_5_analysis). Re-add
    // as july_N_analysis once the day is identified.
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
