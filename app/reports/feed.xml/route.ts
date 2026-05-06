/**
 * RSS 2.0 feed at /reports/feed.xml.
 *
 * Static at deploy time — regenerated on rebuild. ISR'd at 1 hour to
 * match the issue page's revalidate cadence so a freshly-published
 * issue surfaces in feed readers within an hour without a manual
 * deploy.
 *
 * Each <item> per spec includes title (issue title plus theme), link
 * (full issue URL), guid (issue slug), pubDate (RFC-822), description
 * (tagline + lead paragraph, HTML-safe), and enclosure (cover image
 * URL).
 */
import { getAllIssues } from "@/lib/reports/getAllIssues"

export const dynamic = "force-static"
export const revalidate = 3600

const SITE_URL = "https://lending-intelligence-terminal.vercel.app"

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function leadFromBody(body: string): string {
  // Pick the first prose paragraph after the executive-summary <Lead>
  // tag. Fall back to whichever first paragraph we can find. Strip MDX/JSX.
  const leadMatch = body.match(/<Lead>([\s\S]*?)<\/Lead>/i)
  if (leadMatch?.[1]) return leadMatch[1].replace(/\s+/g, " ").trim()
  // Strip JSX/MDX-y bits: fenced JSX tags + their content.
  const stripped = body.replace(/<[^>]+>/g, "").replace(/^\s*---[\s\S]*?---/m, "")
  const firstPara = stripped.split(/\n{2,}/).find((p) => p.trim().length > 80)
  return (firstPara ?? "").replace(/\s+/g, " ").trim().slice(0, 600)
}

export async function GET(): Promise<Response> {
  const issues = await getAllIssues()
  const lastBuildDate = new Date().toUTCString()

  const items = issues
    .map((i) => {
      const fm = i.frontmatter
      const url = `${SITE_URL}/reports/${i.slug}`
      const pubDate = new Date(fm.publication_date).toUTCString()
      const description = `${fm.tagline} ${leadFromBody(i.body)}`.trim()
      const coverUrl = `${SITE_URL}${fm.cover_image}`
      return `    <item>
      <title>${escapeXml(`${fm.title} · Issue ${fm.issue_label} · ${fm.theme}`)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="false">${escapeXml(i.slug)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
      <enclosure url="${escapeXml(coverUrl)}" type="image/png" />
    </item>`
    })
    .join("\n")

  const feedTitle = "State of DeFi Lending on Ethereum · DatumLabs Research"
  const feedDescription =
    "Monthly sector brief on the four lending protocols that matter — Aave V3, Spark, Morpho, Fluid."

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(`${SITE_URL}/reports`)}</link>
    <description>${escapeXml(feedDescription)}</description>
    <language>en-US</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(`${SITE_URL}/reports/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
