/**
 * June 2026 daily liquidations across four ingested protocols (Aave V3,
 * Spark, Morpho, Fluid). Groups events by UTC day so we can identify
 * whether June 5, 2026 was a material spike (a day whose collateral
 * seized was >$50M or >3x the prior 7-day median).
 *
 *   npx tsx scripts/query-liquidations-june-daily.ts
 *
 * Output: content/snapshots/2026-06-liquidations-daily.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { liquidatorSql, hasLiquidatorDb } from "../lib/liquidator-db"

const WINDOW_START_UTC = "2026-06-01T00:00:00Z"
const WINDOW_END_UTC = "2026-06-30T23:59:00Z"
const OUTPUT_PATH = "content/snapshots/2026-06-liquidations-daily.json"

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
  console.log("June 2026 daily liquidations")
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

  // Per-protocol on June 5 specifically.
  const june5Start = Math.floor(new Date("2026-06-05T00:00:00Z").getTime() / 1000)
  const june5End = Math.floor(new Date("2026-06-05T23:59:59Z").getTime() / 1000)
  const june5PerProto = await liquidatorSql<{
    protocol: string
    n: string
    col: number | null
    debt: number | null
  }>`
    SELECT
      protocol,
      COUNT(*)::bigint AS n,
      COALESCE(SUM(collateral_amount_usd), 0) AS col,
      COALESCE(SUM(debt_amount_usd), 0) AS debt
    FROM liquidation_events
    WHERE block_timestamp >= ${june5Start}
      AND block_timestamp <= ${june5End}
    GROUP BY protocol
    ORDER BY col DESC
  `

  // Ranked daily by collateral seized to see whether June 5 tops.
  console.log("Daily totals (sector-wide, top 10 by collateral seized):")
  const ranked = [...dailyRows].sort((a, b) => Number(b.col ?? 0) - Number(a.col ?? 0))
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${r.day}  events=${String(r.n).padStart(5)}  coll=${fmtUsd(Number(r.col ?? 0)).padStart(9)}  debt=${fmtUsd(Number(r.debt ?? 0)).padStart(9)}`)
  }
  console.log("")

  // Find June 5 rank
  const june5Row = dailyRows.find((r) => r.day === "2026-06-05")
  const rank5 = ranked.findIndex((r) => r.day === "2026-06-05") + 1
  console.log(`June 5, 2026: ${june5Row ? `rank ${rank5}/${dailyRows.length}, coll=${fmtUsd(Number(june5Row.col ?? 0))}, events=${june5Row.n}` : "NO EVENTS"}`)
  console.log("")

  // 7-day trailing median around June 5 (May 29 - June 4)
  const priorWindow = dailyRows.filter((r) => r.day >= "2026-05-29" && r.day <= "2026-06-04")
  const priorCols = priorWindow.map((r) => Number(r.col ?? 0)).sort((a, b) => a - b)
  const priorMedian = priorCols.length > 0
    ? (priorCols.length % 2 === 1
      ? priorCols[Math.floor(priorCols.length / 2)]
      : (priorCols[priorCols.length / 2 - 1] + priorCols[priorCols.length / 2]) / 2)
    : 0
  console.log(`Prior 7d (May 29 - Jun 4) median coll: ${fmtUsd(priorMedian)}`)
  const spikeMultiple = june5Row && priorMedian > 0 ? Number(june5Row.col ?? 0) / priorMedian : null
  console.log(`June 5 vs prior median: ${spikeMultiple != null ? spikeMultiple.toFixed(2) + "x" : "n/a"}`)
  console.log("")

  console.log("June 5 per-protocol breakdown:")
  for (const p of june5PerProto) {
    console.log(`  ${p.protocol.padEnd(14)} events=${String(p.n).padStart(5)}  coll=${fmtUsd(Number(p.col ?? 0)).padStart(9)}  debt=${fmtUsd(Number(p.debt ?? 0)).padStart(9)}`)
  }
  console.log("")

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
    june_5_analysis: {
      collateral_seized_usd: june5Row ? Number(june5Row.col ?? 0) : 0,
      events: june5Row ? Number(june5Row.n ?? 0) : 0,
      rank_of_days_in_month: rank5 || null,
      prior_7d_median_collateral_usd: priorMedian,
      spike_multiple_vs_prior_median: spikeMultiple,
      per_protocol: june5PerProto.map((p) => ({
        protocol: p.protocol,
        events: Number(p.n ?? 0),
        collateral_seized_usd: Number(p.col ?? 0),
        debt_repaid_usd: Number(p.debt ?? 0),
      })),
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
