"use client"

/**
 * ChartActions — drop-in screenshot / SVG-export / expand controls for any
 * chart card.
 *
 * Three buttons:
 *  - Camera → PNG. Best-effort raster via html2canvas + an SVG-redraw
 *    overlay for the chart bars + a native ctx.arc() pass for legend dots.
 *    Use when the consumer specifically needs a raster file.
 *  - FileDown → SVG. Pure-vector composite of the entire card. Walks the
 *    DOM and emits native SVG primitives (text → <text>, CSS circles →
 *    <circle>, backgrounds → <rect>, the chart's Recharts SVG embedded
 *    verbatim). Pixel-perfect at any zoom — no html2canvas in the path.
 *  - Maximize → toggles a `chart-expanded` class on the card promoting it
 *    to a fullscreen overlay. Recharts reflows automatically. Esc closes.
 *
 * Both export paths honor `[data-chart-export-hide]` (the W/M/Q time
 * toggle) and the actions container itself.
 */

import { useEffect, useRef, useState } from "react"
import { Camera, FileDown, Maximize2, Minimize2 } from "lucide-react"
import html2canvas from "html2canvas"

interface Props {
  cardRef: React.RefObject<HTMLElement | null>
  title: string
}

const WATERMARK_HANDLE = "@joel_obafemi"
/** Output bitmap multiplier. 2× = retina target. The SVG redraw pass
 *  produces vector-fidelity bars on top of this, so going higher just
 *  bloats PNG size + degrades html2canvas's text rendering. */
const SCALE = 2

/** Computed-style properties we inline into cloned SVG nodes so the
 *  serialized SVG renders the same colors / strokes / fonts the live DOM
 *  uses. Anything that isn't on this allowlist falls back to the SVG's own
 *  attribute (which Recharts mostly sets directly). Including too many
 *  properties bloats the SVG and slows serialization. */
const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "opacity",
  "color",
] as const

/** Walk an SVG subtree and inline computed styles for the props above so the
 *  SVG renders identically when serialized + reloaded as an Image. */
function inlineSvgStyles(node: Element, root: Element) {
  if (node instanceof Element) {
    const computed = window.getComputedStyle(node)
    let inline = ""
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop)
      if (!value || value === "none") continue
      inline += `${prop}:${value};`
    }
    if (inline) {
      const existing = node.getAttribute("style") ?? ""
      node.setAttribute("style", existing + inline)
    }
  }
  for (const child of Array.from(node.children)) {
    inlineSvgStyles(child, root)
  }
}

/** Serialize an SVG element with inline styles to an SVG string suitable for
 *  loading via `new Image()` + a `data:image/svg+xml` URL. */
function serializeSvgWithStyles(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement
  // Ensure xmlns is set — required for SVG-as-image data URLs.
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  }
  // Preserve the rendered size exactly (Recharts often renders without
  // explicit width/height on the root <svg>; an Image needs them).
  const rect = svg.getBoundingClientRect()
  clone.setAttribute("width", String(rect.width))
  clone.setAttribute("height", String(rect.height))
  inlineSvgStyles(clone, clone)
  return new XMLSerializer().serializeToString(clone)
}

/** Load an SVG string into an HTMLImageElement (so it can be drawn into a
 *  canvas). Resolves once the image has decoded. */
function loadSvgAsImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(new Error("SVG image load failed: " + String(e)))
    }
    img.src = url
  })
}

/** Returns true if the computed border-radius of a square element is large
 *  enough to make it a full circle visually. Handles both `50%` (which the
 *  browser normalizes to `width/2 px` in `borderTopLeftRadius`) and any
 *  large pixel value like Tailwind's `rounded-full` → `9999px`. */
function rendersAsCircle(node: HTMLElement, rect: DOMRect): boolean {
  if (rect.width === 0 || rect.height === 0) return false
  if (Math.abs(rect.width - rect.height) > 0.5) return false
  const cs = window.getComputedStyle(node)
  const corner = parseFloat(cs.borderTopLeftRadius)
  if (!Number.isFinite(corner)) return false
  // 0.5px slop to forgive rounding.
  return corner >= rect.width / 2 - 0.5
}

/** Find every CSS-circle element inside the card (small square element with
 *  border-radius producing a full circle) and overdraw it on the canvas as
 *  a native `ctx.arc()` — perfectly anti-aliased, pixel-aligned, no
 *  html2canvas softness. This fixes the legend dot fuzz: 8px dots are too
 *  small for html2canvas's rasterizer, but `ctx.arc()` nails them at any
 *  scale. Skips circles inside Recharts SVGs (they're already redrawn at
 *  vector fidelity by the SVG pass). */
