/**
 * Render the dashboard root OG image from content/og/lending-terminal.html.
 *
 *   npx tsx scripts/render-og-lending-terminal.ts
 *
 * Output: public/og-lending-terminal.png (1200×630, 2× device scale).
 * That URL becomes:
 *   https://lending-intelligence-terminal.vercel.app/og-lending-terminal.png
 * which can be referenced from the parent datumlab.xyz site's
 * /lending-terminal route metadata (or any other share surface).
 */
import * as fs from "node:fs"
import * as path from "node:path"

async function main() {
  const REPO = process.cwd()
  const htmlPath = path.join(REPO, "content/og/lending-terminal.html")
  const pngPath = path.join(REPO, "public/og-lending-terminal.png")

  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML source not found: ${htmlPath}`)
  }
  fs.mkdirSync(path.dirname(pngPath), { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`, {
    waitUntil: "networkidle",
  })
  // Give web fonts an extra tick to settle so metrics are stable.
  await page.waitForTimeout(800)

  await page.screenshot({
    path: pngPath,
    omitBackground: false,
    clip: { x: 0, y: 0, width: 1200, height: 630 },
  })

  await browser.close()
  const sizeKB = (fs.statSync(pngPath).size / 1024).toFixed(1)
  console.log(`[og:lending-terminal] wrote ${pngPath} (${sizeKB} KB, 1200×630 @ 2×)`)
}

main().catch((err) => {
  console.error("[og:lending-terminal] render failed:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
