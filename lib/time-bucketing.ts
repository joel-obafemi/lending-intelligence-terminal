/**
 * Shared time-bucketing utility for chart W/M/Q toggles.
 *
 * The semantics: when the user selects "M", they want to see one data point
 * per month with the X-axis labelled "Apr 2026"/"Mar 2026"/etc. — NOT
 * 30 daily points labelled "Apr 21"/"Apr 22". This file collapses a daily
 * series into the right buckets and provides matching tick labels.
 *
 * Aggregation mode per metric type:
 *  - "last" — snapshot data (TVL, utilization, market share). Take the last
 *    daily observation in the bucket.
 *  - "sum"  — flow data (revenue, fees, net deposits, liquidation volume,
 *    bad debt). Add up daily values in the bucket.
 *  - "avg"  — rate data (supply/borrow APY, real-yield spread). Mean of the
 *    daily values in the bucket.
 */

export type BucketType = "week" | "month" | "quarter" | "day"
export type BucketMode = "last" | "sum" | "avg"

/** Numeric ↔ bucket mapping for the existing TimeToggle (W=7, M=30, Q=90, All=0). */
export function rangeToBucket(days: number): BucketType {
  if (days === 7) return "week"
  if (days === 30) return "month"
  if (days === 90) return "quarter"
  return "day" // 0/All keeps daily granularity
}

/** How many buckets to display by default for each toggle. */
export const BUCKET_DEFAULT_LIMIT: Record<BucketType, number> = {
  week: 12,      // ~3 months of weekly resolution
  month: 24,     // 2 years of monthly resolution
  quarter: 8,    // 2 years of quarterly resolution
  day: 0,        // 0 = "show everything" for the All toggle
}

/** UTC-second timestamp of the start of the bucket containing `ts`. */
export function bucketStart(ts: number, bucket: BucketType): number {
  const d = new Date(ts * 1000)
  if (bucket === "day") {
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
  }
  if (bucket === "week") {
    // ISO weeks start on Monday.
    const dow = (d.getUTCDay() + 6) % 7
    const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
    return Math.floor(monday / 1000)
  }
  if (bucket === "month") {
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)
  }
  // quarter
  const quarterStartMonth = Math.floor(d.getUTCMonth() / 3) * 3
  return Math.floor(Date.UTC(d.getUTCFullYear(), quarterStartMonth, 1) / 1000)
}

/** Render a bucket-start timestamp as the X-axis tick label. */
export function formatBucketLabel(ts: number, bucket: BucketType): string {
  const d = new Date(ts * 1000)
  if (bucket === "day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  }
  if (bucket === "week") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
  }
  if (bucket === "month") {
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
  }
  // quarter
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `Q${q} ${d.getUTCFullYear()}`
}

/** Tooltip-style label for a bucket (more verbose than the X-axis tick). */
export function formatBucketTooltipLabel(ts: number, bucket: BucketType): string {
  const d = new Date(ts * 1000)
  if (bucket === "day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  }
  if (bucket === "week") {
    return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
  }
  if (bucket === "month") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  }
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `Q${q} ${d.getUTCFullYear()}`
}

/**
 * Bucket a daily series of `{ timestamp, ...numericKeys }` records.
 *
 * Each output point's `timestamp` is the bucket-start UTC second.
 * `numericKeys` lists the fields to aggregate (the rest are dropped).
 */
export function bucketSeries<T extends { timestamp: number; [k: string]: any }>(
  series: T[],
  bucket: BucketType,
  mode: BucketMode,
  numericKeys: string[],
  limit: number = BUCKET_DEFAULT_LIMIT[bucket],
): T[] {
  if (series.length === 0 || bucket === "day") {
    if (limit > 0 && series.length > limit) return series.slice(-limit) as T[]
    return series
  }
  const grouped = new Map<number, T[]>()
  for (const pt of series) {
    const start = bucketStart(pt.timestamp, bucket)
    const arr = grouped.get(start) ?? []
    arr.push(pt)
    grouped.set(start, arr)
  }
  const sorted = [...grouped.entries()].sort(([a], [b]) => a - b)
  const out: T[] = []
  for (const [bucketTs, points] of sorted) {
    const aggregated: any = { timestamp: bucketTs }
    for (const key of numericKeys) {
      if (mode === "last") {
        // The last data point in the bucket is the most-recent observation.
        aggregated[key] = (points[points.length - 1] as any)[key] ?? 0
      } else if (mode === "sum") {
        let s = 0
        for (const p of points) {
          const v = (p as any)[key]
          if (Number.isFinite(v)) s += v
        }
        aggregated[key] = s
      } else {
        // avg
        let s = 0
        let n = 0
        for (const p of points) {
          const v = (p as any)[key]
          if (Number.isFinite(v)) {
            s += v
            n++
          }
        }
        aggregated[key] = n > 0 ? s / n : 0
      }
    }
    out.push(aggregated as T)
  }
  if (limit > 0 && out.length > limit) return out.slice(-limit)
  return out
}