function redrawCssCircles(card: HTMLElement, canvas: HTMLCanvasElement, scale: number) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const cardRect = card.getBoundingClientRect()
  let drawn = 0
  for (const node of Array.from(card.querySelectorAll<HTMLElement>("*"))) {
    // Skip anything inside an SVG — those go through the vector redraw pass.
    if (node.closest("svg")) continue
    const rect = node.getBoundingClientRect()
    if (!rendersAsCircle(node, rect)) continue
    if (rect.width > 24) continue  // small dots only — avoid drawing over avatar pills
    const bg = window.getComputedStyle(node).backgroundColor
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue

    const cx = (rect.left - cardRect.left + rect.width / 2) * scale
    const cy = (rect.top - cardRect.top + rect.height / 2) * scale
    const r = (rect.width / 2) * scale

    ctx.save()
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    drawn += 1
  }
  if (drawn > 0) console.debug("[chart-actions] redrew", drawn, "CSS circles")
}

/** Re-render every Recharts SVG inside the card directly from the DOM onto
 *  the existing canvas at scale resolution, replacing whatever html2canvas
 *  put there. Returns the count of SVGs successfully redrawn. */
async function redrawSvgsAtVectorFidelity(
  card: HTMLElement,
  canvas: HTMLCanvasElement,
  scale: number,
  bgFill: string,
): Promise<number> {
  const ctx = canvas.getContext("2d")
  if (!ctx) return 0
  const cardRect = card.getBoundingClientRect()
  const svgs = Array.from(card.querySelectorAll("svg")) as SVGElement[]
  let redrawn = 0
  for (const svg of svgs) {
    // Skip lucide icons / sparklines that are unaffected by the rasterization
    // issue — they're tiny and html2canvas handles them fine. Recharts
    // signature: the wrapper <div class="recharts-wrapper"> contains the
    // chart's main SVG. We use that as our filter.
    const wrapper = svg.closest(".recharts-wrapper")
    if (!wrapper) continue

    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    // Position relative to the card, then scale to bitmap coords.
    const x = (rect.left - cardRect.left) * scale
    const y = (rect.top - cardRect.top) * scale
    const w = rect.width * scale
    const h = rect.height * scale

    try {
      const svgString = serializeSvgWithStyles(svg)
      const img = await loadSvgAsImage(svgString)
      // Paint the card background first to clear any low-res html2canvas
      // output, then draw the SVG fresh at target resolution.
      ctx.fillStyle = bgFill
      ctx.fillRect(x, y, w, h)
      ctx.drawImage(img, x, y, w, h)
      redrawn += 1
    } catch (err) {
      console.warn("[chart-actions] SVG re-render skipped:", err)
    }
  }
  return redrawn
}

/** Height of the watermark footer strip (CSS px) appended below the chart
 *  card content in both PNG and SVG exports. Gives the handle clear space
 *  so it doesn't fight the legend's right-side note. */
const WATERMARK_FOOTER_PX = 22

// ─────────────────────────────────────────────────────────────────────────
// SVG download path — pure-vector composite of the chart card.
//
// Walks the card's DOM, converts each visible element to a native SVG
// primitive (text → <text>, CSS circles → <circle>, backgrounds → <rect>,
// embedded Recharts SVGs as-is), and emits one composite <svg> document.
// Output is pixel-perfect at any zoom because every element is rendered
// by the browser's native SVG engine — no rasterization in the path.
// ─────────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** Build the card-background fill — falls back through CSS variables. */
function getCardBg(): string {
  const styles = getComputedStyle(document.body)
  return (
    styles.getPropertyValue("--card-bg").trim() ||
    styles.getPropertyValue("--card").trim() ||
    "#ffffff"
  )
}

/** Apply CSS `text-transform` manually since SVG doesn't honor it. */
function applyTextTransform(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase()
  if (transform === "lowercase") return text.toLowerCase()
  if (transform === "capitalize") {
    return text.replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return text
}

/** Detect leaf-text elements: those whose direct children are only text /
 *  comment nodes (no nested elements). Avoids re-emitting nested wrappers. */
function isTextLeaf(el: Element): boolean {
  if (el.childNodes.length === 0) return false
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType !== Node.TEXT_NODE && c.nodeType !== Node.COMMENT_NODE) {
      return false
    }
  }
  return (el.textContent ?? "").trim().length > 0
}

