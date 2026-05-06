"use client"

/**
 * Table of contents — persistent fixed left rail (desktop only).
 *
 * Position: fixed to the left edge of the viewport at ≥1280px so the
 * reader can jump between sections without scrolling back to the hero.
 * Below 1280px it doesn't render — readers rely on the reading-
 * progress bar and in-page anchor links.
 *
 * Auto-built by scanning the page DOM for `[data-section-anchor]`
 * markers (which the SectionHeading component emits). IntersectionObserver
 * scroll-spy highlights the section currently dominating the viewport.
 */
import { useEffect, useState } from "react"

interface TocItem {
  number: string | null
  text: string
  slug: string
}

function extractTocFromDom(): TocItem[] {
  const nodes = document.querySelectorAll<HTMLElement>("[data-section-anchor]")
  const items: TocItem[] = []
  nodes.forEach((node) => {
    const slug = node.getAttribute("data-section-anchor") ?? ""
    if (!slug) return
    const numberSpan = node.querySelector<HTMLElement>(":scope > span:first-child.report-numeric")
    const numberText = numberSpan?.textContent?.replace(/^§\s*/, "")?.trim() || null
    let mainText = ""
    const mainSpan = node.querySelector<HTMLElement>(":scope > span:not(.report-numeric):not(.report-section-link)")
    if (mainSpan) {
      mainText = (mainSpan.textContent ?? "").trim()
    } else {
      mainText = (node.textContent ?? "").replace(/^§\s*\S+\s*/, "").trim()
      mainText = mainText.replace(/[#✓]\s*$/, "").trim()
    }
    items.push({ number: numberText, text: mainText, slug })
  })
  return items
}

export function TOC() {
  const [items, setItems] = useState<TocItem[]>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    setItems(extractTocFromDom())
  }, [])

  // Scroll-spy via IntersectionObserver. Highlight the section whose
  // top crosses ~30% from the top of the viewport.
  useEffect(() => {
    if (items.length === 0) return
    const targets = items
      .map((i) => document.getElementById(i.slug))
      .filter((el): el is HTMLElement => el != null)
    if (targets.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          setActive(visible[0].target.id)
        }
      },
      { rootMargin: "-30% 0% -55% 0%", threshold: 0 },
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <nav
      className="report-toc-rail"
      aria-label="Table of contents"
      style={{
        fontFamily: "var(--report-font-sans)",
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--report-font-mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--report-text-muted)",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid var(--report-border)",
        }}
      >
        On this page
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
        {items.map((item) => {
          const isActive = active === item.slug
          return (
            <li key={item.slug}>
              <a
                href={`#${item.slug}`}
                aria-current={isActive ? "location" : undefined}
                style={{
                  display: "block",
                  padding: "5px 8px",
                  borderRadius: 3,
                  textDecoration: "none",
                  color: isActive ? "var(--report-text)" : "var(--report-text-muted)",
                  fontWeight: isActive ? 600 : 400,
                  lineHeight: 1.35,
                  borderLeft: `2px solid ${isActive ? "var(--report-accent)" : "transparent"}`,
                  background: isActive ? "rgba(31, 58, 95, 0.06)" : "transparent",
                  transition: "color 100ms ease, background 100ms ease",
                }}
              >
                {item.number && (
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--report-font-mono)",
                      fontSize: 9,
                      letterSpacing: "0.12em",
                      color: "var(--report-accent)",
                      marginBottom: 2,
                    }}
                  >
                    § {item.number}
                  </span>
                )}
                {item.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
