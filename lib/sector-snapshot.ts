/**
 * Sector daily snapshot persistence.
 *
 * The Sector page used to call `loadOverview()` on every request. That hits
 * DefiLlama for 4 protocol histories + cross-protocol markets + real-yield
 * + liquidations and easily takes 30-90s on a Vercel cold start, with
 * intermittent timeouts in production.
 *
 * Strategy: a Cloudflare Worker triggers `/api/cron/sector-snapshot` once
 * per day at 01:00 UTC. That endpoint runs `loadOverview()` once and
 * persists the entire payload to a `sector_snapshots` row keyed by UTC
 * date. The page then reads from that row (a single Neon SELECT, ~1-5ms).
 *
 * Falls back to live `loadOverview()` if the latest snapshot is missing or
 * older than `MAX_AGE_HOURS` — so a cold start with no DB row works, and
 * a stale row doesn't lock the page on yesterday's numbers.
 */
import { sql } from "./db"
import { loadOverview, type OverviewResponse } from "./overview"
import { loadTopMarketsAcrossProtocols, type CrossProtocolMarket } from "./cross-protocol-markets"
import { loadRealYieldSpread, type RealYieldResponse } from "./real-yield"

/** How stale a snapshot can get before we override with a live load. */
const MAX_AGE_HOURS = 30

/** Snapshot row shape returned by Neon. */
interface SnapshotRow {
  day: string  // 'YYYY-MM-DD'
  payload: OverviewResponse
  fetched_at: Date
}

/** Today's UTC date in 'YYYY-MM-DD' form. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Run the live sector pipeline and UPSERT it into Neon. Idempotent across
 *  same-day re-runs (re-runs replace the row). Returns metadata callers can
 *  log (used by the cron route response). */
export async function persistSectorSnapshot(): Promise<{
  day: string
  bytes: number
  ms: number
}> {
  const t0 = Date.now()
  // Enrich the snapshot with the two loaders the Overview page used to call
  // live (top markets + real-yield). Folding them in here — the once-daily
  // cron path — means the Overview page render reads them from Neon and has
  // ZERO no-store fetches, so it can be statically cached + ISR'd. These
  // are deliberately NOT in loadOverview() itself, which other heavy pages
  // call during their own renders.
  const [payload, topMarketsCrossProtocol, realYieldSpread] = await Promise.all([
    loadOverview(),
    loadTopMarketsAcrossProtocols(50).catch((err) => {
      console.error("[sector-snapshot] top markets failed:", err?.message ?? err)
      return [] as CrossProtocolMarket[]
    }),
    loadRealYieldSpread().catch((err) => {
      console.error("[sector-snapshot] real yield spread failed:", err?.message ?? err)
      return null as RealYieldResponse | null
    }),
  ])
  payload.topMarketsCrossProtocol = topMarketsCrossProtocol
  payload.realYieldSpread = realYieldSpread
  const day = todayUtc()
  const json = JSON.stringify(payload)
  await sql`
    INSERT INTO sector_snapshots (day, payload, fetched_at)
    VALUES (${day}, ${json}::jsonb, NOW())
    ON CONFLICT (day) DO UPDATE SET
      payload = EXCLUDED.payload,
      fetched_at = NOW()
  `
  return { day, bytes: json.length, ms: Date.now() - t0 }
}

/** Read the most recent snapshot row. Returns null when:
 *   - DATABASE_URL is unset (dev / preview)
 *   - The query fails (Neon down, table missing, etc.)
 *   - No rows exist yet (first deploy before the cron has run)
 *  Callers should fall back to a live `loadOverview()` in those cases. */
export async function getLatestSectorSnapshot(): Promise<SnapshotRow | null> {
  if (!process.env.DATABASE_URL) return null
  try {
    const rows = await sql<SnapshotRow>`
      SELECT day::text AS day, payload, fetched_at
      FROM sector_snapshots
      ORDER BY fetched_at DESC
      LIMIT 1
    `
    return rows[0] ?? null
  } catch (err: any) {
    console.error("[sector-snapshot] read failed:", err?.message ?? err)
    return null
  }
}

/** True when the snapshot is fresh enough to serve directly. */
export function isSnapshotFresh(row: SnapshotRow | null): row is SnapshotRow {
  if (!row) return false
  const ageMs = Date.now() - new Date(row.fetched_at).getTime()
  return ageMs < MAX_AGE_HOURS * 3600 * 1000
}

/** The page-level entry point. Returns a sector overview payload by:
 *   1. Reading the latest snapshot from Neon if fresh.
 *   2. Falling back to a live `loadOverview()` if missing/stale/error.
 *
 *  Pages should always call this instead of `loadOverview()` directly so
 *  they get the fast path when it's available + a transparent fallback. */
export async function loadSectorOverview(): Promise<{
  payload: OverviewResponse
  source: "snapshot" | "live"
  fetchedAt: number
}> {
  const row = await getLatestSectorSnapshot()
  if (isSnapshotFresh(row)) {
    return {
      payload: row.payload,
      source: "snapshot",
      fetchedAt: Math.floor(new Date(row.fetched_at).getTime() / 1000),
    }
  }
  const payload = await loadOverview()
  return {
    payload,
    source: "live",
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}
