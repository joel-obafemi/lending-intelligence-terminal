/**
 * Capture the site-footer Latest Issue card. Used to verify the
 * landscape thumbnail fix after switching `socialImage` for the
 * portrait `coverImage`.
 *
 *   npm exec tsx scripts/screenshot-site-footer.ts -- --url=https://...
 */
import path from "node:path"
import { promises as fs } from "node:fs"

async function main() {
  const url = process.argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
    ?? "https://lending-intelligence-terminal.vercel.app/"
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
  const outPath = (outArg && path.isAbsolute(outArg))
    ? outArg
    : path.join(process.cwd(), outArg ?? "tmp/site-footer.png")
  await fs.mkdir(path.dirname(outPath), { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  console.log(`[footer] Loading ${url}`)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  await page.waitForTimeout(2500)
  // Scroll to the bottom and snapshot the footer band.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(800)
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`[footer] → ${outPath}`)
  await browser.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
