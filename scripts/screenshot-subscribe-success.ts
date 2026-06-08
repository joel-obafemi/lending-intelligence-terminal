/**
 * Verify the subscribe form's new success banner end-to-end against
 * the live Beehiiv-connected /api/subscribe route.
 *
 *   npm exec tsx scripts/screenshot-subscribe-success.ts -- --url=https://...
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const url = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
    ?? "https://lending-intelligence-terminal.vercel.app/"
  const outDir = path.join(process.cwd(), "tmp", "subscribe-success")
  await fs.mkdir(outDir, { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 })
  await page.waitForTimeout(2500)
  // Scroll to footer
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(outDir, "01-before.png"), fullPage: false })

  // Fill the footer email input + submit. Use a unique email so we
  // hit a fresh "subscribed" path, not "already subscribed".
  const stamp = Math.floor(Math.random() * 1e9)
  const email = `playwright-check+${stamp}@datumlab.test`
  const input = await page.$('footer input[type="email"]')
  if (!input) {
    console.error("[subscribe-check] Footer email input not found")
    process.exit(1)
  }
  await input.fill(email)
  const submit = await page.$('footer button[type="submit"]')
  if (!submit) {
    console.error("[subscribe-check] Submit button not found")
    process.exit(1)
  }
  await submit.click()
  // Wait for the banner to appear
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(outDir, "02-after.png"), fullPage: false })

  await browser.close()
  console.log(`[subscribe-check] Email submitted: ${email}`)
  console.log(`[subscribe-check] Screenshots → ${outDir}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
