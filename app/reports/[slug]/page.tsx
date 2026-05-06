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
import {
  HeroStub,
  CiteWidgetStub,
  NextIssueStub,
} from "@/components/report/_stubs"

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

export async function generateStaticParams() {
  const issues = await getAllIssues()
  return issues.map((i) => ({ slug: i.slug }))
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) return { title: "Issue not found · DatumLabs Reports" }
  const { frontmatter } = issue
  return {
    title: `${frontmatter.title} · Issue ${frontmatter.issue_label} · ${frontmatter.theme}`,
    description: frontmatter.tagline,
  }
}

export default async function IssuePage({ params }: RouteParams) {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) notFound()
  if (issue.frontmatter.status !== "published") notFound()

  // Bind frontmatter into the propless components by closure. This keeps
  // the stubs server components — no React Context plumbing needed yet.
  // When client-only readers (TOC scroll-spy, ShareToolbar) ship in
  // commit 5, an IssueProvider will be added back for those specifically.
  const fm = issue.frontmatter
  // Bind the issue's freeze_date into every Chart by closure. The MDX
  // file declares only `<Chart source="…" range="…" />`; the route
  // injects freezeDate so authors don't have to repeat it.
  const components = {
    Hero: () => <HeroStub issue={fm} />,
    SectionHeading,
    Lead,
    PullQuote,
    DataTable,
    Annotation,
    MethodologyNote,
    Chart: (props: any) => <Chart {...props} freezeDate={fm.freeze_date} />,
    CiteWidget: () => <CiteWidgetStub issue={fm} />,
    NextIssue: NextIssueStub,
  }

  const pageUrl = `https://lending-intelligence-terminal.vercel.app/reports/${issue.slug}`
  const publicationYear = new Date(fm.publication_date).getFullYear()

  return (
    <>
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
