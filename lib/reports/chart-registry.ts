/**
 * Chart registry for /reports.
 *
 * Each MDX file embeds charts via `<Chart source="…">`. The registry maps
 * those string IDs to a (loader, Component, defaultParams) triple.
 *
 * Naming convention for source IDs: `<page>.<chart-name>`, hyphenated.
 * This mirrors how the dashboard surfaces them on the corresponding
 * page so a reader can grep across files.
 *
 * Registry entries are populated incrementally:
 *   - Commit 3 (this file's first version): rates.real-yield-spread only.
 *   - Commit 4: every other source ID the Issue #001 MDX references.
 */
import { cache } from "react"
import { loadRates } from "@/lib/rates"
import { RealYieldSpreadChart } from "@/components/report/charts/RealYieldSpreadChart"
import type {
  ChartRegistry,
  ChartRegistryEntry,
  ChartRegistryParams,
} from "./types"

// ─────────────────────────────────────────────────────────────────────────
// Cached upstream loaders
//
// Multiple registry entries may share an upstream `loadXxx`. Wrapping in
// React's `cache()` deduplicates the call within a single render — the
// expensive `loadRates()` (~20-60s, hits DefiLlama Yields charts × N
// pools) only runs once per page render even if both
// `rates.real-yield-spread` and `rates.cross-protocol-dispersion` are
// present in the same issue.
// ─────────────────────────────────────────────────────────────────────────

const cachedRates = cache(async () => {
  return loadRates()
})

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Convert a range token from MDX to a window-in-days. Each chart entry
 *  decides whether to honor it; this is just the canonical translation. */
export function rangeToDays(range: string | undefined): number | null {
  if (!range) return null
  if (range === "all") return null
  const m = range.match(/^(\d+)\s*(d|m|y)$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  const unit = m[2].toLowerCase()
  if (unit === "d") return n
  if (unit === "m") return n * 30
  return n * 365
}

/** Clamp a daily series to freeze date + range window. */
export function clampSeriesToWindow<T extends { timestamp: number }>(
  series: T[],
  params: ChartRegistryParams,
): T[] {
  const freezeMs = params.freezeDate ? Date.parse(params.freezeDate) : null
  const upperTs = freezeMs != null ? Math.floor(freezeMs / 1000) : Infinity
  const days = rangeToDays(params.range) ?? null
  const lowerTs =
    days != null
      ? (Number.isFinite(upperTs) ? upperTs : Math.floor(Date.now() / 1000)) -
        days * 86400
      : -Infinity
  return series.filter((p) => p.timestamp >= lowerTs && p.timestamp <= upperTs)
}

// ─────────────────────────────────────────────────────────────────────────
// Registry entries
// ─────────────────────────────────────────────────────────────────────────

const realYieldSpreadEntry: ChartRegistryEntry<{
  history: Array<{
    timestamp: number
    stableApyPct: number | null
    tBillPct: number | null
    spreadPct: number | null
  }>
  freezeMarker: number | null
}> = {
  defaultParams: { range: "18m" },
  loader: async (params) => {
    const rates = await cachedRates()
    const clamped = clampSeriesToWindow(rates.realYieldSpreadHistory ?? [], params)
    const freezeMarker = params.freezeDate
      ? Math.floor(Date.parse(params.freezeDate) / 1000)
      : null
    return { history: clamped, freezeMarker }
  },
  Component: RealYieldSpreadChart,
}

export const chartRegistry: ChartRegistry = {
  "rates.real-yield-spread": realYieldSpreadEntry,
}

/** True when the registry knows how to render a given source. The Chart
 *  server component falls back to a placeholder when this is false (so
 *  the page keeps rendering during commit 3 while commit 4 fills in
 *  the other entries). */
export function hasRegistryEntry(source: string): boolean {
  return source in chartRegistry
}
