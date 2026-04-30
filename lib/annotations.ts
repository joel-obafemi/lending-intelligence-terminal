/**
 * Chart annotations — single source of truth for the dated events
 * (depegs, liquidation cascades, parameter changes) that the Sector Hero,
 * Risk Hero, and Revenue Cumulative charts call out.
 *
 * Authored in `content/annotations.json` as a flat list. Each event tags
 * which charts it belongs on via `chartKeys`; consumers filter by their
 * own key. Empty list ships with the dashboard — events go in as the
 * Lending Pulse drafts surface them.
 *
 * Usage (in a chart component):
 *
 *   import { useAnnotations } from "@/lib/annotations"
 *   import { ChartAnnotations } from "@/components/overview/chart-annotations"
 *   const events = useAnnotations("sector-borrows-share")
 *   ...
 *   <LineChart>
 *     ...
 *     <ChartAnnotations events={events} bucket={bucket} />
 *   </LineChart>
 */

import annotationsJson from "../content/annotations.json"

export interface ChartAnnotation {
  /** Stable id — used as React key + URL fragment for sharing. Lowercase
   *  kebab-case. */
  id: string
  /** Unix seconds. The chart finds the bucket containing this timestamp
   *  and draws a vertical reference line at that x position. */
  timestamp: number
  /** Short label rendered next to the line. ~3-5 words. */
  label: string
  /** Optional longer description shown in the tooltip on hover. */
  description?: string
  /** Which charts this event belongs on. Keep keys stable so events keep
   *  showing after chart refactors. Standard keys:
   *   - "sector-borrows-share"   (Sector Hero)
   *   - "risk-stablecoin-share"  (Risk Hero)
   *   - "revenue-cumulative"     (Revenue cumulative fees) */
  chartKeys: string[]
  /** Optional: protocol tag if the event is protocol-specific. Affects
   *  rendering color so the line matches the protocol palette. */
  protocolSlug?: string
}

interface AnnotationsFile {
  events: ChartAnnotation[]
}

const file = annotationsJson as unknown as AnnotationsFile

/** Pure helper — for SSR / non-React callers. */
export function getAnnotations(chartKey: string): ChartAnnotation[] {
  return file.events
    .filter((e) => e.chartKeys.includes(chartKey))
    .sort((a, b) => a.timestamp - b.timestamp)
}

/** Hook variant for client components. Stable identity is fine — the JSON
 *  is bundled at build time, no need to memoize. */
export function useAnnotations(chartKey: string): ChartAnnotation[] {
  return getAnnotations(chartKey)
}
