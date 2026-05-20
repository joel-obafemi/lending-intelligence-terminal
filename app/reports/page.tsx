/**
 * /reports archive landing.
 *
 * Three zones, top to bottom:
 *  1. Hero zone — the latest published issue as a large card with the
 *     cover image as the dominant visual element. Title, theme tagline,
 *     publication date, reading time, and a "Read the issue →" CTA.
 *  2. Archive grid — every other published issue, reverse-chronological,
 *     3 cols desktop / 2 tablet / 1 mobile. Cover thumbnail, issue
 *     number, publication date, theme tagline, reading time per card.
 *     The hero issue does NOT appear in the grid.
 *     When only one issue is published the grid collapses to a single
 *     empty-state message with a working email signup form.
 *  3. Footer — "About this publication" blurb, RSS feed link with icon,
 *     a second newsletter signup module, and the SupportPanel.
 *
 * Cover thumbnails fall back to a brand-coordinated gradient placeholder
 * when the static PNG isn't built yet (the script renders covers
 * locally via Playwright; until then the hero+grid use the gradient).
 */
import path from "node:path"
import { promises as fs } from "node:fs"
import Link from "next/link"
import type { Metadata } from "next"
import { getAllIssues } from "@/lib/reports/getAllIssues"
import { NewsletterSignup } from "@/components/report/NewsletterSignup"
import { SupportPanel } from "@/components/report/SupportPanel"
import type { IssueRecord } from "@/lib/reports/types"

export const dynamic = "force-static"
export const revalidate = 3600

const SITE_URL = "https://lending-intelligence-terminal.vercel.app"

export async function generateMetadata(): Promise<Metadata> {
  const issues = await getAllIssues()
  const latest = issues[0]
  const description = latest
    ? latest.frontmatter.tagline
    : "Monthly research on DeFi lending — Aave V3, Spark, Morpho, Fluid on Ethereum."
  return {
    title: "State of DeFi Lending on Ethereum · DatumLabs Reports",
    description,
    alternates: {
      canonical: `${SITE_URL}/reports`,
      types: {
        "application/rss+xml": [
          { url: `${SITE_URL}/reports/feed.xml`, title: "DatumLabs Reports" },
        ],
      },
    },
    openGraph: {
      type: "website",
      title: "State of DeFi Lending on Ethereum · DatumLabs Reports",
      description,
      url: `${SITE_URL}/reports`,
      siteName: "DatumLabs Research",
      images: latest
        ? [
            {
              url: `${SITE_URL}/reports/${latest.slug}/opengraph-image`,
              width: 1200,
              height: 630,
              alt: latest.frontmatter.title,
            },
          ]
        : undefined,
    },
  }
}

async function coverImageAvailable(coverPath: string): Promise<boolean> {
  if (!coverPath || !coverPath.startsWith("/")) return false
  const abs = path.join(process.cwd(), "public", coverPath.replace(/^\//, ""))
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}

function fmtPublicationDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function fmtMonthYear(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Cover artwork — used by hero card + grid cards. Renders the static
// cover PNG when available; falls back to a brand-coordinated gradient
// with the title overlaid when the PNG isn't built.
// ─────────────────────────────────────────────────────────────────────────

async function CoverArtwork({
  issue,
  variant,
}: {
  issue: IssueRecord
  variant: "hero" | "thumb"
}) {
  const fm = issue.frontmatter
  const hasCover = await coverImageAvailable(fm.cover_image)
  const aspectRatio = variant === "hero" ? "1240 / 1748" : "1240 / 800"

  if (hasCover) {
    return (
      <div
        style={{
          aspectRatio,
          backgroundImage: `url("${fm.cover_image}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: 4,
        }}
        aria-label={`Cover of Issue ${fm.issue_label}: ${fm.theme}`}
        role="img"
      />
    )
  }
  // Gradient fallback — same brand pair as the print cover.
  return (
    <div
      role="img"
      aria-label={`Issue ${fm.issue_label}: ${fm.theme}`}
      style={{
        aspectRatio,
        background:
          "linear-gradient(135deg, #F7F4ED 0%, #1F3A5F 100%)",
        borderRadius: 4,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background:
            "linear-gradient(90deg, #1F3A5F 0%, #1F3A5F 60%, #C5511A 60%, #C5511A 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: variant === "hero" ? "32px" : "16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: variant === "hero" ? 16 : 8,
          color: "#F7F4ED",
        }}
      >
        <span
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: variant === "hero" ? 12 : 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#C5511A",
            fontWeight: 500,
          }}
        >
          Issue {fm.issue_label}
        </span>
        <span
          style={{
            fontFamily: "var(--report-font-serif)",
            fontWeight: 700,
            fontSize: variant === "hero" ? "clamp(28px, 3vw, 40px)" : 18,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            color: "#F7F4ED",
          }}
        >
          {fm.theme}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Hero zone — the prime click target.
// ─────────────────────────────────────────────────────────────────────────

async function HeroCard({ issue }: { issue: IssueRecord }) {
  const fm = issue.frontmatter
  return (
    <Link
      href={`/reports/${issue.slug}`}
      aria-label={`Read Issue ${fm.issue_label}: ${fm.theme}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        marginBottom: 64,
      }}
    >
      <article
        className="report-archive-hero"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 32,
          padding: 32,
          background: "rgba(31, 58, 95, 0.04)",
          border: "1px solid var(--report-border)",
          borderRadius: 6,
          transition: "border-color 100ms ease",
        }}
      >
        <div className="report-archive-hero-cover">
          <CoverArtwork issue={issue} variant="hero" />
        </div>
        <div
          className="report-archive-hero-text"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            justifyContent: "center",
          }}
        >
          <span
            className="report-numeric"
            style={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--report-accent)",
            }}
          >
            Latest issue · Issue {fm.issue_label} · {fmtPublicationDate(fm.publication_date)}
          </span>
          <h2
            style={{
              fontFamily: "var(--report-font-serif)",
              fontWeight: 700,
              fontSize: "clamp(28px, 3.6vw, 44px)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              margin: 0,
              color: "var(--report-text)",
            }}
          >
            {fm.theme}
          </h2>
          <p
            style={{
              fontFamily: "var(--report-font-serif)",
              fontStyle: "italic",
              fontSize: 18,
              lineHeight: 1.55,
              color: "var(--report-brand)",
              margin: 0,
            }}
          >
            {fm.tagline}
          </p>
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--report-text-muted)",
              marginTop: 4,
            }}
          >
            <span>{fm.reading_time_min} min read</span>
            <span aria-hidden="true">·</span>
            <span>Snapshot {fmtPublicationDate(fm.date)}</span>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              background: "var(--report-brand)",
              color: "#F7F4ED",
              borderRadius: 4,
              fontFamily: "var(--report-font-mono)",
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 500,
              marginTop: 12,
            }}
          >
            Read the issue →
          </div>
        </div>
        <style>{`
          @media (min-width: 900px) {
            .report-archive-hero {
              grid-template-columns: minmax(260px, 380px) 1fr !important;
              gap: 40px !important;
              padding: 40px !important;
            }
          }
        `}</style>
      </article>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Archive grid card.
