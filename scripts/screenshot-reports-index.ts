/**
 * One-shot screenshot of the /reports index page so we can sanity-check
 * which social_image the Issue 002 Hero card is loading.
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const url = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
    ?? "https://lending-intelligence-terminal-8yttnnmtb.vercel.app/reports"
  const outPath = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
    ?? path.join(process.cwd(), "tmp", "reports-index.png")
  await fs.mkdir(path.dirname(outPath), { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1800 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  console.log(`[reports-index] Loading ${url}`)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`[reports-index] → ${outPath}`)
  await browser.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
