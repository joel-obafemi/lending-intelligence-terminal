/**
 * Neon table coverage check for the monthly report capture cycle. Replaces
 * the previously-missing `npm run scan` target referenced by the pre-capture
 * audit (content/snapshots/2026-07-precapture-audit.md §2).
 *
 *   npm run scan -- --cutoff 2026-07-31
 *
 * Prints one row per core table (table_name, last_date, rows in the 7-day
 * window ending at the cutoff, status) and exits 1 if any CRITICAL table's
 * last_date is older than the cutoff (or is unreachable).
 *
 * Schema note (verified against the live databases 2026-08-01, not the audit
 * doc's original guesses):
 *   - Date columns are `day` / `day` / `date`, NOT `snapshot_date`.
 *   - `liquidation_events` lives in the SEPARATE liquidator database
 *     (LIQUIDATOR_DATABASE_URL), read via lib/liquidator-db, with a unix
 *     `block_timestamp` (bigint). The other three critical tables are in
 *     DATABASE_URL.
 *   - `token_metadata` does not exist in either database; it is checked as a
 *     warn-only reference and reports "not present" rather than failing.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { neon } from "@neondatabase/serverless"
import { liquidatorSql, hasLiquidatorDb } from "../lib/liquidator-db"

type Status = "PASS" | "FAIL" | "REF" | "WARN"

interface Row {
  table: string
  last_date: string | null
  rows7: number | null
  status: Status
  note?: string
}

function utcTodayMinus1(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function parseCutoff(): string {
  const argv = process.argv.slice(2)
  const idx = argv.indexOf("--cutoff")
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1]
  const eq = argv.find((a) => a.startsWith("--cutoff="))
  if (eq) return eq.slice("--cutoff=".length)
  return utcTodayMinus1()
}

async function main(): Promise<void> {
  const cutoff = parseCutoff()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    console.error(`Invalid --cutoff (expected YYYY-MM-DD): ${cutoff}`)
    process.exit(2)
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set in .env")
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)

  console.log(`Neon table coverage — cutoff ${cutoff}`)
  console.log(`  (rows(7d) = rows dated within [${cutoff} minus 6 days, ${cutoff}])`)
  console.log("")

  const rows: Row[] = []
  let criticalFail = false

  const evalCritical = (table: string, last: string | null, rows7: number | null, note?: string) => {
    let status: Status
    if (last == null) {
      status = "FAIL"
      criticalFail = true
    } else if (last >= cutoff) {
      status = "PASS"
    } else {
      status = "FAIL"
      criticalFail = true
    }
    rows.push({ table, last_date: last, rows7, status, note })
  }

  // ── Critical tables in DATABASE_URL (date columns verified: day/day/date) ──
  try {
    const r = (await sql`
      SELECT MAX(day)::text AS last_date,
             COUNT(*) FILTER (WHERE day >= (${cutoff}::date - 6) AND day <= ${cutoff}::date) AS rows7
      FROM sector_snapshots`)[0] as { last_date: string | null; rows7: string | number }
    evalCritical("sector_snapshots", r.last_date, Number(r.rows7))
  } catch (e: any) {
    evalCritical("sector_snapshots", null, null, e?.message ?? String(e))
  }

  try {
    const r = (await sql`
      SELECT MAX(day)::text AS last_date,
             COUNT(*) FILTER (WHERE day >= (${cutoff}::date - 6) AND day <= ${cutoff}::date) AS rows7
      FROM rate_snapshots`)[0] as { last_date: string | null; rows7: string | number }
    evalCritical("rate_snapshots", r.last_date, Number(r.rows7))
  } catch (e: any) {
    evalCritical("rate_snapshots", null, null, e?.message ?? String(e))
  }

  try {
    const r = (await sql`
      SELECT MAX(date)::text AS last_date,
             COUNT(*) FILTER (WHERE date >= (${cutoff}::date - 6) AND date <= ${cutoff}::date) AS rows7
      FROM morpho_curator_hhi_history`)[0] as { last_date: string | null; rows7: string | number }
    evalCritical("morpho_curator_hhi_history", r.last_date, Number(r.rows7))
  } catch (e: any) {
    evalCritical("morpho_curator_hhi_history", null, null, e?.message ?? String(e))
  }

  // ── Critical table in the liquidator DB (unix block_timestamp) ──
  if (!hasLiquidatorDb()) {
    evalCritical("liquidation_events [liq db]", null, null, "LIQUIDATOR_DATABASE_URL not set")
  } else {
    try {
      const r = (await liquidatorSql<{ last_date: string | null; rows7: string | number }>`
        SELECT MAX(to_timestamp(block_timestamp)::date)::text AS last_date,
               COUNT(*) FILTER (
                 WHERE to_timestamp(block_timestamp)::date >= (${cutoff}::date - 6)
                   AND to_timestamp(block_timestamp)::date <= ${cutoff}::date
               ) AS rows7
        FROM liquidation_events`)[0]
      evalCritical("liquidation_events [liq db]", r.last_date, Number(r.rows7))
    } catch (e: any) {
      evalCritical("liquidation_events [liq db]", null, null, e?.message ?? String(e))
    }
  }

  // ── Reference tables (warn only, never fail the run) ──
  try {
    const r = (await sql`SELECT COUNT(*)::int AS n FROM protocols`)[0] as { n: number }
    rows.push({ table: "protocols [ref]", last_date: null, rows7: r.n, status: "REF" })
  } catch (e: any) {
    rows.push({ table: "protocols [ref]", last_date: null, rows7: null, status: "WARN", note: e?.message ?? String(e) })
  }

  // token_metadata is not present in the live schema; report gracefully.
  try {
    const r = (await sql`SELECT COUNT(*)::int AS n FROM token_metadata`)[0] as { n: number }
    rows.push({ table: "token_metadata [ref]", last_date: null, rows7: r.n, status: "REF" })
  } catch {
    rows.push({ table: "token_metadata [ref]", last_date: "not present", rows7: null, status: "WARN", note: "table absent in DATABASE_URL" })
  }

  // ── Print ──
  const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length))
  console.log(`  ${pad("TABLE", 30)} ${pad("LAST DATE", 12)} ${pad("ROWS(7d)", 9)} STATUS`)
  for (const r of rows) {
    const last = r.last_date ?? "—"
    const r7 = r.rows7 == null ? "—" : String(r.rows7)
    const line = `  ${pad(r.table, 30)} ${pad(last, 12)} ${pad(r7, 9)} [${r.status}]`
    console.log(r.note ? `${line}  (${r.note})` : line)
  }
  console.log("")

  const critical = rows.filter((r) => r.status === "PASS" || r.status === "FAIL")
  const passed = critical.filter((r) => r.status === "PASS").length
  console.log("── Summary ──")
  console.log(`  ${passed}/${critical.length} critical tables covered through ${cutoff}`)
  if (criticalFail) {
    const gaps = critical.filter((r) => r.status === "FAIL")
    console.log("")
    console.log("✗ Coverage gap. Run the corresponding snapshot script(s) before capture:")
    for (const g of gaps) {
      console.log(`    ${g.table}: last_date ${g.last_date ?? "(unreadable)"}${g.note ? ` — ${g.note}` : ""}`)
    }
    process.exit(1)
  }
  console.log("")
  console.log(`✓ All critical tables covered through ${cutoff}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
