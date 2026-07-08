/**
 * Generalized SVG → PNG raster for social cards. Chromium handles SVG → PNG
 * cleanly with the same text metrics the original cards used.
 *
 *   npx tsx scripts/render-social-png.ts <path/to/card.svg> [path/to/card.png]
 *
 * Reads viewBox dimensions from the SVG header and rasterises at 2× scale
 * (twitter-friendly). PNG defaults to the SVG path with the extension swapped.
 */
import * as fs from "node:fs"

async function main() {
  const svgPath = process.argv[2]
  if (!svgPath) throw new Error("usage: render-social-png.ts <card.svg> [card.png]")
  const pngPath = process.argv[3] ?? svgPath.replace(/\.svg$/i, ".png")

  const svg = fs.readFileSync(svgPath, "utf-8")
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  if (!viewBoxMatch) throw new Error("SVG viewBox not found in header")
  const width = Math.round(parseFloat(viewBoxMatch[1]))
  const height = Math.round(parseFloat(viewBoxMatch[2]))
  console.log(`[render-social-png] ${svgPath}: viewBox=${width}×${height}, rasterising at 2x`)

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
  await page.waitForTimeout(200)

  await page.screenshot({
    path: pngPath,
    omitBackground: false,
    clip: { x: 0, y: 0, width, height },
  })

  await browser.close()
  const sizeKB = (fs.statSync(pngPath).size / 1024).toFixed(1)
  console.log(`[render-social-png] wrote ${pngPath} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error("[render-social-png] failed:", err instanceof Error ? err.stack : err)
  process.exit(1)
})