// ─────────────────────────────────────────────────────────────────────────

async function ArchiveCard({ issue }: { issue: IssueRecord }) {
  const fm = issue.frontmatter
  return (
    <Link
      href={`/reports/${issue.slug}`}
      aria-label={`Read Issue ${fm.issue_label}: ${fm.theme}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <article
        style={{
          padding: 16,
          background: "var(--report-bg)",
          border: "1px solid var(--report-border)",
          borderRadius: 4,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <CoverArtwork issue={issue} variant="thumb" />
        <span
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
          }}
        >
          Issue {fm.issue_label} · {fmtMonthYear(fm.publication_date)}
        </span>
        <h3
          style={{
            fontFamily: "var(--report-font-serif)",
            fontWeight: 600,
            fontSize: 20,
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {fm.theme}
        </h3>
        <p
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--report-text-muted)",
            margin: 0,
            flex: 1,
          }}
        >
          {fm.tagline}
        </p>
        <span
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "var(--report-text-muted)",
            paddingTop: 4,
            borderTop: "1px solid var(--report-border)",
          }}
        >
          {fm.reading_time_min} min read
        </span>
      </article>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Empty grid state — surfaced when only the hero issue exists.
// ─────────────────────────────────────────────────────────────────────────

function EmptyGridState({ nextIssueDate }: { nextIssueDate: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 24px",
        background: "rgba(31, 58, 95, 0.04)",
        border: "1px dashed var(--report-border)",
        borderRadius: 4,
      }}
    >
      <p
        style={{
          fontFamily: "var(--report-font-serif)",
          fontStyle: "italic",
          fontSize: 18,
          color: "var(--report-text)",
          margin: "0 auto 8px",
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        Issue №002 arrives {nextIssueDate}.
      </p>
      <p
        style={{
          fontFamily: "var(--report-font-serif)",
          fontSize: 15,
          color: "var(--report-text-muted)",
          margin: "0 auto 20px",
          maxWidth: 480,
          lineHeight: 1.5,
        }}
      >
        Subscribe to receive it in your inbox.
      </p>
      <NewsletterSignup />
    </div>
  )
}

function nextIssueDateLabel(publicationDate: string): string {
  const d = new Date(publicationDate)
  if (Number.isNaN(d.getTime())) return ""
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 7))
  return next.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

// ─────────────────────────────────────────────────────────────────────────

export default async function ReportsArchivePage() {
  const issues = await getAllIssues()
  const [hero, ...rest] = issues
  const nextIssue =
    hero != null ? nextIssueDateLabel(hero.frontmatter.publication_date) : ""

  return (
    <main
      style={{
        paddingTop: 64,
        paddingBottom: 96,
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 56 }}>
          <p
            style={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--report-accent)",
              marginBottom: 16,
            }}
          >
            DatumLabs Research
          </p>
          <h1
            style={{
              fontFamily: "var(--report-font-serif)",
              fontWeight: 700,
              fontSize: "clamp(36px, 5vw, 56px)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              margin: "0 0 16px 0",
            }}
          >
            State{" "}
            <span style={{ fontStyle: "italic", color: "var(--report-brand)", fontWeight: 400 }}>
              of
            </span>{" "}
            DeFi Lending on Ethereum
          </h1>
          <p
            style={{
              fontFamily: "var(--report-font-serif)",
              fontSize: 20,
              lineHeight: 1.5,
              color: "var(--report-text-muted)",
              marginBottom: 24,
              maxWidth: 720,
            }}
          >
            Monthly research on the protocols that matter most: Aave V3, Spark,
            Morpho, Fluid, Compound V3, and Euler V2. Written for analysts and
            treasuries that need data, not commentary.
          </p>
        </header>

        {/* Zone 1 — Hero card */}
        {hero ? (
          <HeroCard issue={hero} />
        ) : (
          <p
            style={{
              padding: 32,
              border: "1px dashed var(--report-border)",
              borderRadius: 4,
              color: "var(--report-text-muted)",
              fontFamily: "var(--report-font-serif)",
              fontStyle: "italic",
            }}
          >
            No issues published yet.
          </p>
        )}

        {/* Zone 2 — Archive grid (everything except hero) or empty state */}
        <section
          style={{ marginBottom: 64 }}
          aria-labelledby="archive-grid-heading"
        >
          <h2
            id="archive-grid-heading"
            style={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 12,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--report-text-muted)",
              marginBottom: 24,
              fontWeight: 600,
            }}
          >
            {rest.length > 0 ? "Past issues" : "More issues"}
          </h2>
          {rest.length > 0 ? (
            <div className="report-archive-grid">
              {rest.map((i) => (
                <ArchiveCard key={i.slug} issue={i} />
              ))}
              <style>{`
                .report-archive-grid {
                  display: grid;
                  grid-template-columns: 1fr;
                  gap: 20px;
                }
                @media (min-width: 700px) {
                  .report-archive-grid {
                    grid-template-columns: 1fr 1fr;
                  }
                }
                @media (min-width: 1000px) {
                  .report-archive-grid {
                    grid-template-columns: 1fr 1fr 1fr;
                  }
                }
              `}</style>
            </div>
          ) : (
            <EmptyGridState nextIssueDate={nextIssue} />
          )}
        </section>

        {/* Zone 3 — Footer (about + RSS + signup) */}
        <section
          style={{
            marginTop: 64,
            paddingTop: 32,
            borderTop: "1px solid var(--report-border)",
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 32,
          }}
          aria-labelledby="archive-footer-heading"
          className="report-archive-footer"
        >
          <div>
            <h2
              id="archive-footer-heading"
              style={{
                fontFamily: "var(--report-font-sans)",
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--report-brand)",
                marginBottom: 12,
                marginTop: 0,
              }}
            >
              About this publication
            </h2>
            <p
              style={{
                fontFamily: "var(--report-font-serif)",
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--report-text-muted)",
                margin: 0,
                maxWidth: 640,
              }}
            >
              <em>State of DeFi Lending on Ethereum</em> publishes on the 7th of each
              month, covering Aave V3, Spark, Morpho, Fluid, Compound V3, and Euler V2.
              Each issue is anchored to an end-of-month snapshot and pairs prose analysis
              with live charts that draw from the same data layer powering this dashboard.{" "}
              <Link
                href="/reports/2026-04-april#methodology-heading"
                style={{
                  color: "var(--report-accent)",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                Methodology
              </Link>
              .
            </p>
            <a
              href="/reports/feed.xml"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                fontFamily: "var(--report-font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--report-text-muted)",
                textDecoration: "none",
                border: "1px solid var(--report-border)",
                borderRadius: 4,
                padding: "6px 12px",
                background: "var(--report-bg)",
              }}
              aria-label="Subscribe via RSS"
            >
              <svg width="11" height="11" viewBox="0 0 32 32" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M5 5v5c11 0 17 6 17 17h5C27 14 18 5 5 5zm0 9v5c4 0 8 4 8 8h5c0-7-6-13-13-13zm3 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"
                />
              </svg>
              RSS feed
            </a>
          </div>
          <div
            id="subscribe"
            style={{
              padding: 24,
              background: "rgba(31, 58, 95, 0.04)",
              border: "1px solid var(--report-border)",
              borderRadius: 4,
            }}
          >
            <h3
              style={{
                fontFamily: "var(--report-font-sans)",
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--report-brand)",
                marginBottom: 12,
                marginTop: 0,
              }}
            >
              Subscribe
            </h3>
            <p
              style={{
                fontFamily: "var(--report-font-serif)",
                fontSize: 15,
                lineHeight: 1.6,
                color: "var(--report-text-muted)",
                marginBottom: 16,
                marginTop: 0,
              }}
            >
              Get the next issue in your inbox the morning it publishes. Once a month, no spam.
            </p>
            <NewsletterSignup />
          </div>
          <style>{`
            @media (min-width: 900px) {
              .report-archive-footer {
                grid-template-columns: 2fr 1fr !important;
                gap: 48px !important;
              }
            }
          `}</style>
        </section>

        <SupportPanel />
      </div>
    </main>
  )
}
