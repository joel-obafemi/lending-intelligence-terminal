/**
 * Screenshot the corrected §06.5 Compound V3 paragraph after the
 * Comet-enumeration erratum.
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const url = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
    ?? "https://lending-intelligence-terminal.vercel.app/reports/2026-05-may"
  const outDir = path.join(process.cwd(), "tmp", "section-06-5-erratum")
  await fs.mkdir(outDir, { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)

  // Anchor: §06.5 Lead
  await page.evaluate(() => {
    const el = document.querySelector('[data-section-anchor="protocol-deep-dive-compound-v3"]') as HTMLElement | null
    if (el) el.scrollIntoView({ block: "start" })
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, "a-lead-and-totals.png"), fullPage: false })
  console.log(`[06.5] (a) Lead + totals → a-lead-and-totals.png`)

  // Scroll further to capture the data table + correction paragraph
  await page.evaluate(() => window.scrollBy(0, 600))
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(outDir, "b-table-and-correction.png"), fullPage: false })
  console.log(`[06.5] (b) Table + correction → b-table-and-correction.png`)

  await browser.close()
  console.log(`[06.5] Done · ${outDir}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
