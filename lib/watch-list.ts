/**
 * Load + parse the "What to Watch" markdown file for The Lending Pulse's
 * Section 8. Kept intentionally simple — each `## Heading` becomes an
 * item, the paragraph text below becomes the body. No full markdown
 * support needed; the owner edits this file per edition and we prefer
 * a tight, predictable schema over rich formatting.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"

export interface WatchItem {
  title: string
  body: string
}

export interface WatchList {
  /** Top-level `# …` heading, usually "What to Watch" */
  title: string
  /** The "Last updated: …" line, if present */
  lastUpdated?: string
  /** Ordered list of items. */
  items: WatchItem[]
}

const CONTENT_PATH = path.join(process.cwd(), "content", "watch.md")

export async function loadWatchList(): Promise<WatchList | null> {
  let raw: string
  try {
    raw = await readFile(CONTENT_PATH, "utf-8")
  } catch {
    return null
  }

  const lines = raw.split(/\r?\n/)
  let title = "What to Watch"
  let lastUpdated: string | undefined
  const items: WatchItem[] = []

  let currentTitle: string | null = null
  let currentBody: string[] = []

  const flush = () => {
    if (currentTitle) {
      const body = currentBody.join(" ").replace(/\s+/g, " ").trim()
      items.push({ title: currentTitle, body })
    }
    currentTitle = null
    currentBody = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("# ") && !currentTitle) {
      title = trimmed.slice(2).trim()
      continue
    }
    if (trimmed.startsWith("Last updated:")) {
      lastUpdated = trimmed.replace(/^Last updated:\s*/, "")
      continue
    }
    if (trimmed.startsWith("## ")) {
      flush()
      currentTitle = trimmed.slice(3).trim()
      continue
    }
    // Skip top-level intro paragraphs before the first `##`.
    if (!currentTitle) continue
    if (trimmed.length === 0) {
      // Blank line inside an item — treat as paragraph break (preserved as space).
      currentBody.push(" ")
      continue
    }
    currentBody.push(trimmed)
  }
  flush()

  return { title, lastUpdated, items }
}
