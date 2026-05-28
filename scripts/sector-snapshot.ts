/**
 * Sector daily snapshot — local runner.
 *
 *   npm run snapshot:sector
 *
 * Shares logic with the `/api/cron/sector-snapshot` route via
 * `lib/sector-snapshot.ts` (persistSectorSnapshot). Run this manually to
 * backfill or to force a refresh after a deploy that changes the snapshot
 * shape — e.g. when new fields (top markets, real-yield) are folded in and
 * you don't want to wait for the 01:00 UTC Cloudflare cron.
 *
 * Idempotent: upserts the row keyed by today's UTC date.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { persistSectorSnapshot } from "../lib/sector-snapshot"
import { closePool } from "../lib/db"

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.")
    process.exit(1)
  }
  console.log("Running sector snapshot (loadOverview + top markets + real-yield)…")
  const res = await persistSectorSnapshot()
  console.log(
    `Snapshot written for ${res.day}: ${(res.bytes / 1024).toFixed(1)} KB in ${res.ms}ms.`,
  )
  await closePool()
}

main().catch(async (err) => {
  console.error(err)
  await closePool().catch(() => {})
  process.exit(1)
})
