/**
 * Capture screenshots of the 7 new Issue 002 inline charts on the
 * deployed page. Output goes to /tmp/issue-002-charts-<NN>.png for the
 * user's sanity-check pass before publication.
 *
 *   npm run screenshot-issue-002-charts -- \
 *     --url=https://lending-intelligence-terminal-ju1a114be.vercel.app/reports/2026-05-may
 *
 * Uses the same Playwright/Chromium dev-only dep render-covers.ts uses.
 */
import path from "node:path"
import { promises as fs } from "node:fs"

interface ChartAnchor { id: string; slug: string; label: string }
const ANCHORS: ChartAnchor[] = [
  { id: "chart-rates-rys-trajectory-12m",            slug: "01-rys-trajectory",       label: "Chart 1 · Real Yield Spread 12-month" },
  { id: "chart-sector-net-flows-by-protocol-may",    slug: "02-sector-net-flows",     label: "Chart 2 · Sector net flows by protocol" },
  { id: "chart-sector-collateral-rotation-lrt-vs-btc", slug: "03-collateral-rotation", label: "Chart 3 · LRT vs BTC collateral rotation" },
  { id: "chart-rates-usdc-supply-apy-by-protocol-may31", slug: "04-usdc-supply-apy", label: "Chart 4 · USDC supply APY by protocol" },
  { id: "chart-morpho-curator-hhi-two-panel",        slug: "05-morpho-hhi-two-panel", label: "Chart 5 · Morpho HHI + top-3 composition" },
  { id: "chart-protocol-sparklend-cumulative-deposits", slug: "06-sparklend-cumulative", label: "Chart 6 · SparkLend cumulative deposits" },
  { id: "chart-rates-take-rate-vs-tbill-12m",        slug: "07-take-rate-vs-tbill",   label: "Chart 7 · Sector take rate vs T-bill" },
]

function parseArgs(argv: string[]): { url: string; outDir: string } {
  const url = argv.find((a) => a.startsWith("--url="))?.slice("--url=".length)
    ?? "https://lending-intelligence-terminal-ju1a114be.vercel.app/reports/2026-05-may"
  const outDir = argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
    ?? path.join(process.cwd(), "tmp", "issue-002-chart-screenshots")
  return { url, outDir }
}

async function main() {
  const { url, outDir } = parseArgs(process.argv.slice(2))
  await fs.mkdir(outDir, { recursive: true })

  // Lazy-load playwright only when running; it's a devDependency.
  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1600 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  console.log(`[screenshot] Loading ${url}`)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
  // Wait a beat for Recharts ResponsiveContainer to size itself.
  await page.waitForTimeout(3000)

  // Full-page hero/cover capture (top viewport).
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  const heroPath = path.join(outDir, "00-hero-cover.png")
  await page.screenshot({ path: heroPath, fullPage: false })
  console.log(`[screenshot] Hero (above the fold) → ${heroPath}`)

  // §02 Executive Summary — grab the SectionHeading + lead + first prose
  // block and the first PullQuote underneath it.
  const sectionTwo = await page.$('h2:has-text("Executive Summary")')
  if (sectionTwo) {
    // Build a clipping box from the heading through the chart that follows.
    const box = await sectionTwo.boundingBox()
    if (box) {
      await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 60)), box.y)
      await page.waitForTimeout(400)
      const exSumPath = path.join(outDir, "00-section-02-exec-summary.png")
      // Capture the viewport at the new scroll position.
      await page.screenshot({ path: exSumPath, fullPage: false })
      console.log(`[screenshot] §02 Executive Summary lead → ${exSumPath}`)
    }
  } else {
    console.warn(`[screenshot] §02 heading not found`)
  }

  let captured = 0
  for (const a of ANCHORS) {
    const sel = `#${a.id}`
    const el = await page.$(sel)
    if (!el) {
      console.warn(`[screenshot] MISS · ${a.id} not found`)
      continue
    }
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const outPath = path.join(outDir, `${a.slug}.png`)
    await el.screenshot({ path: outPath })
    console.log(`[screenshot] ${a.label} → ${outPath}`)
    captured++
  }

  await browser.close()
  console.log(`[screenshot] Done · ${captured} / ${ANCHORS.length} captured · ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
