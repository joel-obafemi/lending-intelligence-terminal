/**
 * FRED (Federal Reserve Economic Data) fetcher — public CSV endpoint, no
 * API key required. Used to overlay the Fed Funds Rate against DeFi borrow
 * rates on the Rate Monitor.
 *
 * DFF = Daily Federal Funds Effective Rate.
 * Endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=<series>
 */

export interface FredPoint {
  /** Unix seconds (UTC midnight on the observation date) */
  timestamp: number
  /** Rate as a percentage, e.g. 3.64 */
  rate: number
}

/**
 * Fetch a FRED series as `[ { timestamp, rate } ]`. Null / "." values
 * (FRED's missing marker) are dropped. Use `sinceDays` to trim history.
 */
export async function fetchFredSeries(seriesId: string, sinceDays = 3650): Promise<FredPoint[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`FRED ${res.status} for ${seriesId}`)
  }
  const text = await res.text()
  const cutoff = sinceDays > 0 ? Math.floor(Date.now() / 1000) - sinceDays * 86400 : 0

  const points: FredPoint[] = []
  const lines = text.split(/\r?\n/)
  // Skip header (`observation_date,<SERIES>`).
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

/** Convenience wrapper for the Daily Federal Funds Effective Rate. */
export async function fetchFedFundsRate(sinceDays = 3650): Promise<FredPoint[]> {
  return fetchFredSeries("DFF", sinceDays)
}
