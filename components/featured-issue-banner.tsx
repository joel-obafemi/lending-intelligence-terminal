"use client"

/**
 * Featured-issue banner — discovery hook on the Sector Overview page,
 * sits above the verdict strip.
 *
 * Visual: deep navy background (matches the print social card), accent-
 * orange small-caps eyebrow, serif issue title, italic theme tagline,
 * "Read full issue →" CTA on the right. ~80–100px tall on desktop.
 *
 * Dismissible via X button. A 7-day cookie remembers the dismissal so
 * the banner doesn't reappear for repeat visitors during that window.
 * The cookie is keyed on the issue slug — when a new issue publishes,
 * the banner reappears even if the prior issue was dismissed.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import type { FeaturedIssueSummary } from "@/lib/reports/featuredIssue"
// Import directly from editorial.ts (no fs dep) so this client component
// doesn't transitively pull in the server-only getAllIssues loader.
import { getEditorialFor } from "@/lib/reports/editorial"

interface Props {
  featured: FeaturedIssueSummary | null
}

const COOKIE_PREFIX = "featured-banner-dismissed:"
const DISMISS_DAYS = 7

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return
  const expires = new Date(Date.now() + days * 86400_000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

export function FeaturedIssueBanner({ featured }: Props) {
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (!featured) return
    const dismissed = getCookie(`${COOKIE_PREFIX}${featured.slug}`) === "1"
    setHidden(dismissed)
  }, [featured])

  if (!featured) return null
  const editorial = getEditorialFor(featured.slug)
  if (hidden) return null

  // Editorial copy is hand-authored per issue. If a brand-new issue
  // publishes before the editorial entry is added, fall back to the
  // frontmatter-derived strings so the banner never blocks on copy.
  const eyebrow =
    editorial?.banner.eyebrow ??
    `ISSUE ${featured.issueLabel.toUpperCase()} · ${new Date(featured.publicationDate)
      .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      .toUpperCase()}`
  const bannerTitle = editorial?.banner.title ?? featured.theme
  const bannerTagline = editorial?.banner.tagline ?? featured.tagline
  const bannerCta = editorial?.banner.cta ?? "Read full issue →"

  function dismiss() {
    setCookie(`${COOKIE_PREFIX}${featured!.slug}`, "1", DISMISS_DAYS)
    setHidden(true)
  }

  return (
    <aside
      className="featured-issue-banner"
      aria-label="Featured issue"
      style={{
        position: "relative",
        background: "#0E1B2C",
        color: "#F7F4ED",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <Link
        href={featured.url.replace(/^https?:\/\/[^/]+/, "")}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
          padding: "16px 56px 16px 24px",
          color: "inherit",
          textDecoration: "none",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#C5511A",
              fontWeight: 500,
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontSize: "clamp(20px, 2.4vw, 28px)",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.015em",
              color: "#F7F4ED",
            }}
          >
            {bannerTitle}
          </span>
          <span
            style={{
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.4,
              color: "#B8C9DD",
            }}
          >
            {bannerTagline}
          </span>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "#C5511A",
            color: "#F7F4ED",
            borderRadius: 4,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {bannerCta}
        </span>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dismiss()
        }}
        aria-label="Dismiss featured issue banner"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          background: "transparent",
          color: "rgba(247, 244, 237, 0.6)",
          border: "1px solid rgba(247, 244, 237, 0.18)",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 14,
          fontFamily: "inherit",
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </aside>
  )
}
