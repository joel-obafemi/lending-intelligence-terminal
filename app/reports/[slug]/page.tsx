/**
 * Individual issue page at /reports/[slug].
 *
 * Pipeline:
 *   1. Read /content/reports/<slug>.mdx via getIssueBySlug
 *   2. Parse frontmatter (gray-matter, inside getIssueBySlug)
 *   3. Wrap rendering in <IssueProvider> so propless components like
 *      <Hero /> and <CiteWidget /> can read frontmatter via context
 *   4. Compile MDX with next-mdx-remote/rsc, providing the components map
 *
 * Static generation: generateStaticParams enumerates all published slugs
 * so each issue is built once at deploy time.
 */
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { getIssueBySlug } from "@/lib/reports/getIssueBySlug"
import { getAllIssues } from "@/lib/reports/getAllIssues"
import { SectionHeading } from "@/components/report/SectionHeading"
import { Lead } from "@/components/report/Lead"
import { PullQuote } from "@/components/report/PullQuote"
import { DataTable } from "@/components/report/DataTable"
import { Annotation } from "@/components/report/Annotation"
import { MethodologyNote } from "@/components/report/MethodologyNote"
import { Chart } from "@/components/report/Chart"
import { ProgressBar } from "@/components/report/ProgressBar"
import { TOC } from "@/components/report/TOC"
import { ShareToolbar } from "@/components/report/ShareToolbar"
import { Hero } from "@/components/report/Hero"
import { CiteWidget } from "@/components/report/CiteWidget"
import { NextIssue } from "@/components/report/NextIssue"

// ISR: snapshot view is canonical and rarely changes, but the "Live"
// dataset rendered by every <Chart> is freshness-sensitive. Revalidate
// hourly so a reader who flips a chart to "Live" never sees data older
// than ~60 minutes. The snapshot view itself is stable across rebuilds.
export const revalidate = 3600
export const dynamic = "force-static"
export const dynamicParams = false

interface RouteParams {
  params: { slug: string }
}

/** "April 2026" → "May 2026". Used as the next-issue placeholder when the
 *  next issue MDX hasn't been authored yet. */
function nextMonthLabel(publicationDate: string): string {
  const d = new Date(publicationDate)
  if (Number.isNaN(d.getTime())) return ""
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  return next.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

export async function generateStaticParams() {
  const issues = await getAllIssues()
  return issues.map((i) => ({ slug: i.slug }))
}

const SITE_URL = "https://lending-intelligence-terminal.vercel.app"

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) return { title: "Issue not found · DatumLabs Reports" }
  const fm = issue.frontmatter
  const title = `${fm.title} · Issue ${fm.issue_label} · ${fm.theme}`
  const url = `${SITE_URL}/reports/${issue.slug}`
  // Next will resolve the per-route opengraph-image.tsx automatically;
  // we still declare the dimensions + alt explicitly so consumers that
  // read raw meta tags get the right hint.
  return {
    title,
    description: fm.tagline,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": [
          { url: `${SITE_URL}/reports/feed.xml`, title: "DatumLabs Reports" },
        ],
      },
    },
    openGraph: {
      type: "article",
      title,
      description: fm.tagline,
      url,
      siteName: "DatumLabs Research",
      publishedTime: fm.publication_date,
      authors: ["DatumLabs"],
      images: [
        {
          url: `${SITE_URL}/reports/${issue.slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${fm.title} — ${fm.theme}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: fm.tagline,
      images: [`${SITE_URL}/reports/${issue.slug}/opengraph-image`],
    },
    other: {
      "article:published_time": fm.publication_date,
      "article:author": SITE_URL,
    },
  }
}

export default async function IssuePage({ params }: RouteParams) {
  const [issue, allIssues] = await Promise.all([
    getIssueBySlug(params.slug),
    getAllIssues(),
  ])
  if (!issue) notFound()
  if (issue.frontmatter.status !== "published") notFound()

  // Locate prev / next from the published-issue archive. getAllIssues()
  // sorts by publication_date desc; prev = newer than current,
  // next = older. Reverse the human reading: at issue #N, "prev" means
  // the *earlier* issue (#N-1) and "next" means the upcoming #N+1.
  const sortedAsc = [...allIssues].sort(
    (a, b) =>
      Date.parse(a.frontmatter.publication_date) -
      Date.parse(b.frontmatter.publication_date),
  )
  const idx = sortedAsc.findIndex((i) => i.slug === issue.slug)
  const prev = idx > 0 ? sortedAsc[idx - 1] : null
  const next = idx >= 0 && idx < sortedAsc.length - 1 ? sortedAsc[idx + 1] : null

  const fm = issue.frontmatter
  const pageUrl = `${SITE_URL}/reports/${issue.slug}`
  const publicationYear = new Date(fm.publication_date).getFullYear()
  const ogImageUrl = `${pageUrl}/opengraph-image`

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${fm.title} · Issue ${fm.issue_label}`,
    name: fm.theme,
    description: fm.tagline,
    image: [ogImageUrl],
    datePublished: fm.publication_date,
    dateModified: fm.publication_date,
    author: {
      "@type": "Organization",
      name: "DatumLabs Research",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "DatumLabs",
      url: SITE_URL,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    keywords: ["DeFi lending", "Ethereum", ...fm.protocols].join(", "),
    isAccessibleForFree: true,
  }

  // Bind frontmatter / archive context into the propless MDX components
  // by closure. The MDX file calls them with no props (<Hero />,
  // <CiteWidget />, <NextIssue />); the route injects the frontmatter
  // and adjacency. Same closure binds freeze_date into every <Chart>.
  const components = {
    Hero: () => <Hero issue={fm} />,
    SectionHeading,
    Lead,
    PullQuote,
    DataTable,
    Annotation,
    MethodologyNote,
    Chart: (props: any) => <Chart {...props} freezeDate={fm.freeze_date} />,
    CiteWidget: () => <CiteWidget issue={fm} pageUrl={pageUrl} />,
    NextIssue: () => (
      <NextIssue
        current={issue}
        prev={prev}
        next={next}
        nextPlaceholder={
          fm.publication_date
            ? `Next issue arrives at the end of ${nextMonthLabel(fm.publication_date)}.`
            : undefined
        }
      />
    ),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <ProgressBar />
      <article className="report-prose" aria-labelledby="issue-title">
        <div
          className="report-prose-grid"
          style={{ paddingTop: "32px", paddingBottom: "64px" }}
        >
          <MDXRemote
            source={issue.body}
            components={components}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
              },
              parseFrontmatter: false,
            }}
          />
          <TOC />
        </div>
      </article>
      <ShareToolbar
        pageUrl={pageUrl}
        issueLabel={fm.issue_label}
        title={fm.title}
        publicationYear={publicationYear}
      />
    </>
  )
}
