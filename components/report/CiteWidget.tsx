"use client"

/**
 * CiteWidget — three citation formats with per-format Copy buttons.
 *
 * Renders at the end of an issue, between the methodology and the
 * end-of-issue navigation. Each Copy button writes the formatted
 * citation to the clipboard and shows a transient ✓ confirmation.
 */
import { useState } from "react"
import type { IssueFrontmatter } from "@/lib/reports/types"

interface Props {
  issue: IssueFrontmatter
  /** Canonical URL for this issue. Used in every citation format. */
  pageUrl: string
}

interface FormatRow {
  key: "short" | "academic" | "tweet"
  label: string
  hint: string
  text: string
}

export function CiteWidget({ issue, pageUrl }: Props) {
  const year = new Date(issue.publication_date).getFullYear()
  const datePretty = new Date(issue.publication_date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  const formats: FormatRow[] = [
    {
      key: "short",
      label: "Short",
      hint: "For inline references in articles and reports",
      text: `DatumLabs. (${year}). ${issue.title}, Issue ${issue.issue_label}. ${pageUrl}`,
    },
    {
      key: "academic",
      label: "Academic (APA-style)",
      hint: "For papers, working papers, and footnotes",
      text: `DatumLabs Research. (${year}, ${datePretty}). ${issue.title}: ${issue.theme}. Issue ${issue.issue_label}. Retrieved from ${pageUrl}`,
    },
    {
      key: "tweet",
      label: "X / social",
      hint: "Pre-formatted for sharing online",
      text: `New from @DatumLabs Research: ${issue.title}, Issue ${issue.issue_label} — ${issue.theme}.\n\n${pageUrl}`,
    },
  ]

  return (
    <section
      id="cite-this-issue"
      aria-labelledby="cite-heading"
      style={{
        margin: "4em 0 2em",
        padding: "28px 28px 24px",
        background: "rgba(31, 58, 95, 0.04)",
        border: "1px solid var(--report-border)",
        borderRadius: 4,
      }}
    >
      <h2
        id="cite-heading"
        style={{
          fontFamily: "var(--report-font-sans)",
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--report-brand)",
          marginBottom: 18,
          marginTop: 0,
        }}
      >
        Cite this issue
      </h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 14 }}>
        {formats.map((f) => (
          // The FormatRow object has a `key` field used both as React's
          // list key and as an internal id. Pass each prop explicitly
          // so the explicit `key={…}` doesn't collide with a spread.
          <CitationRow key={f.key} label={f.label} hint={f.hint} text={f.text} />
        ))}
      </ul>
    </section>
  )
}

function CitationRow({ label, hint, text }: Omit<FormatRow, "key">) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {}
  }
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "start",
        paddingBottom: 14,
        borderBottom: "1px solid var(--report-border)",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--report-text-muted)",
            marginBottom: 6,
          }}
        >
          {label}
          <span style={{ marginLeft: 8, opacity: 0.7, textTransform: "none", letterSpacing: "0.04em" }}>
            {hint}
          </span>
        </div>
        <p
          style={{
            fontFamily: "var(--report-font-serif)",
            fontSize: 14,
            color: "var(--report-text)",
            lineHeight: 1.55,
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label} citation`}
        style={{
          padding: "6px 12px",
          background: copied ? "var(--report-accent)" : "transparent",
          color: copied ? "#F7F4ED" : "var(--report-text-muted)",
          border: `1px solid ${copied ? "var(--report-accent)" : "var(--report-border)"}`,
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "var(--report-font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 500,
          alignSelf: "start",
          minWidth: 80,
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </li>
  )
}
