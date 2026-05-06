"use client"

/**
 * Anchored section heading for /reports.
 *
 * Replaces standard `## Heading` markdown when an MDX file uses
 * `<SectionHeading number="01">Foo</SectionHeading>`. Renders an h2 with:
 *   - Auto-generated slug ID derived from children (used by <TOC> in commit 5).
 *   - A monospaced section-number prefix (e.g. "§ 01") in the accent color.
 *   - A copy-link affordance that surfaces on hover/focus and copies the
 *     full URL with anchor to the clipboard.
 *
 * Plain `##` markdown headings still render as default h2 — the visual
 * distinction (number prefix, copy-link) is reserved for `<SectionHeading>`,
 * which marks a "section break" the TOC will pick up.
 */
import { useCallback, useMemo, useState, type ReactNode, Children } from "react"

interface Props {
  /** Section number prefix (e.g. "01", "02", "§ 1"). Optional; when omitted
   *  the heading renders without the eyebrow. */
  number?: string
  children: ReactNode
}

/** Best-effort plain-text extraction from arbitrary children. Used for both
 *  the slug and the accessibility-friendly aria-label. */
function flattenChildren(children: ReactNode): string {
  let out = ""
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      out += String(child)
    } else if (child && typeof child === "object" && "props" in child) {
      // @ts-expect-error — recursing into a child's nested children is fine
      out += flattenChildren(child.props.children)
    }
  })
  return out
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

export function SectionHeading({ number, children }: Props) {
  const text = useMemo(() => flattenChildren(children), [children])
  const slug = useMemo(() => slugify(text), [text])
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    if (typeof window === "undefined") return
    const url = `${window.location.origin}${window.location.pathname}#${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Browser denied clipboard (e.g. http://). Silent — visual cue stays default.
    }
  }, [slug])

  return (
    <h2
      id={slug}
      className="report-section-heading"
      data-section-anchor={slug}
      style={{
        position: "relative",
        fontFamily: "var(--report-font-serif)",
        fontWeight: 700,
        fontSize: "32px",
        lineHeight: 1.15,
        letterSpacing: "-0.01em",
        marginTop: "96px",
        marginBottom: "24px",
        scrollMarginTop: "24px",
      }}
    >
      {number != null && (
        <span
          className="report-numeric"
          style={{
            display: "block",
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
            marginBottom: "12px",
          }}
        >
          § {number}
        </span>
      )}
      <span>{children}</span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={`Copy link to "${text}"`}
        title={copied ? "Copied!" : "Copy link to section"}
        className="report-section-link"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 6px",
          marginLeft: "10px",
          fontFamily: "var(--report-font-mono)",
          fontSize: "13px",
          color: "var(--report-text-muted)",
          opacity: 0,
          verticalAlign: "middle",
          transition: "opacity 120ms ease",
        }}
      >
        {copied ? "✓" : "#"}
      </button>
      <style>{`
        .report-section-heading:hover .report-section-link,
        .report-section-link:focus-visible {
          opacity: 1;
        }
      `}</style>
    </h2>
  )
}