/** Recursively walk an element, emitting SVG strings for visible content. */
function walkToSvg(
  node: Node,
  cardRect: DOMRect,
  out: string[],
  embedded: Set<Element>,
): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement

  // Same export-skip rules as the PNG path.
  if (el.hasAttribute("data-chart-export-hide")) return
  if (el.hasAttribute("data-chart-actions")) return

  const cs = window.getComputedStyle(el)
  if (cs.display === "none" || cs.visibility === "hidden") return
  if (parseFloat(cs.opacity) === 0) return

  // If this element lives inside an SVG we already embedded verbatim, stop —
  // we don't want to re-emit chart internals on top of the embedded chart.
  for (const svg of embedded) {
    if (svg.contains(el) && svg !== el) return
  }

  const rect = el.getBoundingClientRect()
  // Recharts ResponsiveContainer SVG → embed verbatim using the same
  // serializer as the PNG path (inlines computed styles for fidelity).
  if (
    el.tagName.toLowerCase() === "svg" &&
    el.closest(".recharts-wrapper") &&
    !embedded.has(el)
  ) {
    embedded.add(el)
    if (rect.width === 0 || rect.height === 0) return
    const x = rect.left - cardRect.left
    const y = rect.top - cardRect.top
    const inner = serializeSvgWithStyles(el as unknown as SVGElement)
    out.push(`<g transform="translate(${x.toFixed(2)},${y.toFixed(2)})">${inner}</g>`)
    return
  }

  if (rect.width === 0 || rect.height === 0) {
    // Could still have visible children laid out elsewhere via fragments —
    // recurse anyway.
    for (const child of Array.from(el.childNodes)) {
      walkToSvg(child, cardRect, out, embedded)
    }
    return
  }

  const x = rect.left - cardRect.left
  const y = rect.top - cardRect.top
  const w = rect.width
  const h = rect.height

  // ─── Background (rect or circle) ─────────────────────────────────────
  const bg = cs.backgroundColor
  if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
    const corner = parseFloat(cs.borderTopLeftRadius)
    const isCircle =
      Number.isFinite(corner) &&
      Math.abs(w - h) < 0.5 &&
      corner >= w / 2 - 0.5
    if (isCircle) {
      out.push(
        `<circle cx="${(x + w / 2).toFixed(2)}" cy="${(y + h / 2).toFixed(2)}" r="${(w / 2).toFixed(2)}" fill="${escapeXml(bg)}"/>`,
      )
    } else {
      const rx = Number.isFinite(corner) && corner > 0 ? `rx="${corner.toFixed(2)}" ry="${corner.toFixed(2)}"` : ""
      out.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${escapeXml(bg)}" ${rx}/>`,
      )
    }
  }

  // ─── Border (single uniform border for now) ──────────────────────────
  const borderTopWidth = parseFloat(cs.borderTopWidth)
  const borderTopColor = cs.borderTopColor
  if (
    Number.isFinite(borderTopWidth) &&
    borderTopWidth > 0 &&
    borderTopColor &&
    borderTopColor !== "transparent" &&
    borderTopColor !== "rgba(0, 0, 0, 0)"
  ) {
    // Approximate as a top-edge line (matches the chart card's header divider).
    out.push(
      `<line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(x + w).toFixed(2)}" y2="${y.toFixed(2)}" stroke="${escapeXml(borderTopColor)}" stroke-width="${borderTopWidth.toFixed(2)}"/>`,
    )
  }
  const borderBottomWidth = parseFloat(cs.borderBottomWidth)
  const borderBottomColor = cs.borderBottomColor
  if (
    Number.isFinite(borderBottomWidth) &&
    borderBottomWidth > 0 &&
    borderBottomColor &&
    borderBottomColor !== "transparent" &&
    borderBottomColor !== "rgba(0, 0, 0, 0)"
  ) {
    out.push(
      `<line x1="${x.toFixed(2)}" y1="${(y + h).toFixed(2)}" x2="${(x + w).toFixed(2)}" y2="${(y + h).toFixed(2)}" stroke="${escapeXml(borderBottomColor)}" stroke-width="${borderBottomWidth.toFixed(2)}"/>`,
    )
  }

  // ─── Text leaf → emit <text> ─────────────────────────────────────────
  if (isTextLeaf(el)) {
    const raw = (el.textContent ?? "").trim()
    if (raw) {
      const text = escapeXml(applyTextTransform(raw, cs.textTransform))
      const align = cs.textAlign
      let tx = x
      let anchor = "start"
      if (align === "center") {
        tx = x + w / 2
        anchor = "middle"
      } else if (align === "right" || align === "end") {
        tx = x + w
        anchor = "end"
      }
      const ty = y + h / 2  // dominant-baseline middle handles vertical centering
      const fontFamily = cs.fontFamily.replace(/"/g, "'")
      const letterSpacing =
        cs.letterSpacing && cs.letterSpacing !== "normal"
          ? ` letter-spacing="${cs.letterSpacing}"`
          : ""
      out.push(
        `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" dominant-baseline="middle" text-anchor="${anchor}" font-family="${escapeXml(fontFamily)}" font-size="${cs.fontSize}" font-weight="${cs.fontWeight}" fill="${escapeXml(cs.color)}"${letterSpacing}>${text}</text>`,
      )
    }
    return  // don't recurse into leaf
  }

  // ─── Recurse into children ───────────────────────────────────────────
  for (const child of Array.from(el.childNodes)) {
    walkToSvg(child, cardRect, out, embedded)
  }
}

