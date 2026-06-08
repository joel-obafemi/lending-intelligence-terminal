/**
 * Screenshot the end of an individual report page — Subscribe +
 * Support + Feedback panel — to verify the new layout.
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const url = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
    ?? "https://lending-intelligence-terminal.vercel.app/reports/2026-05-may"
  const outPath = path.join(process.cwd(), "tmp", "report-end-with-subscribe.png")
  await fs.mkdir(path.dirname(outPath), { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)
  // Find the Support the work heading and scroll to it
  await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h2"))
    const target = headings.find((h) => h.textContent?.includes("Next issue"))
    if (target) target.scrollIntoView({ block: "start" })
  })
  await page.evaluate(() => window.scrollBy(0, -80))
  await page.waitForTimeout(400)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`[report-end] → ${outPath}`)
  await browser.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
