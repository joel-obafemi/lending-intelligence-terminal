/**
 * Hand-authored editorial copy for the discovery hooks (banner, callouts).
 *
 * Split out from featuredIssue.ts so client components can import
 * `getEditorialFor` without pulling in the fs-backed getAllIssues
 * loader. featuredIssue.ts re-exports from here.
 *
 * To publish a new issue: append an IssueEditorial entry alongside
 * dropping the .mdx file in /content/reports/. Slugs must match the
 * .mdx filename. Section anchors must match what the SectionHeading
 * component generates (slugify of the heading text).
 */

export interface IssueHookCopy {
  /** Italic-serif headline for the inline callout. */
  headline: string
  /** Slug of the SectionHeading inside the issue MDX. Used to build
   *  the deep link /reports/<slug>#<sectionAnchor>. */
  sectionAnchor: string
}

export interface IssueEditorial {
  slug: string
  /** Sector Overview banner copy. Trimmed for the 80-100px treatment. */
  banner: {
    eyebrow: string
    title: string
    tagline: string
    cta: string
  }
  /** Per-protocol inline callout. Keyed by canonical protocol slug
   *  ("aave-v3" / "spark" / "morpho-blue" / "fluid"). */
  protocolHooks: Partial<Record<string, IssueHookCopy>>
  /** Theme-essay deep link surfaced on the Risk page. */
  themeHook: IssueHookCopy
}

const ISSUE_001_EDITORIAL: IssueEditorial = {
  slug: "2026-04-april",
  banner: {
    eyebrow: "ISSUE №001 · APRIL 2026",
    title: "The rsETH Reckoning",
    tagline:
      "How a single bridge exploit cascaded through DeFi lending in 96 hours.",
    cta: "Read full issue →",
  },
  protocolHooks: {
    "aave-v3": {
      headline:
        "How Aave V3 became the stress center of April's deleveraging.",
      sectionAnchor: "protocol-deep-dive-aave-v3",
    },
    spark: {
      headline:
        "Why Spark captured the wstETH migration that left Aave V3.",
      sectionAnchor: "protocol-deep-dive-sparklend",
    },
    "morpho-blue": {
      headline:
        "Morpho's curator concentration crossed antitrust thresholds in April.",
      sectionAnchor: "protocol-deep-dive-morpho",
    },
    fluid: {
      headline:
        "Fluid's identity is its liquidation engine: 10% of TVL liquidated, 1.92% penalty.",
      sectionAnchor: "protocol-deep-dive-fluid",
    },
  },
  themeHook: {
    headline:
      "The rsETH Reckoning: how a single bridge exploit cascaded through DeFi lending.",
    sectionAnchor: "theme-the-rseth-reckoning",
  },
}

const EDITORIAL: IssueEditorial[] = [ISSUE_001_EDITORIAL]
const EDITORIAL_BY_SLUG = new Map(EDITORIAL.map((e) => [e.slug, e]))

/** Hand-written editorial copy for an issue. Returns null when no
 *  entry has been authored yet — discovery components should render
 *  nothing rather than fall back to auto-generated text. */
export function getEditorialFor(
  slug: string | undefined | null,
): IssueEditorial | null {
  if (!slug) return null
  return EDITORIAL_BY_SLUG.get(slug) ?? null
}
