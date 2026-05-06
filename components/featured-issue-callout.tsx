/**
 * Inline italic-serif callout that surfaces the latest issue's
 * coverage of a specific protocol or theme.
 *
 * Used in two placements:
 *   - Per-protocol page (/protocols?p=…) below the verdict strip.
 *     Pass `protocolSlug`; the component pulls the protocol-specific
 *     editorial hook from the issue editorial registry and links
 *     deep into the issue's protocol-deep-dive section.
 *   - Risk page (/risk) below the verdict strip. Pass `theme=true` and
 *     it surfaces the issue's theme-essay deep link instead.
 *
 * Renders nothing when no editorial hook is configured for the active
 * issue + slug, so a brand-new issue without callout copy doesn't
 * surface stale or generic strings.
 */
import Link from "next/link"
import { getFeaturedIssue, getEditorialFor } from "@/lib/reports/featuredIssue"

interface Props {
  /** Protocol slug ("aave-v3", "spark", "morpho-blue", "fluid"). When
   *  provided, surfaces the matching protocol hook from the editorial
   *  registry. */
  protocolSlug?: string
  /** When true, surfaces the issue's theme-essay deep link instead of
   *  a per-protocol hook. Used on the Risk page. */
  theme?: boolean
}

export async function FeaturedIssueCallout({ protocolSlug, theme }: Props) {
  const featured = await getFeaturedIssue()
  if (!featured) return null
  const editorial = getEditorialFor(featured.slug)
  if (!editorial) return null

  let hook
  if (theme) {
    hook = editorial.themeHook
  } else if (protocolSlug) {
    hook = editorial.protocolHooks[protocolSlug]
  }
  if (!hook) return null

  const fm = featured.record.frontmatter
  const url = `/reports/${featured.slug}#${hook.sectionAnchor}`

  return (
    <Link
      href={url}
      aria-label={`Featured in Issue ${fm.issue_label}: ${hook.headline}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <aside
        className="featured-issue-callout"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 16px",
          background: "rgba(255, 107, 53, 0.06)",
          border: "1px solid rgba(255, 107, 53, 0.18)",
          borderLeft: "3px solid var(--accent-orange)",
          borderRadius: 4,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--accent-orange)",
              fontWeight: 600,
            }}
          >
            Featured in Issue {fm.issue_label}
          </span>
          <span
            style={{
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontStyle: "italic",
              fontSize: 15,
              lineHeight: 1.4,
              color: "var(--text-primary)",
            }}
          >
            {hook.headline}
          </span>
        </div>
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--accent-orange)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          Read →
        </span>
      </aside>
    </Link>
  )
}
