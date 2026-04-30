"use client"

/**
 * Cite-this-page widget — small footer card with a copy-able citation block.
 *
 * Renders a one-click copy button next to a pre-built citation string. The
 * date is computed client-side so the citation always reflects the visit
 * date, not a stale build timestamp.
 */
import { useState } from "react"
import { ClipboardCopy, Check } from "lucide-react"

interface Props {
  /** Page title used in the citation, e.g. "Sector Overview". */
  pageTitle: string
  /** Canonical URL of the page (relative or absolute). */
  pageUrl: string
}

export function CiteThisPage({ pageTitle, pageUrl }: Props) {
  const [copied, setCopied] = useState(false)
  const todayLong = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  const citation = `Datum Labs. (${new Date().getUTCFullYear()}). Lending Intelligence Terminal — ${pageTitle}. Retrieved ${todayLong} from ${pageUrl}.`

  function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    navigator.clipboard.writeText(citation).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded p-4 flex flex-col gap-2">
      <div
        className="text-[10px] uppercase tracking-[0.1em] font-bold"
        style={{ color: "var(--accent-orange)" }}
      >
        Cite this page
      </div>
      <p
        className="text-[11px] leading-relaxed font-mono"
        style={{ color: "var(--text-secondary)" }}
      >
        {citation}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className="self-start inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em]"
        style={{
          padding: "4px 10px",
          border: "1px solid var(--card-border)",
          borderRadius: "4px",
          background: "var(--background)",
          color: copied ? "var(--success)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        {copied ? (
          <>
            <Check size={11} strokeWidth={2.5} />
            <span>Copied</span>
          </>
        ) : (
          <>
            <ClipboardCopy size={11} strokeWidth={2.25} />
            <span>Copy citation</span>
          </>
        )}
      </button>
    </div>
  )
}
