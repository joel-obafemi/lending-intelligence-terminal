/**
 * Render the print + social cover PNGs for an issue from its existing
 * HTML templates in /content/reports/cover_<issue>_*.html.
 *
 *   npm run render-covers -- --slug=2026-04-april
 *
 * Output:
 *   /public/reports/<slug>-cover.png   (1240×1748, print/portrait)
 *   /public/reports/<slug>-social.png  (1200×630, social card)
 *
 * The portrait cover is the canonical issue artwork — used by the Hero
 * background on the issue page and for downstream PDF / Word doc first
 * pages. The social card duplicates the OG image (which is also generated
 * at the edge by app/reports/[slug]/opengraph-image.tsx) — having both a
 * static PNG and an edge-rendered version means platforms that prefer
 * static og:image URLs (some Slack / iMessage previews) get a clean hit.
 *
 * Implementation: spawns a headless Chromium via Playwright, navigates
 * to the local HTML file, snapshots the body. Playwright is a dev-only
 * dep so the core dashboard build doesn't depend on it. Run this script
 * locally before publishing a new issue and commit the PNGs.
 *
 * Per-issue HTML templates live in /content/reports/. For Issue #001
 * they're hand-authored; before Issue #002 we'll generalize them as
 * parameterized React components and drive them through the same
 * Playwright pipeline.
 */
import path from "node:path"
import { promises as fs } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

interface CoverSpec {
  template: string
  output: string
  width: number
  height: number
}

function parseArgs(argv: string[]): { slug: string | null } {
  const slug = argv.find((a) => a.startsWith("--slug="))?.slice("--slug=".length) ?? null
  return { slug }
}

function specsForIssue(slug: string): CoverSpec[] {
  // Issue #001's HTML templates use the issue-number suffix (001) rather
  // than the slug. Future templates should switch to the slug for
  // unambiguous lookup; this fallback handles both shapes.
  const repoRoot = process.cwd()
  const candidates = [
    {
      portraitTemplates: [
        `content/reports/cover_${slug}_portrait.html`,
        `content/reports/cover_issue_${slug.replace(/^.*-(\d+)$/, "$1")}_portrait.html`,
        `content/reports/cover_issue_001_portrait.html`,
      ],
      socialTemplates: [
        `content/reports/cover_${slug}_social.html`,
        `content/reports/cover_issue_${slug.replace(/^.*-(\d+)$/, "$1")}_social.html`,
        `content/reports/cover_issue_001_social.html`,
      ],
    },
  ]
  // Pick the first template that exists.
  return [
    {
      template: candidates[0].portraitTemplates
        .map((p) => path.join(repoRoot, p))
        .find((p) => existsSync(p)) ?? path.join(repoRoot, candidates[0].portraitTemplates[0]),
      output: path.join(repoRoot, "public", "reports", `${slug}-cover.png`),
      width: 1240,
      height: 1748,
    },
    {
      template: candidates[0].socialTemplates
        .map((p) => path.join(repoRoot, p))
        .find((p) => existsSync(p)) ?? path.join(repoRoot, candidates[0].socialTemplates[0]),
      output: path.join(repoRoot, "public", "reports", `${slug}-social.png`),
      width: 1200,
      height: 630,
    },
  ]
}

function existsSync(p: string): boolean {
  try {
    require("node:fs").accessSync(p)
    return true
  } catch {
    return false
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true })
}

async function renderCover(spec: CoverSpec, browser: any): Promise<void> {
  const exists = await fs
    .access(spec.template)
    .then(() => true)
    .catch(() => false)
  if (!exists) {
    console.warn(`  skip — template not found: ${spec.template}`)
    return
  }
  const page = await browser.newPage({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 2, // 2x for crisp PNG output
  })
  const fileUrl = pathToFileURL(spec.template).toString()
  await page.goto(fileUrl, { waitUntil: "networkidle" })
  // Wait an extra moment for web fonts to finish loading.
  await page.waitForTimeout(500)
  await ensureDir(path.dirname(spec.output))
  await page.screenshot({
    path: spec.output,
    type: "png",
    clip: { x: 0, y: 0, width: spec.width, height: spec.height },
  })
  await page.close()
  console.log(`  ✓ ${path.relative(process.cwd(), spec.output)}  (${spec.width}×${spec.height})`)
}

async function main() {
  const { slug } = parseArgs(process.argv.slice(2))
  if (!slug) {
    console.error("Usage: npm run render-covers -- --slug=<issue-slug>")
    process.exit(1)
  }
  console.log(`Rendering covers for ${slug}…`)

  // Lazy-load Playwright so this script doesn't add a hard dependency
  // on the dashboard core. Authors run `npm install -D playwright` once
  // before the first cover render.
  let chromium: any
  try {
    chromium = (await import("playwright")).chromium
  } catch (err) {
    console.error(
      "\nPlaywright is not installed. Install it as a dev dep before rendering covers:\n",
      "   npm install -D playwright && npx playwright install chromium\n",
    )
    process.exit(1)
  }

  const browser = await chromium.launch()
  try {
    for (const spec of specsForIssue(slug)) {
      await renderCover(spec, browser)
    }
  } finally {
    await browser.close()
  }
  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
