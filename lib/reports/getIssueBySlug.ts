/**
 * Read a single issue MDX file from /content/reports/<slug>.mdx and parse
 * its frontmatter via gray-matter. Used by the issue page route.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import type { IssueFrontmatter, IssueRecord } from "./types"

const REPORTS_DIR = path.join(process.cwd(), "content", "reports")

/** Validate the parsed frontmatter shape. Throws if a required field is
 *  missing — author error should fail the build, not silently drop. */
function validateFrontmatter(slug: string, data: Record<string, unknown>): IssueFrontmatter {
  const requiredKeys: Array<keyof IssueFrontmatter> = [
    "title",
    "issue_number",
    "issue_label",
    "date",
    "publication_date",
    "theme",
    "tagline",
    "reading_time_min",
    "cover_image",
    "social_image",
    "protocols",
    "freeze_date",
    "status",
  ]
  for (const k of requiredKeys) {
    if (data[k] == null) {
      throw new Error(`[reports] ${slug}.mdx: missing required frontmatter field "${k}"`)
    }
  }
  return data as unknown as IssueFrontmatter
}

export async function getIssueBySlug(slug: string): Promise<IssueRecord | null> {
  const filePath = path.join(REPORTS_DIR, `${slug}.mdx`)
  let raw: string
  let mtime: Date
  try {
    raw = await fs.readFile(filePath, "utf-8")
    const stat = await fs.stat(filePath)
    mtime = stat.mtime
  } catch (err) {
    return null
  }
  const parsed = matter(raw)
  const frontmatter = validateFrontmatter(slug, parsed.data)
  return {
    slug,
    frontmatter,
    body: parsed.content,
    fileMtime: Math.floor(mtime.getTime() / 1000),
  }
}
