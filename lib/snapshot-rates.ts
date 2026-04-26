/**
 * Core rate-snapshot logic shared by:
 *   - `scripts/snapshot-rates.ts` (local CLI)
 *   - `app/api/cron/snapshot-rates/route.ts` (HTTP endpoint hit by Cloudflare Worker)
 *
 * Fetches current (supply, borrow) APY for each (protocol, major-asset) pair
 * from DefiLlama Yields and UPSERTs one row per day into `rate_snapshots`.
 * Idempotent — running multiple times within the same UTC day overwrites the
 * existing row rather than creating duplicates.
 *
 * ⚠️ STATUS: DEPRECATED — fully retired from the runtime.
 *
 * As of the derived-rates refactor:
 *   - `/rates` matrix sources live data from on-chain (`UiPoolDataProviderV3`).
 *   - Per-market detail pages now derive borrow APY history from supply APY
 *     × utilization × (1/(1−RF)) using DefiLlama Yields `/chart/{poolId}` +
 *     DefiLlama `/protocol/<slug>` chainTvls. See `lib/derived-rates.ts`.
 *
 * Nothing in `lib/market-detail.ts` or `lib/rates.ts` queries `rate_snapshots`
 * anymore. The Cloudflare Worker can be unscheduled (`wrangler triggers
 * delete <name>` or removing the `[triggers]` block in `wrangler.toml`),
 * and the table can be dropped at your convenience.
 *
 * This file + `scripts/snapshot-rates.ts` + `app/api/cron/snapshot-rates/`
 * are kept in the repo for reference — they're the one-page implementation
 * of "snapshot a rate API into a daily Postgres rollup", which is occasionally
 * useful for backfilling other metrics. They're not imported anywhere at
 * runtime.
 */
import { fetchAllYieldPools } from "./defillama"
import { MAJOR_ASSETS, YIELDS_PROJECT_BY_PROTOCOL } from "./rates"
import { sql, rawSql } from "./db"

export interface SnapshotResult {
  /** Number of rows upserted this run */
  upserted: number
  /** Total rows in `rate_snapshots` after the run */
  totalRows: number
  /** UTC date (YYYY-MM-DD) of this snapshot */
  today: string
  /** Per-protocol upsert counts (for the API response) */
  perProtocol: Record<string, number>
}

function protocolSlugFor(project: string): string | null {
  for (const [slug, projects] of Object.entries(YIELDS_PROJECT_BY_PROTOCOL)) {
    if (projects.includes(project)) return slug
  }
  return null
}

export async function runRateSnapshot(): Promise<SnapshotResult> {
  const pools = await fetchAllYieldPools()
  const ethereumPools = pools.filter((p) => p.chain === "Ethereum")

  // Keep the single largest pool per (protocol, symbol).
  const best = new Map<string, (typeof ethereumPools)[number]>()
  for (const p of ethereumPools) {
    const slug = protocolSlugFor(p.project)
    if (!slug) continue
    if (!(MAJOR_ASSETS as readonly string[]).includes(p.symbol)) continue
    const key = `${slug}:${p.symbol}`
    const existing = best.get(key)
    const rank = (q: typeof p) => q.totalSupplyUsd ?? q.tvlUsd ?? 0
    if (!existing || rank(p) > rank(existing)) best.set(key, p)
  }

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const perProtocol: Record<string, number> = {}

  let upserted = 0
  for (const [key, p] of best.entries()) {
    const [slug, symbol] = key.split(":")
    await sql`
      INSERT INTO rate_snapshots (
        protocol_slug, symbol, day, supply_apy, borrow_apy,
        utilization_pct, supply_usd, borrow_usd, pool_id
      ) VALUES (
        ${slug}, ${symbol}, ${today}, ${p.apyBase}, ${p.apyBaseBorrow},
        ${p.utilization}, ${p.totalSupplyUsd}, ${p.totalBorrowUsd}, ${p.pool}
      )
      ON CONFLICT (protocol_slug, symbol, day) DO UPDATE SET
        supply_apy = EXCLUDED.supply_apy,
        borrow_apy = EXCLUDED.borrow_apy,
        utilization_pct = EXCLUDED.utilization_pct,
        supply_usd = EXCLUDED.supply_usd,
        borrow_usd = EXCLUDED.borrow_usd,
        pool_id = EXCLUDED.pool_id,
        captured_at = NOW()
    `
    upserted++
    perProtocol[slug] = (perProtocol[slug] ?? 0) + 1
  }

  const totalRows = await rawSql<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM rate_snapshots",
  )
  return {
    upserted,
    totalRows: Number(totalRows[0].n),
    today,
    perProtocol,
  }
}
