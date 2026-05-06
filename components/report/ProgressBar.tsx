"use client"

/**
 * Top-of-viewport reading-progress bar.
 *
 * Fills left-to-right as the reader scrolls through the issue. Tracks
 * window scroll against `document.documentElement.scrollHeight − innerHeight`
 * — at the very top the bar is 0%, at the bottom it's 100%. Sticky-positioned
 * at the top of the viewport, ~3px tall, accent color.
 *
 * Uses `requestAnimationFrame` to avoid layout thrash on every scroll
 * event. The `transition: width` on the inner fill is killed by the
 * prefers-reduced-motion reset in globals.css when needed.
 */
import { useEffect, useState } from "react"

export function ProgressBar() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = 0
    function update() {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      if (scrollable <= 0) {
        setProgress(0)
        return
      }
      const pct = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100))
      setProgress(pct)
    }
    function onScroll() {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        update()
      })
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      role="progressbar"
      aria-label="Reading progress"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "transparent",
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          background: "var(--report-accent)",
          transition: "width 80ms linear",
        }}
      />
    </div>
  )
}
