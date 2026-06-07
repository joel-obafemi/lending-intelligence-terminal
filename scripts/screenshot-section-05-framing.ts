/**
 * One-off screenshot pass for the §05 framing fix.
 *
 * Captures the three §05 paragraphs the editor wanted to sanity-check
 * after the LRT-exit attribution overstatement was softened:
 *   (a) The paragraph that now starts "The asset-level LRT exit holds
 *       in adjusted form"
 *   (b) The May 15 paragraph ("the post-unpause LRT-exit reading would
 *       fit cleanly")
 *   (c) The three-outflow-days closing paragraph
 *
 *   npm exec tsx scripts/screenshot-section-05-framing.ts -- \
 *     --url=https://.../reports/2026-05-may
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
  const url = urlArg ?? "https://lending-intelligence-terminal.vercel.app/reports/2026-05-may"
  const outDir = (outArg && path.isAbsolute(outArg))
    ? outArg
    : path.join(process.cwd(), outArg ?? "tmp/section-05-framing")
  await fs.mkdir(outDir, { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  console.log(`[framing] Loading ${url}`)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(3000)

  // Locate paragraphs by unique opening phrase, scroll into view, capture viewport.
  const anchors: Array<{ slug: string; phrase: string; label: string }> = [
    { slug: "a-asset-level-lrt-exit", phrase: "The asset-level LRT exit holds in adjusted form", label: "(a) §05 framing paragraph" },
    { slug: "b-may-15-fit-cleanly",   phrase: "May 15 was the day the post-unpause LRT-exit reading would fit cleanly", label: "(b) May 15 paragraph" },
    { slug: "c-three-outflow-days",   phrase: "Of the three largest outflow days, one fits the post-unpause LRT reading", label: "(c) Three-outflow-days closing" },
  ]

  for (const a of anchors) {
    const result = await page.evaluate((p) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let n: Node | null = walker.nextNode()
      while (n) {
        if (n.textContent && n.textContent.includes(p)) {
          const el = n.parentElement
          if (el) {
            el.scrollIntoView({ block: "start" })
            return true
          }
        }
        n = walker.nextNode()
      }
      return false
    }, a.phrase)
    if (!result) {
      console.warn(`[framing] MISS · ${a.slug} · phrase not found`)
      continue
    }
    await page.evaluate(() => window.scrollBy(0, -120))
    await page.waitForTimeout(400)
    const outPath = path.join(outDir, `${a.slug}.png`)
    await page.screenshot({ path: outPath, fullPage: false })
    console.log(`[framing] ${a.label} → ${outPath}`)
  }

  await browser.close()
  console.log(`[framing] Done · ${outDir}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
