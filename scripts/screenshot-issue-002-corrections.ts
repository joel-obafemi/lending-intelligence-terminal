/**
 * One-off screenshot pass for the 2026-06-07 corrections round.
 *
 * Captures four specific anchors the editor asked to sanity-check after
 * the Aave V3 USDC fact-fix landed:
 *   (a) §01 cheat-sheet row for USDC supply APYs
 *   (b) §03 mechanism paragraph + Chart 4 (USDC supply APY by protocol)
 *   (c) §06.1 Aave V3 deep-dive lead (verify "Four threads", not "Five threads")
 *   (d) §08 forward-look first + third questions
 *
 *   npm exec tsx scripts/screenshot-issue-002-corrections.ts -- \
 *     --url=https://lending-intelligence-terminal-q4jnsbqe5.vercel.app/reports/2026-05-may
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
  const url = urlArg ?? "https://lending-intelligence-terminal-q4jnsbqe5.vercel.app/reports/2026-05-may"
  const outDir = (outArg && path.isAbsolute(outArg))
    ? outArg
    : path.join(process.cwd(), outArg ?? "tmp/issue-002-corrections")
  await fs.mkdir(outDir, { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  console.log(`[corrections] Loading ${url}`)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(3000)

  // (a) §01 cheat-sheet USDC supply APY row — scroll to the Risk Indicators
  //     table caption, then snapshot the viewport so the row sits in view.
  const riskCaption = await page.locator('text="Risk indicators, May 31 close"').first()
  if (await riskCaption.count()) {
    const box = await riskCaption.boundingBox()
    if (box) {
      await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 60)), box.y)
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(outDir, "a-section-01-cheat-sheet.png"), fullPage: false })
      console.log(`[corrections] (a) §01 cheat-sheet → a-section-01-cheat-sheet.png`)
    }
  } else {
    console.warn("[corrections] (a) Risk indicators caption not found")
  }

  // (b) §03 mechanism + Chart 4 — the new chart anchor.
  const chart4 = await page.$('#chart-rates-usdc-supply-apy-by-protocol-may31')
  if (chart4) {
    await chart4.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -260))
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(outDir, "b-section-03-mechanism-and-chart-04.png"), fullPage: false })
    console.log(`[corrections] (b) §03 mechanism + chart 4 → b-section-03-mechanism-and-chart-04.png`)
  } else {
    console.warn("[corrections] (b) chart-rates-usdc-supply-apy-by-protocol-may31 not found")
  }

  // (c) §06.1 Aave V3 deep dive lead — navigate via the SectionHeading anchor.
  await page.evaluate(() => {
    const el = document.querySelector('[data-section-anchor="protocol-deep-dive-aave-v3"]') as HTMLElement | null
    if (el) el.scrollIntoView({ block: "start" })
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, "c-section-06-1-aave-v3-lead.png"), fullPage: false })
  console.log(`[corrections] (c) §06.1 Aave V3 lead → c-section-06-1-aave-v3-lead.png`)

  // (d) §08 forward-look — same approach.
  await page.evaluate(() => {
    const el = document.querySelector('[data-section-anchor="what-to-watch-in-june"]') as HTMLElement | null
    if (el) el.scrollIntoView({ block: "start" })
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(outDir, "d-section-08-forward-look.png"), fullPage: false })
  console.log(`[corrections] (d) §08 forward-look → d-section-08-forward-look.png`)

  await browser.close()
  console.log(`[corrections] Done · ${outDir}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
