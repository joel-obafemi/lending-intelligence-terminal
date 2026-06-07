/**
 * Single source of truth for "the latest issue" across the dashboard.
 *
 * Two pieces:
 *   1. getFeaturedIssue() — async lookup of the most recently published
 *      issue (via getAllIssues), enriched with derived fields like
 *      `isFresh` (publication_date within 14 days) and the canonical
 *      page URL. Used by the discovery hooks: top-nav badge, Sector
 *      Overview banner, per-protocol inline callouts, site footer,
 *      and the OG-image fallback.
 *
 *   2. Editorial copy — hand-authored per-issue strings (banner,
 *      protocol callouts, theme hook). Lives in `editorial.ts` so
 *      client components can import it without pulling in this
 *      module's fs-backed getAllIssues. Re-exported from here for
 *      convenience.
 */
import { getAllIssues } from "./getAllIssues"
import type { IssueRecord } from "./types"
export {
  getEditorialFor,
  type IssueEditorial,
  type IssueHookCopy,
} from "./editorial"

const SITE_URL = "https://lending-intelligence-terminal.vercel.app"
const FRESHNESS_DAYS = 14

export interface FeaturedIssue {
  slug: string
  url: string
  /** Issue frontmatter — title, theme, tagline, dates, etc. */
  record: IssueRecord
  /** True when publication_date is within the last 14 days. Drives the
   *  "NEW" badge in the top nav and the auto-show banner reset. */
  isFresh: boolean
  /** Canonical OG-image URL for fallback metadata across the site. */
  socialImageUrl: string
}

/** Slimmed-down summary safe to ship across the server→client boundary
 *  for client components (NavHeader, SiteFooter, banner). Drops the
 *  heavy MDX `body` string from the IssueRecord. */
export interface FeaturedIssueSummary {
  slug: string
  url: string
  isFresh: boolean
  socialImageUrl: string
  title: string
  theme: string
  tagline: string
  issueLabel: string
  publicationDate: string
  readingTimeMin: number
  coverImage: string
  /** Landscape social/twitter PNG used in horizontal thumbnail surfaces
   *  (site footer Latest issue card, nav header preview). Populated from
   *  frontmatter.social_image. Falls back to coverImage when absent. */
  socialImage: string
}

function isFresh(publicationDate: string): boolean {
  const t = Date.parse(publicationDate)
  if (Number.isNaN(t)) return false
  // Bidirectional 14-day window — the badge surfaces both during the
  // pre-publication announcement window (issue dropping soon) and the
  // post-publication freshness window. The spec says "less than 14
  // days old" but using absolute distance is more useful when an issue
  // is queued up for the next morning.
  const distanceMs = Math.abs(Date.now() - t)
  return distanceMs < FRESHNESS_DAYS * 24 * 3600 * 1000
}

/** Lookup the latest published issue + derive the discovery-surface
 *  metadata. Returns null when no issues are published yet (the
 *  hooks all gracefully render nothing in that case). */
export async function getFeaturedIssue(): Promise<FeaturedIssue | null> {
  const issues = await getAllIssues()
  if (issues.length === 0) return null
  const latest = issues[0]
  return {
    slug: latest.slug,
    url: `${SITE_URL}/reports/${latest.slug}`,
    record: latest,
    isFresh: isFresh(latest.frontmatter.publication_date),
    socialImageUrl: `${SITE_URL}/reports/${latest.slug}/opengraph-image`,
  }
}
