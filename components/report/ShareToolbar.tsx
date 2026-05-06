"use client"

/**
 * Floating share toolbar that appears when the reader selects text in
 * the article body.
 *
 * Three actions:
 *   1. Tweet this excerpt — opens X with selected text + link including
 *      the closest section anchor.
 *   2. Copy with citation — copies "<selected text>" + a short citation
 *      (DatumLabs, year, issue label, anchor URL).
 *   3. Copy permalink — copies the URL with a W3C text fragment encoded
 *      so the recipient's browser highlights the same selection.
 *
 * The toolbar attaches `selectionchange` and `mouseup` listeners to the
 * window scoped to the article element. When a non-empty selection inside
 * the article is detected, the toolbar positions itself just above the
 * selection's bounding rect and fades in. Selecting elsewhere (or
 * collapsing the selection) hides it.
 */
import { useEffect, useRef, useState } from "react"

interface Props {
  /** Article URL — used as the base for permalinks + tweet copy. */
  pageUrl: string
  /** Issue label (e.g. "№001") for the citation copy. */
  issueLabel: string
  /** Short title for the citation copy. */
  title: string
  /** Publication year for the citation copy. */
  publicationYear: number
}

interface ToolbarState {
  text: string
  rect: { top: number; left: number; width: number } | null
  /** Closest section anchor id, used for in-page sharing context. */
  anchor: string | null
}

const HIDDEN: ToolbarState = { text: "", rect: null, anchor: null }

function findClosestSectionAnchor(node: Node | null): string | null {
  let n: Node | null = node
  while (n && n.nodeType !== Node.ELEMENT_NODE) n = n.parentNode
  let el = n as HTMLElement | null
  while (el) {
    if (el.dataset?.sectionAnchor) return el.dataset.sectionAnchor
    // Look at preceding section heading among siblings.
    let prev = el.previousElementSibling as HTMLElement | null
    while (prev) {
      if (prev.dataset?.sectionAnchor) return prev.dataset.sectionAnchor
      prev = prev.previousElementSibling as HTMLElement | null
    }
    el = el.parentElement
  }
  return null
}

/** W3C text-fragment URL encoding. Picks the first 5 + last 5 words of
 *  the selection so the URL stays short while remaining specific enough
 *  to highlight on the destination browser. */
function buildTextFragmentSuffix(selectedText: string): string {
  const words = selectedText.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  if (words.length <= 12) {
    return `:~:text=${encodeURIComponent(words.join(" "))}`
  }
  const head = words.slice(0, 5).join(" ")
  const tail = words.slice(-5).join(" ")
  return `:~:text=${encodeURIComponent(head)},${encodeURIComponent(tail)}`
}

export function ShareToolbar({
  pageUrl,
  issueLabel,
  title,
  publicationYear,
}: Props) {
  const [state, setState] = useState<ToolbarState>(HIDDEN)
  const [copied, setCopied] = useState<"" | "citation" | "permalink">("")
  const lastTriggerRef = useRef(0)

  useEffect(() => {
    function update() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setState(HIDDEN)
        return
      }
      const text = sel.toString().trim()
      if (text.length < 8) {
        setState(HIDDEN)
        return
      }
      const range = sel.getRangeAt(0)
      const article = document.querySelector("article.report-prose")
      if (!article || !article.contains(range.commonAncestorContainer)) {
        setState(HIDDEN)
        return
      }
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        setState(HIDDEN)
        return
      }
      const anchor = findClosestSectionAnchor(range.commonAncestorContainer)
      setState({
        text,
        rect: {
          top: rect.top + window.scrollY - 48,
          left: rect.left + rect.width / 2,
          width: rect.width,
        },
        anchor,
      })
    }
    function debounced() {
      const now = Date.now()
      lastTriggerRef.current = now
      window.setTimeout(() => {
        if (lastTriggerRef.current === now) update()
      }, 60)
    }
    document.addEventListener("selectionchange", debounced)
    document.addEventListener("mouseup", debounced)
    document.addEventListener("touchend", debounced)
    return () => {
      document.removeEventListener("selectionchange", debounced)
      document.removeEventListener("mouseup", debounced)
      document.removeEventListener("touchend", debounced)
    }
  }, [])

  if (!state.rect) return null

  const anchorSuffix = state.anchor ? `#${state.anchor}` : ""
  const sharedUrl = `${pageUrl}${anchorSuffix}`

  function tweet() {
    const text = `"${state.text}"\n\n— DatumLabs, ${title} ${issueLabel}\n${sharedUrl}`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function copyCitation() {
    const citation = `"${state.text}" — DatumLabs (${publicationYear}). ${title}, Issue ${issueLabel}. ${sharedUrl}`
    try {
      await navigator.clipboard.writeText(citation)
      setCopied("citation")
      window.setTimeout(() => setCopied(""), 1400)
    } catch {}
  }

  async function copyPermalink() {
    const fragment = buildTextFragmentSuffix(state.text)
    const url = `${pageUrl}${anchorSuffix}${fragment ? (anchorSuffix ? "" : "#") + fragment : ""}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied("permalink")
      window.setTimeout(() => setCopied(""), 1400)
    } catch {}
  }

  return (
    <div
      role="toolbar"
      aria-label="Share selection"
      style={{
        position: "absolute",
        top: state.rect.top,
        left: state.rect.left,
        transform: "translateX(-50%)",
        background: "var(--report-bg-dark)",
        color: "#F7F4ED",
        padding: "6px 8px",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(15, 17, 21, 0.25)",
        display: "inline-flex",
        gap: 4,
        fontFamily: "var(--report-font-sans)",
        fontSize: 12,
        zIndex: 50,
      }}
    >
      <button type="button" onClick={tweet} style={btnStyle}>
        Tweet
      </button>
      <span style={{ width: 1, background: "rgba(247, 244, 237, 0.18)" }} aria-hidden="true" />
      <button type="button" onClick={copyCitation} style={btnStyle}>
        {copied === "citation" ? "✓ Citation" : "Copy with citation"}
      </button>
      <span style={{ width: 1, background: "rgba(247, 244, 237, 0.18)" }} aria-hidden="true" />
      <button type="button" onClick={copyPermalink} style={btnStyle}>
        {copied === "permalink" ? "✓ Permalink" : "Copy permalink"}
      </button>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: "transparent",
  color: "inherit",
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "inherit",
  padding: "4px 8px",
  borderRadius: 3,
  letterSpacing: "0.04em",
}
