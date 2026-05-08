"use client"

/**
 * ChartActions — drop-in SVG-export + expand controls for any chart card.
 *
 * Two buttons:
 *  - FileDown → SVG. Pure-vector composite of the entire card. Walks the
 *    DOM and emits native SVG primitives (text → <text>, CSS circles →
 *    <circle>, backgrounds → <rect>, the chart's Recharts SVG embedded
 *    verbatim with computed styles inlined). Pixel-perfect at any zoom —
 *    the browser's native SVG renderer paints every glyph and shape.
 *  - Maximize → toggles a `chart-expanded` class on the card promoting it
 *    to a fullscreen overlay (CSS in globals.css). Recharts reflows
 *    automatically. Esc closes.
 *
 * Honors `[data-chart-export-hide]` (W/M/Q time toggles) and the actions
 * container itself — neither shows up in the export.
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FileDown, Maximize2, Minimize2 } from "lucide-react"

interface Props {
  cardRef: React.RefObject<HTMLElement | null>
  title: string
}

const WATERMARK_HANDLE = "@joel_obafemi"
/** Height of the watermark footer strip (CSS px) appended below the chart
 *  card content. Gives the handle clear space so it doesn't fight any
 *  legend / right-side notes. */
const WATERMARK_FOOTER_PX = 22

// ─────────────────────────────────────────────────────────────────────────
// Recharts SVG serializer (used by walkToSvg to embed the live chart).
//
// Recharts often relies on CSS classes for fills / strokes that don't
// survive XML serialization. We clone the SVG, walk it, and write the
// computed values for a known set of presentation attributes back as
// inline `style="..."` so the serialized SVG renders identically.
// ─────────────────────────────────────────────────────────────────────────

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

function inlineSvgStyles(node: Element) {
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
    inlineSvgStyles(child)
  }
}

function serializeSvgWithStyles(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  }
  // Recharts often renders without explicit width/height on the root <svg>;
  // SVG-as-image needs them.
  const rect = svg.getBoundingClientRect()
  clone.setAttribute("width", String(rect.width))
  clone.setAttribute("height", String(rect.height))
  inlineSvgStyles(clone)
  return new XMLSerializer().serializeToString(clone)
}

// ─────────────────────────────────────────────────────────────────────────
// SVG composition — pure-vector composite of the chart card.
//
// Walks the card's DOM, converts each visible element to a native SVG
// primitive (text → <text>, CSS circles → <circle>, backgrounds → <rect>,
// embedded Recharts SVGs as-is), and emits one composite <svg> document.
// ─────────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function getCardBg(): string {
  const styles = getComputedStyle(document.body)
  return (
    styles.getPropertyValue("--card-bg").trim() ||
    styles.getPropertyValue("--card").trim() ||
    "#ffffff"
  )
}

function applyTextTransform(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase()
  if (transform === "lowercase") return text.toLowerCase()
  if (transform === "capitalize") {
    return text.replace(/\b\w/g, (c) => c.toUpperCase())
  }
  return text
}

function isTextLeaf(el: Element): boolean {
  if (el.childNodes.length === 0) return false
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType !== Node.TEXT_NODE && c.nodeType !== Node.COMMENT_NODE) {
      return false
    }
  }
  return (el.textContent ?? "").trim().length > 0
}

function walkToSvg(
  node: Node,
  cardRect: DOMRect,
  out: string[],
  embedded: Set<Element>,
): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement

  if (el.hasAttribute("data-chart-export-hide")) return
  if (el.hasAttribute("data-chart-actions")) return

  const cs = window.getComputedStyle(el)
  if (cs.display === "none" || cs.visibility === "hidden") return
  if (parseFloat(cs.opacity) === 0) return

  // If we've already embedded an ancestor SVG, skip — don't re-emit chart
  // internals on top of the embedded chart.
  for (const svg of embedded) {
    if (svg.contains(el) && svg !== el) return
  }

  const rect = el.getBoundingClientRect()

  // Recharts SVG → embed verbatim using the serializer above.
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
    for (const child of Array.from(el.childNodes)) {
      walkToSvg(child, cardRect, out, embedded)
    }
    return
  }

  const x = rect.left - cardRect.left
  const y = rect.top - cardRect.top
  const w = rect.width
  const h = rect.height

  // Background (rect or circle).
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
      const rx =
        Number.isFinite(corner) && corner > 0
          ? `rx="${corner.toFixed(2)}" ry="${corner.toFixed(2)}"`
          : ""
      out.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${escapeXml(bg)}" ${rx}/>`,
      )
    }
  }

  // Top + bottom borders → <line>. Covers the chart card header divider
  // without trying to perfectly model 4-sided / mixed-color borders.
  const borderTopWidth = parseFloat(cs.borderTopWidth)
  const borderTopColor = cs.borderTopColor
  if (
    Number.isFinite(borderTopWidth) &&
    borderTopWidth > 0 &&
    borderTopColor &&
    borderTopColor !== "transparent" &&
    borderTopColor !== "rgba(0, 0, 0, 0)"
  ) {
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

  // Text leaf → emit <text>.
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
      const ty = y + h / 2
      const fontFamily = cs.fontFamily.replace(/"/g, "'")
      const letterSpacing =
        cs.letterSpacing && cs.letterSpacing !== "normal"
          ? ` letter-spacing="${cs.letterSpacing}"`
          : ""
      out.push(
        `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" dominant-baseline="middle" text-anchor="${anchor}" font-family="${escapeXml(fontFamily)}" font-size="${cs.fontSize}" font-weight="${cs.fontWeight}" fill="${escapeXml(cs.color)}"${letterSpacing}>${text}</text>`,
      )
    }
    return
  }

  for (const child of Array.from(el.childNodes)) {
    walkToSvg(child, cardRect, out, embedded)
  }
}

function buildCompositeSvg(card: HTMLElement): string {
  const cardRect = card.getBoundingClientRect()
  const W = cardRect.width
  const H = cardRect.height
  const totalH = H + WATERMARK_FOOTER_PX
  const cardBg = getCardBg()

  const inner: string[] = []
  walkToSvg(card, cardRect, inner, new Set())

  inner.push(
    `<rect x="0" y="${H.toFixed(2)}" width="${W.toFixed(2)}" height="${WATERMARK_FOOTER_PX}" fill="${escapeXml(cardBg)}"/>`,
    `<text x="${(W - 14).toFixed(2)}" y="${(H + WATERMARK_FOOTER_PX / 2).toFixed(2)}" dominant-baseline="middle" text-anchor="end" font-family="'JetBrains Mono', ui-monospace, monospace" font-size="11" font-weight="500" fill="rgba(15,17,21,0.5)">${escapeXml(WATERMARK_HANDLE)}</text>`,
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

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

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

      {/* Backdrop is portal'd to <body> so it sits in the document
          stacking context (z-index: 1000) below the expanded card
          (z-index: 1001) — keeps the dim overlay from bleeding onto
          the chart, which was the visible bug when the backdrop was
          a ::after pseudo-element scoped to the card. Click-to-dismiss. */}
      {expanded &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="chart-expanded-backdrop"
            onClick={() => setExpanded(false)}
            aria-hidden="true"
          />,
          document.body,
        )}
    </div>
  )
}
