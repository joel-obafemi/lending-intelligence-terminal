/**
 * FRED (Federal Reserve Economic Data) fetcher — public CSV endpoint, no
 * API key required. Used to overlay the Fed Funds Rate against DeFi borrow
 * rates on the Rate Monitor and as the risk-free leg of Real Yield Spread.
 *
 * DFF   = Daily Federal Funds Effective Rate.
 * TB4WK = 4-Week Treasury Bill (monthly series; despite the name).
 * Endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=<series>
 *
 * Resilience: fred.stlouisfed.org's CSV endpoint has no API key but is
 * rate-limited per IP. Vercel serverless IPs are shared across customers
 * and hit the limit consistently — requests hang for 50s+ rather than
 * erroring, which keeps a plain .catch() from firing. To survive that:
 *   1. SWR in-memory cache keyed by series id.
 *   2. Static seed file at content/snapshots/fred-seed.json (refreshed
 *      weekly by scripts/capture-fred-seed.ts).
 *   3. Cold-start path returns seed instantly and refreshes upstream
 *      in the background — same pattern as fetchAllYieldPools.
 */
// Static JSON import — webpack bundles this into the function output at
// build time. Using fs.readFileSync(process.cwd() + path) instead would
// leave the file out of the Vercel build trace and the read would 404
// at runtime.
import fredSeedRaw from "../content/snapshots/fred-seed.json"

export interface FredPoint {
  /** Unix seconds (UTC midnight on the observation date) */
  timestamp: number
  /** Rate as a percentage, e.g. 3.64 */
  rate: number
}

// In-memory SWR cache, keyed by series id. Reset on each cold start —
// Vercel rotates instances aggressively, so this is per-instance.
type CacheEntry = { points: FredPoint[]; fetchedAt: number }
const fredCache = new Map<string, CacheEntry>()
const refreshInFlight = new Map<string, Promise<FredPoint[]>>()

const FRED_CACHE_TTL_MS = 60 * 60 * 1000   // 1h fresh — FRED updates daily
const FRED_STALE_MAX_MS = 6 * 60 * 60 * 1000 // 6h stale-but-acceptable
const FRED_UPSTREAM_TIMEOUT_MS = 6 * 1000  // bail to seed if upstream slower

interface SeedFile {
  captured_at: string
  since_days: number
  series: Record<string, FredPoint[]>
}

const fredSeed = fredSeedRaw as unknown as SeedFile

function getSeedSeries(seriesId: string, sinceDays: number): FredPoint[] {
  const points = fredSeed?.series?.[seriesId]
  if (!Array.isArray(points)) return []
  const cutoff = sinceDays > 0 ? Math.floor(Date.now() / 1000) - sinceDays * 86400 : 0
  return points.filter((p) => p.timestamp >= cutoff)
}

async function fetchSeriesFromUpstream(seriesId: string): Promise<FredPoint[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`FRED ${res.status} for ${seriesId}`)
  const text = await res.text()
  const points: FredPoint[] = []
  const lines = text.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const [dateStr, rateStr] = line.split(",")
    if (!dateStr || !rateStr || rateStr === "." || rateStr === "NA") continue
    const rate = Number(rateStr)
    if (!Number.isFinite(rate)) continue
    const ts = Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000)
    points.push({ timestamp: ts, rate })
  }
  return points
}

async function fetchUpstreamWithTimeout(
  seriesId: string,
  timeoutMs: number,
): Promise<FredPoint[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetchSeriesFromUpstream(seriesId).catch((err) => {
        console.error(`[fred] ${seriesId} upstream failed:`, err?.message ?? err)
        return null
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[fred] ${seriesId} upstream timed out after ${timeoutMs}ms`)
          resolve(null)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function trimToWindow(points: FredPoint[], sinceDays: number): FredPoint[] {
  if (sinceDays <= 0) return points
  const cutoff = Math.floor(Date.now() / 1000) - sinceDays * 86400
  return points.filter((p) => p.timestamp >= cutoff)
}

/**
 * Fetch a FRED series as `[ { timestamp, rate } ]`. Resilient to upstream
 * stalls: cold start returns seed instantly + refreshes in background;
 * warm cache served directly; stale-but-acceptable triggers background
 * refresh and returns cached.
 */
export async function fetchFredSeries(
  seriesId: string,
  sinceDays = 3650,
): Promise<FredPoint[]> {
  const now = Date.now()
  const cached = fredCache.get(seriesId)

  if (cached && now - cached.fetchedAt < FRED_CACHE_TTL_MS) {
    return trimToWindow(cached.points, sinceDays)
  }

  // Background-refresh helper, idempotent across concurrent calls.
  const kickRefresh = () => {
    if (refreshInFlight.has(seriesId)) return
    const job = fetchUpstreamWithTimeout(seriesId, FRED_UPSTREAM_TIMEOUT_MS)
      .then((p) => {
        if (p && p.length > 0) {
          fredCache.set(seriesId, { points: p, fetchedAt: Date.now() })
          return p
        }
        return cached?.points ?? getSeedSeries(seriesId, 99999)
      })
      .catch((err) => {
        console.error(`[fred] ${seriesId} background refresh failed:`, err?.message ?? err)
        return cached?.points ?? getSeedSeries(seriesId, 99999)
      })
      .finally(() => {
        refreshInFlight.delete(seriesId)
      })
    refreshInFlight.set(seriesId, job)
  }

  if (cached && now - cached.fetchedAt < FRED_STALE_MAX_MS) {
    kickRefresh()
    return trimToWindow(cached.points, sinceDays)
  }

  // Cold start. Serve seed instantly, refresh upstream in background.
  const seed = getSeedSeries(seriesId, 99999)
  if (seed.length > 0) {
    kickRefresh()
    return trimToWindow(seed, sinceDays)
  }

  // No seed available (local dev pre-capture). Synchronous wait.
  if (!refreshInFlight.has(seriesId)) {
    const job = fetchUpstreamWithTimeout(seriesId, FRED_UPSTREAM_TIMEOUT_MS)
      .then((p) => {
        if (p && p.length > 0) {
          fredCache.set(seriesId, { points: p, fetchedAt: Date.now() })
          return p
        }
        return [] as FredPoint[]
      })
      .catch(() => [] as FredPoint[])
      .finally(() => {
        refreshInFlight.delete(seriesId)
      })
    refreshInFlight.set(seriesId, job)
  }
  const result = (await refreshInFlight.get(seriesId)!) ?? []
  return trimToWindow(result, sinceDays)
}

/** Convenience wrapper for the Daily Federal Funds Effective Rate. */
export async function fetchFedFundsRate(sinceDays = 3650): Promise<FredPoint[]> {
  return fetchFredSeries("DFF", sinceDays)
}
