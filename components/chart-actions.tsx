"use client"

/**
 * ChartActions — drop-in screenshot + expand controls for any chart card.
 *
 * Usage:
 *   const cardRef = useRef<HTMLDivElement>(null)
 *   ...
 *   <div ref={cardRef} className="tui-card ...">
 *     <header>
 *       ...title, legend, time toggle...
 *       <ChartActions cardRef={cardRef} title="My chart" />
 *     </header>
 *     ...chart body...
 *   </div>
 *
 * Two buttons:
 *  - Camera → renders the cardRef element to PNG via html2canvas at 2× DPI
 *    so the saved image matches what's on screen at retina quality. The
 *    current ChartActions buttons are hidden during capture so they don't
 *    leak into the screenshot. After capture, a subtle `@joel_obafemi`
 *    watermark is drawn in the bottom-right corner.
 *  - Maximize → toggles a `chart-expanded` class on the card that promotes
 *    it to a fullscreen overlay (CSS in globals.css). The chart body uses
 *    Recharts' ResponsiveContainer so it reflows automatically. Esc closes.
 */

import { useEffect, useRef, useState } from "react"
import { Camera, Maximize2, Minimize2 } from "lucide-react"
import html2canvas from "html2canvas"

interface Props {
  cardRef: React.RefObject<HTMLElement | null>
  title: string
}

/** X handle stamped subtly into the bottom-right corner of every screenshot.
 *  Kept here so it's easy to find / change in one place. */
const WATERMARK_HANDLE = "@joel_obafemi"

/** Draw a low-opacity handle in the bottom-right corner of the canvas.
 *  Sized in CSS pixels (the 2× scale factor html2canvas uses gets folded in).
 *  Two-tone: light text + a faint matching shadow so it stays legible against
 *  any chart background. */
function drawWatermark(canvas: HTMLCanvasElement, scale: number) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  const fontPx = 10 * scale
  ctx.save()
  ctx.font = `500 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`
  ctx.textBaseline = "bottom"
  ctx.textAlign = "right"
  const padding = 10 * scale
  const x = canvas.width - padding
  const y = canvas.height - padding
  ctx.fillStyle = "rgba(15, 17, 21, 0.32)"
  ctx.fillText(WATERMARK_HANDLE, x, y)
  ctx.restore()
}

export function ChartActions({ cardRef, title }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Apply / remove the expanded class. Restored on unmount.
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

  // Esc to close.
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
    try {
      const cardBg =
        getComputedStyle(document.body).getPropertyValue("--card-bg").trim() ||
        getComputedStyle(document.body).getPropertyValue("--card").trim() ||
        "#ffffff"
      // scale 2 = retina-quality bitmap. backgroundColor avoids transparent
      // pixels that render as black on some viewers.
      const SCALE = 2
      const canvas = await html2canvas(el, {
        backgroundColor: cardBg,
        scale: SCALE,
        useCORS: true,
        logging: false,
        // Capture the live size so the rendered image matches what users see.
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
      drawWatermark(canvas, SCALE)
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png", 1.0),
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
