/**
 * Enumerate all issue MDX files in /content/reports. Returns frontmatter +
 * slugs, no body — consumers that need the body call getIssueBySlug per slug.
 *
 * Used by:
 *  - /reports archive page (ranked by publication_date desc)
 *  - generateStaticParams for /reports/[slug]
 *  - /reports/feed.xml RSS generator
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { getIssueBySlug } from "./getIssueBySlug"
import type { IssueRecord } from "./types"

const REPORTS_DIR = path.join(process.cwd(), "content", "reports")

export async function getAllIssues(): Promise<IssueRecord[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(REPORTS_DIR)
  } catch {
    return []
  }
  const slugs = entries
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
  const results = await Promise.all(slugs.map((s) => getIssueBySlug(s)))
  // Drop nulls (shouldn't happen since the slug came from readdir).
  const issues = results.filter((r): r is IssueRecord => r !== null)
  // Hide drafts and archived from public lists by default. Issue pages
  // themselves can still render a draft via direct slug if/when needed.
  const visible = issues.filter((r) => r.frontmatter.status === "published")
  // Sort by publication_date desc, with file mtime as a stable fallback.
  visible.sort((a, b) => {
    const ad = Date.parse(a.frontmatter.publication_date) || a.fileMtime * 1000
    const bd = Date.parse(b.frontmatter.publication_date) || b.fileMtime * 1000
    return bd - ad
  })
  return visible
}
