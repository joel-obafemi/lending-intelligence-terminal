/**
 * Re-renders public/reports/charts-social/twitter-chart-06-ldr-by-protocol.png
 * from the updated .svg. Chromium handles SVG → PNG cleanly with the same
 * text metrics that the original card used.
 *
 *   npx tsx scripts/render-chart-06-png.ts
 *
 * Reads viewBox dimensions from the SVG header and rasterises at 2× scale
 * (twitter-friendly). Output is overwritten in place.
 */
import * as fs from "node:fs"
import * as path from "node:path"

async function main() {
  const REPO = process.cwd()
  const svgPath = path.join(REPO, "public/reports/charts-social/twitter-chart-06-ldr-by-protocol.svg")
  const pngPath = path.join(REPO, "public/reports/charts-social/twitter-chart-06-ldr-by-protocol.png")

  const svg = fs.readFileSync(svgPath, "utf-8")
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  if (!viewBoxMatch) throw new Error("SVG viewBox not found in header")
  const width = Math.round(parseFloat(viewBoxMatch[1]))
  const height = Math.round(parseFloat(viewBoxMatch[2]))
  console.log(`[chart-06] viewBox=${width}×${height}, rasterising at 2x`)

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()

  const html = `<!doctype html><html><head><style>
    html,body { margin:0; padding:0; background:#F7F4ED; }
    body { display:flex; align-items:flex-start; justify-content:flex-start; }
    svg { display:block; }
  </style></head><body>${svg}</body></html>`

  await page.setContent(html, { waitUntil: "domcontentloaded" })
  // Give the browser a tick to finalise SVG layout/font metrics.
  await page.waitForTimeout(200)

  await page.screenshot({
    path: pngPath,
    omitBackground: false,
    clip: { x: 0, y: 0, width, height },
  })

  await browser.close()
  const sizeKB = (fs.statSync(pngPath).size / 1024).toFixed(1)
  console.log(`[chart-06] wrote ${pngPath} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error("[chart-06] render failed:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
