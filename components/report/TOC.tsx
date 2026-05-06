"use client"

/**
 * Sticky table of contents for /reports/[slug].
 *
 * Auto-built by scanning the page DOM for `[data-section-anchor]` markers,
 * which the <SectionHeading> component emits. No server-side MDX parsing
 * required — the TOC is self-correcting against whatever sections actually
 * shipped.
 *
 * Desktop: sticky right-side rail, ~220px wide, vertical list with the
 * currently-visible section highlighted via IntersectionObserver.
 * Mobile: hidden by default; surfaced via a hamburger button at the top
 * that toggles a slide-down drawer.
 *
 * Accessibility: rendered as <nav aria-label="Table of contents"> with a
 * <ul> inside. Each item is an anchor link to the section's slug. Current
 * section gets aria-current="location".
 */
import { useEffect, useState } from "react"

interface TocItem {
  /** Section number prefix (e.g. "01") if SectionHeading declared one. */
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
    // SectionHeading renders the number prefix as a `<span>` with the
    // monospace number; the heading's main text is the trailing <span>.
    // Fall back to full textContent if the structure isn't recognized.
    const numberSpan = node.querySelector<HTMLElement>(":scope > span:first-child.report-numeric")
    const numberText = numberSpan?.textContent?.replace(/^§\s*/, "")?.trim() || null
    let mainText = ""
    const mainSpan = node.querySelector<HTMLElement>(":scope > span:not(.report-numeric):not(.report-section-link)")
    if (mainSpan) {
      mainText = (mainSpan.textContent ?? "").trim()
    } else {
      mainText = (node.textContent ?? "").replace(/^§\s*\S+\s*/, "").trim()
      // Strip the trailing copy-link hash button glyph if present.
      mainText = mainText.replace(/[#✓]\s*$/, "").trim()
    }
    items.push({ number: numberText, text: mainText, slug })
  })
  return items
}

export function TOC() {
  const [items, setItems] = useState<TocItem[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Build TOC from DOM after mount.
  useEffect(() => {
    setItems(extractTocFromDom())
  }, [])

  // Scroll-spy via IntersectionObserver. Section is "active" when its
  // top edge crosses ~30% from the top of the viewport.
  useEffect(() => {
    if (items.length === 0) return
    const targets = items
      .map((i) => document.getElementById(i.slug))
      .filter((el): el is HTMLElement => el != null)
    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Among intersecting entries, pick the one whose top is closest to
        // the rootMargin's upper edge (i.e. furthest down the viewport).
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          // Sort by boundingClientRect.top — pick smallest non-negative.
          visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          const top = visible[0]
          setActive(top.target.id)
        }
      },
      { rootMargin: "-30% 0% -55% 0%", threshold: 0 },
    )
    targets.forEach((t) => observer.observe(t))
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <>
      {/* Desktop sticky rail. Position + visibility handled in globals.css
          (.reports-page .report-toc-desktop) so the grid container can
          control which column the TOC lives in. */}
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
          {items.map((item) => {
            const isActive = active === item.slug
            return (
              <li key={item.slug}>
                <a
                  href={`#${item.slug}`}
                  aria-current={isActive ? "location" : undefined}
                  style={{
                    display: "block",
                    padding: "6px 8px",
                    borderRadius: 3,
                    textDecoration: "none",
                    color: isActive ? "var(--report-text)" : "var(--report-text-muted)",
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? "rgba(31, 58, 95, 0.06)" : "transparent",
                    borderLeft: `2px solid ${isActive ? "var(--report-accent)" : "transparent"}`,
                    lineHeight: 1.4,
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

      {/* Mobile floating button + drawer */}
      <div className="report-toc-mobile" style={{ position: "fixed", bottom: 16, right: 16, zIndex: 40 }}>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="report-toc-drawer"
          onClick={() => setMobileOpen((s) => !s)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: "var(--report-brand)",
            color: "#F7F4ED",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            boxShadow: "0 4px 12px rgba(15, 17, 21, 0.2)",
          }}
        >
          {mobileOpen ? "✕" : "TOC"}
        </button>
        {mobileOpen && (
          <div
            id="report-toc-drawer"
            role="dialog"
            aria-label="Table of contents"
            style={{
              position: "fixed",
              right: 16,
              bottom: 72,
              width: "min(320px, calc(100vw - 32px))",
              maxHeight: "70vh",
              overflowY: "auto",
              background: "var(--report-bg)",
              border: "1px solid var(--report-border)",
              borderRadius: 6,
              padding: 16,
              boxShadow: "0 12px 40px rgba(15, 17, 21, 0.18)",
              fontFamily: "var(--report-font-sans)",
              fontSize: 13,
            }}
          >
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {items.map((item) => (
                <li key={item.slug}>
                  <a
                    href={`#${item.slug}`}
                    onClick={() => setMobileOpen(false)}
                    style={{
                      display: "block",
                      padding: "6px 8px",
                      textDecoration: "none",
                      color: "var(--report-text)",
                      borderLeft: `2px solid ${active === item.slug ? "var(--report-accent)" : "transparent"}`,
                    }}
                  >
                    {item.number && (
                      <span
                        style={{
                          fontFamily: "var(--report-font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          color: "var(--report-accent)",
                          marginRight: 8,
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
          </div>
        )}
      </div>
    </>
  )
}