/** Build a single composite SVG document for the entire chart card.
 *  Includes a watermark footer strip with @joel_obafemi at the bottom. */
function buildCompositeSvg(card: HTMLElement): string {
  const cardRect = card.getBoundingClientRect()
  const W = cardRect.width
  const H = cardRect.height
  const FOOTER = WATERMARK_FOOTER_PX
  const totalH = H + FOOTER
  const cardBg = getCardBg()

  const inner: string[] = []
  walkToSvg(card, cardRect, inner, new Set())

  // Watermark footer.
  inner.push(
    `<rect x="0" y="${H.toFixed(2)}" width="${W.toFixed(2)}" height="${FOOTER}" fill="${escapeXml(cardBg)}"/>`,
    `<text x="${(W - 14).toFixed(2)}" y="${(H + FOOTER / 2).toFixed(2)}" dominant-baseline="middle" text-anchor="end" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="11" font-weight="500" fill="rgba(15,17,21,0.5)">${escapeXml(WATERMARK_HANDLE)}</text>`,
  )

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${W.toFixed(2)}" height="${totalH.toFixed(2)}" ` +
    `viewBox="0 0 ${W.toFixed(2)} ${totalH.toFixed(2)}">\n` +
    `<rect width="${W.toFixed(2)}" height="${totalH.toFixed(2)}" fill="${escapeXml(cardBg)}"/>\n` +
    inner.join("\n") +
    `\n</svg>\n`
  )
}

// (WATERMARK_FOOTER_PX is declared at the top of the file; reused for both
// the PNG canvas footer and the SVG composite footer.)

/** Append a small footer strip below the captured card and stamp the X
 *  handle in it. Returns a NEW canvas (taller than the input) so callers
 *  can chain `.toBlob` on the result. The footer fills with the same card
 *  background so visually it reads as natural chrome continuing past the
 *  legend, and the watermark sits in clear space — no overlap with any
 *  chart pixels, can't be missed. */
function appendWatermarkFooter(
  src: HTMLCanvasElement,
  scale: number,
  bgFill: string,
): HTMLCanvasElement {
  const footerH = WATERMARK_FOOTER_PX * scale
  const out = document.createElement("canvas")
  out.width = src.width
  out.height = src.height + footerH
  const ctx = out.getContext("2d")
  if (!ctx) return src
  // Whole canvas background first (covers the new footer area).
  ctx.fillStyle = bgFill
  ctx.fillRect(0, 0, out.width, out.height)
  // Original capture on top.
  ctx.drawImage(src, 0, 0)
  // Watermark in the footer strip.
  const fontPx = 11 * scale
  ctx.font = `500 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`
  ctx.textBaseline = "middle"
  ctx.textAlign = "right"
  const x = out.width - 14 * scale
  const y = src.height + footerH / 2
  ctx.fillStyle = "rgba(15, 17, 21, 0.5)"
  ctx.fillText(WATERMARK_HANDLE, x, y)
  return out
}

