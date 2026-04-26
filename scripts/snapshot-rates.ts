/**
 * Daily rate snapshot cron — local runner.
 *
 *   npm run snapshot:rates
 *
 * Shares logic with the `/api/cron/snapshot-rates` route via
 * `lib/snapshot-rates.ts`. This script is the one you run manually to
 * backfill or verify.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { runRateSnapshot } from "../lib/snapshot-rates"
import { closePool } from "../lib/db"

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.")
    process.exit(1)
  }

  console.log("Fetching DefiLlama Yields…")
  const res = await runRateSnapshot()
  console.log(
    `Snapshotted ${res.upserted} (protocol, asset) pairs for ${res.today}. ` +
      `Total rows in rate_snapshots: ${res.totalRows}.`,
  )
  for (const [slug, n] of Object.entries(res.perProtocol)) {
    console.log(`  ${slug}: ${n}`)
  }
  await closePool()
}

main().catch(async (err) => {
  console.error(err)
  await closePool().catch(() => {})
  process.exit(1)
})
