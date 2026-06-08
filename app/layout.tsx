import type { Metadata } from "next"
import { Suspense } from "react"
import { NavHeader } from "@/components/nav-header"
import { SiteFooter } from "@/components/site-footer"
import { IframePathSync } from "@/components/iframe-path-sync"
import { ThemeProvider } from "@/components/theme-provider"
import { getFeaturedIssue } from "@/lib/reports/featuredIssue"
import "./globals.css"

/**
 * Pre-paint theme script. Reads the persisted choice from localStorage
 * and applies `data-theme` to <html> before React hydrates. Without this
 * inline pass, a user with light-mode persisted would see a dark-mode
 * flash on every page load (the default attribute we render server-side
 * is "dark"). Inline injection is intentional — Next.js's <Script>
 * loads AFTER paint, which defeats the purpose.
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = window.localStorage.getItem('lit-theme');
    if (saved !== 'light' && saved !== 'dark') saved = 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`

const SITE_URL = "https://lending-intelligence-terminal.vercel.app"

export async function generateMetadata(): Promise<Metadata> {
  // Default OG image falls back to the latest issue's social card so a
  // shared dashboard link surfaces the publication in link previews.
  // Per-route metadata (e.g. /reports/[slug]) overrides this default.
  const featured = await getFeaturedIssue()
  const ogImage = featured
    ? {
        url: featured.socialImageUrl,
        width: 1200,
        height: 630,
        alt: `DatumLabs Research · ${featured.record.frontmatter.theme}`,
      }
    : null
  return {
    title: "Lending Intelligence Terminal · Datum Labs",
    description: "Multi-protocol lending analytics: Aave V3, SparkLend, Morpho, Fluid, Compound V3, Euler V2",
    metadataBase: new URL(SITE_URL),
    alternates: {
      types: {
        "application/rss+xml": [
          { url: "/reports/feed.xml", title: "State of DeFi Lending — DatumLabs" },
        ],
      },
    },
    openGraph: ogImage
      ? {
          siteName: "DatumLabs Research",
          images: [ogImage],
        }
      : { siteName: "DatumLabs Research" },
    twitter: ogImage
      ? {
          card: "summary_large_image",
          images: [ogImage.url],
        }
      : undefined,
  }
}

function PageFallback() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 animate-pulse space-y-4">
      <div className="h-4 w-24 bg-card rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-card border border-border rounded" />
        ))}
      </div>
      <div className="h-[340px] bg-card border border-border rounded" />
    </div>
  )
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const featured = await getFeaturedIssue()
  // Serializable summary for client components (NavHeader, SiteFooter
  // etc). The full IssueRecord includes the body which client doesn't
  // need to ship.
  const featuredSummary = featured
    ? {
        slug: featured.slug,
        url: featured.url,
        isFresh: featured.isFresh,
        socialImageUrl: featured.socialImageUrl,
        title: featured.record.frontmatter.title,
        theme: featured.record.frontmatter.theme,
        tagline: featured.record.frontmatter.tagline,
        issueLabel: featured.record.frontmatter.issue_label,
        publicationDate: featured.record.frontmatter.publication_date,
        readingTimeMin: featured.record.frontmatter.reading_time_min,
        coverImage: featured.record.frontmatter.cover_image,
        socialImage: featured.record.frontmatter.social_image ?? featured.record.frontmatter.cover_image,
      }
    : null
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <div
            className="min-h-screen font-mono flex flex-col"
            style={{ background: "var(--background)", color: "var(--foreground)" }}
          >
            <NavHeader featured={featuredSummary} />
            <Suspense>
              <IframePathSync />
            </Suspense>
            <main className="flex-1">
              <Suspense fallback={<PageFallback />}>{children}</Suspense>
            </main>

            {/* Site footer — Support + Feedback notes. Hidden on /reports/*
                (those pages have their own magazine-style support module). */}
            <SiteFooter featured={featuredSummary} />

            {/* Status Bar — matches SDK DashboardLayout footer */}
            <div
              className="flex items-center justify-between px-4 lg:px-6 h-7 text-[11px]"
              style={{
                borderTop: "1px solid var(--border)",
                background: "var(--panel-header)",
                color: "var(--text-muted)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color: "var(--accent-orange)" }}>&gt;</span>
                <span>datumlab.xyz/lending-terminal</span>
              </div>
              <span>Powered by Datum Labs</span>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
