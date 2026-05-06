/**
 * /reports archive — landing page.
 *
 * Layout:
 *   - Header explaining what State of DeFi Lending is
 *   - Hero card for the latest issue (full-width with cover thumbnail
 *     + theme + tagline + read CTA)
 *   - Grid of all other published issues below
 *   - Newsletter signup near the bottom
 *
 * Server component. Static at deploy time; revalidates hourly so a
 * freshly-published issue appears without a manual rebuild.
 */
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

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function HeroCard({ issue }: { issue: IssueRecord }) {
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
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 32,
          padding: "32px",
          background:
            "linear-gradient(135deg, rgba(31, 58, 95, 0.06) 0%, rgba(197, 81, 26, 0.05) 100%)",
          border: "1px solid var(--report-border)",
          borderRadius: 6,
        }}
        className="report-archive-hero"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--report-accent)",
            }}
          >
            Latest issue · Issue {fm.issue_label} · {fmtDate(fm.publication_date)}
          </div>
          <h2
            style={{
              fontFamily: "var(--report-font-serif)",
              fontWeight: 700,
              fontSize: "clamp(28px, 3.5vw, 40px)",
              lineHeight: 1.15,
              letterSpacing: "-0.015em",
              margin: 0,
            }}
          >
            {fm.theme}
          </h2>
          <p
            style={{
              fontFamily: "var(--report-font-serif)",
              fontSize: 18,
              lineHeight: 1.55,
              color: "var(--report-text-muted)",
              margin: 0,
            }}
          >
            {fm.tagline}
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--report-text-muted)",
            }}
          >
            {fm.protocols.map((p) => (
              <span
                key={p}
                style={{
                  padding: "3px 10px",
                  border: "1px solid var(--report-brand)",
                  borderRadius: 999,
                  color: "var(--report-brand)",
                  fontWeight: 500,
                }}
              >
                {p}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 16px",
              alignSelf: "flex-start",
              background: "var(--report-brand)",
              color: "#F7F4ED",
              borderRadius: 4,
              fontFamily: "var(--report-font-mono)",
              fontSize: 12,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 500,
              marginTop: 8,
            }}
          >
            Read this issue →
          </div>
        </div>
      </article>
    </Link>
  )
}

function ArchiveCard({ issue }: { issue: IssueRecord }) {
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
          padding: 24,
          background: "var(--report-bg)",
          border: "1px solid var(--report-border)",
          borderRadius: 4,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
          }}
        >
          Issue {fm.issue_label} · {fmtDate(fm.publication_date)}
        </div>
        <h3
          style={{
            fontFamily: "var(--report-font-serif)",
            fontWeight: 600,
            fontSize: 22,
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {fm.theme}
        </h3>
        <p
          style={{
            fontFamily: "var(--report-font-serif)",
            fontSize: 14,
            lineHeight: 1.55,
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
          }}
        >
          {fm.reading_time_min} min read
        </span>
      </article>
    </Link>
  )
}

export default async function ReportsArchivePage() {
  const issues = await getAllIssues()
  const [latest, ...rest] = issues

  return (
    <main
      style={{ paddingTop: 64, paddingBottom: 96, paddingLeft: 24, paddingRight: 24 }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <header style={{ marginBottom: 56 }}>
          <p
            className="report-numeric"
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
            State <span style={{ fontStyle: "italic", color: "var(--report-brand)", fontWeight: 400 }}>of</span> DeFi Lending on Ethereum
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
            Monthly research on the four protocols that matter most — Aave V3, Spark, Morpho, Fluid — written for analysts and treasuries that need data, not commentary.
          </p>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <a
              href="/reports/feed.xml"
              style={{
                color: "var(--report-text-muted)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              RSS feed
            </a>
            <span style={{ color: "var(--report-border)" }} aria-hidden="true">·</span>
            <a
              href={`#${"subscribe"}`}
              style={{
                color: "var(--report-text-muted)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Subscribe
            </a>
          </div>
        </header>

        {latest ? (
          <div style={{ marginBottom: 64 }}>
            <HeroCard issue={latest} />
          </div>
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
            No issues published yet. Issue №001 arrives at the end of April 2026.
          </p>
        )}

        {rest.length > 0 && (
          <section style={{ marginBottom: 64 }} aria-labelledby="archive-heading">
            <h2
              id="archive-heading"
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
              Past issues
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 20,
              }}
            >
              {rest.map((i) => (
                <ArchiveCard key={i.slug} issue={i} />
              ))}
            </div>
          </section>
        )}

        <section
          id="subscribe"
          aria-labelledby="subscribe-heading"
          style={{
            marginTop: 64,
            padding: 32,
            background: "rgba(31, 58, 95, 0.04)",
            borderTop: "1px solid var(--report-border)",
            borderRadius: 4,
            textAlign: "center",
          }}
        >
          <h2
            id="subscribe-heading"
            style={{
              fontFamily: "var(--report-font-serif)",
              fontWeight: 600,
              fontSize: 24,
              lineHeight: 1.2,
              marginBottom: 8,
              marginTop: 0,
            }}
          >
            Get the next issue in your inbox
          </h2>
          <p
            style={{
              fontFamily: "var(--report-font-serif)",
              fontSize: 15,
              color: "var(--report-text-muted)",
              maxWidth: 480,
              margin: "0 auto 20px",
              lineHeight: 1.5,
            }}
          >
            Once a month. No spam, no sales pitch — just the sector brief.
          </p>
          <NewsletterSignup />
        </section>

        <SupportPanel />
      </div>
    </main>
  )
}
