/**
 * Shared types for the /reports section.
 *
 * Two concerns live here:
 *  - The MDX issue frontmatter shape (what every .mdx file declares at top).
 *  - The chart registry contract that the <Chart> component reads against.
 *
 * The chart registry itself is populated in commits 3-4 (one entry per
 * `source` ID the MDX references). This file just nails down the loader
 * shape so each entry harmonizes against a single signature.
 */
import type { ComponentType } from "react"

// ─────────────────────────────────────────────────────────────────────────
// MDX frontmatter
// ─────────────────────────────────────────────────────────────────────────

export interface IssueFrontmatter {
  title: string
  issue_number: number
  issue_label: string
  /** End-of-period snapshot date (YYYY-MM-DD). */
  date: string
  /** Public release date (YYYY-MM-DD). */
  publication_date: string
  theme: string
  tagline: string
  reading_time_min: number
  cover_image: string
  social_image: string
  protocols: string[]
  /** ISO 8601 — used by <Chart> as the default upper bound on time series. */
  freeze_date: string
  status: "published" | "draft" | "archived"
}

export interface IssueRecord {
  slug: string
  frontmatter: IssueFrontmatter
  /** Raw MDX body (post-frontmatter). The route compiles it via MDXRemote. */
  body: string
  /** UTC seconds — file mtime, used for archive sort fallback when
   *  publication_date is missing. */
  fileMtime: number
}

// ─────────────────────────────────────────────────────────────────────────
// Chart registry contract
//
// Every <Chart source="..."> in MDX resolves to a registry entry below. The
// entry pairs a typed loader (which translates the harmonized params into
// a call against the existing `loadXxx` data layer) with a typed renderer
// component. The freeze-date toggle flips a single param on the loader
// call — no per-chart toggle code required.
// ─────────────────────────────────────────────────────────────────────────

export interface ChartRegistryParams {
  /** Issue's freeze_date (ISO 8601). When set, the loader should clamp
   *  any time-series query upper bound to this timestamp. When null /
   *  undefined the chart renders fully live. */
  freezeDate: string | null
  /** Range token from the MDX prop, e.g. "30d", "90d", "12m", "18m",
   *  "24m", "all". Each registry entry decides how to interpret. */
  range?: string
  /** Asset symbol when the chart is asset-scoped (e.g. "USDC", "wstETH"). */
  asset?: string
  /** Protocol slug when the chart is protocol-scoped (e.g. "aave-v3"). */
  protocol?: string
  /** Optional inline annotations passed from the MDX (overlay markers). */
  annotations?: Array<{ date: string; label: string; color?: string }>
  /** Optional view selector for charts that have a sub-mode (e.g. the
   *  composition donuts have "collateral" / "borrow" / both). */
  view?: string
  /** Optional metric selector (e.g. market-share by "borrows" vs "supply"). */
  metric?: string
}

/**
 * Registry entry. The renderer component receives the loader's resolved
 * data plus the original params (for caption / scope display). Generic
 * over the data shape so each entry types its own contract end-to-end.
 */
export interface ChartRegistryEntry<TData = unknown> {
  /** Translates harmonized params into the underlying `loadXxx` call. */
  loader: (params: ChartRegistryParams) => Promise<TData>
  /** Renders the chart from the loader's resolved data. */
  Component: ComponentType<{ data: TData; params: ChartRegistryParams }>
  /** Default params merged into incoming params before the loader runs.
   *  Lets a registry entry declare a sensible default range without
   *  forcing every MDX call site to repeat it. */
  defaultParams?: Partial<ChartRegistryParams>
}

export type ChartRegistry = Record<string, ChartRegistryEntry<any>>
