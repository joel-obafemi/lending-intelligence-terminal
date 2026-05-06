"use client"

/**
 * Table of contents — bound to the hero block.
 *
 * Mounts as the hero's aside slot on desktop (≥1280px). Auto-built by
 * scanning the page DOM for `[data-section-anchor]` markers (which the
 * SectionHeading component emits). Scrolls away with the hero — no
 * persistent right-rail behavior. On <1280px it doesn't render at all;
 * readers rely on the reading-progress bar plus in-page anchor links.
 *
 * Accessibility: <nav aria-label="Table of contents"> with proper
 * aria-current on the active item, semantic anchor links.
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

  useEffect(() => {
    setItems(extractTocFromDom())
  }, [])

  if (items.length === 0) return null

  return (
    <nav
      className="report-toc-desktop"
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
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {items.map((item) => (
          <li key={item.slug}>
            <a
              href={`#${item.slug}`}
              style={{
                display: "block",
                padding: "5px 8px",
                borderRadius: 3,
                textDecoration: "none",
                color: "var(--report-text-muted)",
                lineHeight: 1.4,
                borderLeft: "2px solid transparent",
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
        ))}
      </ul>
    </nav>
  )
}
