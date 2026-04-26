"use client"

import { useState } from "react"
import { Info } from "lucide-react"

interface Props {
  /** Plain-text definition of the metric / chart. Single sentence ideal. */
  text: string
  /** Optional source attribution (e.g. "DefiLlama Yields", "rate_snapshots DB"). */
  source?: string
  /** Optional methodology link. */
  href?: string
}

/**
 * Inline info icon → tooltip popover. Click to toggle, click-outside or
 * second-click to close. Accessible via keyboard (Enter / Space). Used in
 * chart card headers next to the title.
 */
export function MethodologyTooltip({ text, source, href }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        aria-label="Methodology"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          background: "transparent",
          border: "none",
          padding: "1px 2px",
          cursor: "pointer",
          color: open ? "var(--accent-orange)" : "var(--text-muted)",
        }}
      >
        <Info size={11} strokeWidth={2.25} />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "6px",
            zIndex: 10,
            width: "min(320px, 80vw)",
            background: "var(--tooltip-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "4px",
            padding: "10px 12px",
            boxShadow: "0 8px 32px var(--tooltip-shadow)",
            backdropFilter: "blur(12px)",
            fontSize: "11px",
            lineHeight: 1.5,
            color: "var(--text-secondary)",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: 400,
            whiteSpace: "normal",
          }}
        >
          <div style={{ marginBottom: source || href ? "6px" : 0 }}>{text}</div>
          {source && (
            <div style={{ color: "var(--text-muted)", fontSize: "10px" }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", marginRight: "4px" }}>
                Source
              </span>
              {source}
            </div>
          )}
          {href && (
            <div style={{ marginTop: "4px" }}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent-orange)", fontSize: "10px" }}
              >
                Methodology details ↗
              </a>
            </div>
          )}
        </span>
      )}
    </span>
  )
}
