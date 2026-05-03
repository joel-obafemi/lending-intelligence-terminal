/**
 * Bad-debt incident registry — single source of truth for the
 * "Days Since Last Bad Debt" counter on the Risk page.
 *
 * The four protocols we track (Aave V3, Spark, Morpho Blue, Fluid)
 * have remarkably low protocol-level bad debt at the sector aggregate.
 * Most realized losses sit inside curator-managed Morpho vaults, where
 * the curator chose to support a long-tail asset that later moved.
 *
 * This file reads `content/bad-debt-incidents.json` (curated by the
 * dashboard owner) and exposes a single `daysSinceLastBadDebt()`
 * derivation. The JSON is editable without redeploying — append a new
 * row when an incident occurs and the next page render picks it up.
 *
 * Schema:
 *   {
 *     date:       "YYYY-MM-DD"      // UTC date of the incident
 *     protocol:   <protocol slug>   // e.g. "morpho-blue"
 *     asset:      <symbol>          // collateral / debt asset
 *     amountUsd:  <number>          // realized bad-debt USD
 *     note:       <string>          // single-sentence context
 *   }
 *
 * Days since = floor((now - max(incident.date)) / 86400). Today's
 * incidents read 0. An empty JSON returns null — the page surfaces a
 * neutral "no recorded incident" caption rather than a misleading
 * tally.
 */

import fs from "node:fs/promises"
import path from "node:path"

export interface BadDebtIncident {
  date: string
  protocol: string
  asset: string
  amountUsd: number
  note: string
}

export interface BadDebtSummary {
  /** Days since the most-recent incident in the registry. Null when
   *  no incidents are recorded. */
  daysSince: number | null
  /** The most-recent incident itself, or null when registry is empty. */
  latest: BadDebtIncident | null
  /** Total realized bad debt USD across every recorded incident. */
  totalUsd: number
  /** Count of recorded incidents. */
  incidentCount: number
}

const REGISTRY_PATH = "content/bad-debt-incidents.json"

async function loadRegistry(): Promise<BadDebtIncident[]> {
  try {
    const file = await fs.readFile(
      path.join(process.cwd(), REGISTRY_PATH),
      "utf-8",
    )
    const raw = JSON.parse(file) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (r): r is BadDebtIncident =>
          !!r &&
          typeof r === "object" &&
          typeof (r as any).date === "string" &&
          typeof (r as any).protocol === "string" &&
          typeof (r as any).asset === "string" &&
          typeof (r as any).amountUsd === "number" &&
          typeof (r as any).note === "string",
      )
      .map((r) => ({ ...r }))
  } catch (err: any) {
    console.error("[bad-debt] registry load failed:", err?.message ?? err)
    return []
  }
}

/** UTC-date diff in whole days. */
function daysBetweenUtc(thenIso: string, now: Date): number {
  const then = new Date(`${thenIso}T00:00:00Z`)
  if (!Number.isFinite(then.getTime())) return Number.NaN
  const ms = now.getTime() - then.getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}

export async function loadBadDebtSummary(): Promise<BadDebtSummary> {
  const incidents = await loadRegistry()
  if (incidents.length === 0) {
    return { daysSince: null, latest: null, totalUsd: 0, incidentCount: 0 }
  }
  // Sort newest-first by date; ties broken by amount descending so a
  // tied date returns the larger event as "latest".
  const sorted = [...incidents].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.amountUsd - a.amountUsd
  })
  const latest = sorted[0]
  const now = new Date()
  const daysSince = daysBetweenUtc(latest.date, now)
  const totalUsd = incidents.reduce((s, r) => s + (r.amountUsd ?? 0), 0)
  return {
    daysSince: Number.isFinite(daysSince) ? daysSince : null,
    latest,
    totalUsd,
    incidentCount: incidents.length,
  }
}