export function ChartActions({ cardRef, title }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    if (expanded) {
      el.classList.add("chart-expanded")
      document.body.style.overflow = "hidden"
    } else {
      el.classList.remove("chart-expanded")
      document.body.style.overflow = ""
    }
    return () => {
      el.classList.remove("chart-expanded")
      document.body.style.overflow = ""
    }
  }, [expanded, cardRef])

  useEffect(() => {
    if (!expanded) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [expanded])

  async function onScreenshot() {
    const el = cardRef.current
    if (!el || busy) return
    setBusy(true)
    const actionsEl = actionsRef.current
    const prevVisibility = actionsEl?.style.visibility ?? ""
    if (actionsEl) actionsEl.style.visibility = "hidden"

    // Hide any element flagged for export-only-hide (e.g. the W/M/Q time
    // toggle). html2canvas struggles with their tight borders + bg pills
    // at small sizes; the chart's x-axis already conveys the period.
    const hideTargets = Array.from(
      el.querySelectorAll<HTMLElement>("[data-chart-export-hide]"),
    )
    const hideSnapshot = hideTargets.map((node) => ({
      node,
      prev: node.style.visibility,
    }))
    for (const t of hideTargets) t.style.visibility = "hidden"

    try {
      const styles = getComputedStyle(document.body)
      const cardBg =
        styles.getPropertyValue("--card-bg").trim() ||
        styles.getPropertyValue("--card").trim() ||
        "#ffffff"

      // Pass 1: html2canvas captures the chrome (text, table cells, badges)
      // crisply at SCALE×.
      const canvas = await html2canvas(el, {
        backgroundColor: cardBg,
        scale: SCALE,
        useCORS: true,
        logging: false,
        width: el.offsetWidth,
        height: el.offsetHeight,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
      })

      // Pass 2: redraw each Recharts SVG at vector fidelity over the bitmap.
      // html2canvas rasterizes SVG at screen resolution before scaling,
      // which is where chart-bar fuzziness came from.
      await redrawSvgsAtVectorFidelity(el, canvas, SCALE, cardBg)

      // Pass 3: overdraw CSS legend dots as native canvas circles. The 8px
      // CSS circles are too small for html2canvas to anti-alias cleanly;
      // ctx.arc() draws them perfectly at any scale.
      redrawCssCircles(el, canvas, SCALE)

      // Pass 4: append a small footer strip with the @joel_obafemi handle.
      // Returns a new (taller) canvas — replaces `canvas` for toBlob below.
      const finalCanvas = appendWatermarkFooter(canvas, SCALE, cardBg)

      const blob: Blob | null = await new Promise((res) =>
        finalCanvas.toBlob((b) => res(b), "image/png", 1.0),
      )
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safeName = title
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase()
      a.download = `${safeName || "chart"}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[chart-actions] screenshot failed:", err)
    } finally {
      if (actionsEl) actionsEl.style.visibility = prevVisibility
      for (const { node, prev } of hideSnapshot) node.style.visibility = prev
      setBusy(false)
    }
  }

  /** Pure-vector SVG download. Output is pixel-perfect at any zoom — every
   *  element is rendered by the browser's native SVG engine, no html2canvas
   *  in the path. Honors the same hide list as the PNG path so the W/M/Q
   *  toggle and the chart-actions buttons themselves don't appear. */
  async function onSvgDownload() {
    const el = cardRef.current
    if (!el || busy) return
    setBusy(true)
    const actionsEl = actionsRef.current
    const prevVisibility = actionsEl?.style.visibility ?? ""
    if (actionsEl) actionsEl.style.visibility = "hidden"
    const hideTargets = Array.from(
      el.querySelectorAll<HTMLElement>("[data-chart-export-hide]"),
    )
    const hideSnapshot = hideTargets.map((node) => ({
      node,
      prev: node.style.visibility,
    }))
    for (const t of hideTargets) t.style.visibility = "hidden"

    try {
      const svgString = buildCompositeSvg(el)
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safeName = title
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase()
      a.download = `${safeName || "chart"}.svg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[chart-actions] SVG export failed:", err)
    } finally {
      if (actionsEl) actionsEl.style.visibility = prevVisibility
      for (const { node, prev } of hideSnapshot) node.style.visibility = prev
      setBusy(false)
    }
  }

  return (
    <div ref={actionsRef} className="flex items-center gap-0.5" data-chart-actions>
      <button
        type="button"
        onClick={onScreenshot}
        disabled={busy}
        title="Save as PNG"
        aria-label="Save chart as PNG"
        className="p-1 rounded transition-colors hover:bg-card-border/40 disabled:opacity-50"
        style={{ color: "var(--text-muted)" }}
      >
        <Camera size={12} />
      </button>
      <button
        type="button"
        onClick={onSvgDownload}
        disabled={busy}
        title="Save as SVG (vector, lossless)"
        aria-label="Save chart as SVG"
        className="p-1 rounded transition-colors hover:bg-card-border/40 disabled:opacity-50"
        style={{ color: "var(--text-muted)" }}
      >
        <FileDown size={12} />
      </button>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        title={expanded ? "Collapse" : "Expand"}
        aria-label={expanded ? "Collapse chart" : "Expand chart"}
        className="p-1 rounded transition-colors hover:bg-card-border/40"
        style={{ color: "var(--text-muted)" }}
      >
        {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
    </div>
  )
}
