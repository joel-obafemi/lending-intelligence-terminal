/**
 * Capture FRED series the dashboard reads and write to
 * content/snapshots/fred-seed.json. The Rate Monitor and any other
 * page that overlays Fed Funds / T-bill uses this as a static fallback
 * when the upstream FRED CSV endpoint is too slow to fit in the page
 * budget.
 *
 *   npx tsx scripts/capture-fred-seed.ts
 *
 * Re-run weekly. FRED publishes daily but the dashboard's overlay
 * lines don't move enough day-to-day that staleness shows up — a
 * week-old snapshot still serves a credible Real Yield Spread chart.
 *
 * Why seed at all: fred.stlouisfed.org/graph/fredgraph.csv has no API
 * key but is rate-limited per IP. Vercel serverless IPs are shared
 * across customers and hit the limit consistently, hanging requests
 * to ~50s+ — long enough to blow past the page's render budget. The
 * seed gives loadRates an instant fallback so the page always renders.
 */
import { writeFileSync, mkdirSync, statSync } from "fs"
import { dirname, join } from "path"

interface FredPoint {
  timestamp: number
  rate: number
}

const SERIES = ["DFF", "TB4WK"] as const
const SINCE_DAYS = 600
const OUTPUT_PATH = "content/snapshots/fred-seed.json"

async function fetchSeries(seriesId: string): Promise<FredPoint[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`FRED ${res.status} for ${seriesId}`)
  const text = await res.text()
  const cutoff = Math.floor(Date.now() / 1000) - SINCE_DAYS * 86400
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
    if (ts < cutoff) continue
    points.push({ timestamp: ts, rate })
  }
  return points
}

async function main() {
  const t0 = Date.now()
  const result: Record<string, FredPoint[]> = {}
  for (const seriesId of SERIES) {
    console.log(`[fred-seed] fetching ${seriesId}…`)
    const points = await fetchSeries(seriesId)
    console.log(`[fred-seed]   ${seriesId}: ${points.length} points`)
    result[seriesId] = points
  }
  console.log(`[fred-seed] total fetch ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        since_days: SINCE_DAYS,
        series: result,
      },
      null,
      2,
    ),
  )
  const sizeKB = (statSync(outPath).size / 1024).toFixed(1)
  console.log(`[fred-seed] wrote ${OUTPUT_PATH} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error("[fred-seed] failed:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
