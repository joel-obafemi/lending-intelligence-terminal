"use client"

/**
 * NewsletterSignup — slot for the Beehiv (or other) embed once we have the
 * snippet. Until then it renders a clean "coming soon" tile so layouts
 * (Sector footer, Reports footer) compose correctly. Swap the body of this
 * component when the embed lands; consumers don't need to change.
 */

import { Mail } from "lucide-react"

interface Props {
  /** Headline copy. Defaults to a generic prompt; pass a more specific one
   *  on the Reports footer ("Get the monthly Lending Pulse") etc. */
  heading?: string
  /** Subline copy. */
  body?: string
}

export function NewsletterSignup({
  heading = "The monthly Lending Pulse",
  body = "Sector TVL, rates, risk, liquidations — straight to your inbox once a month.",
}: Props) {
  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex-shrink-0 mt-0.5"
          style={{ color: "var(--accent-orange)" }}
        >
          <Mail size={18} strokeWidth={1.75} />
        </span>
        <div>
          <div
            className="text-[12px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--text-primary)" }}
          >
            {heading}
          </div>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {body}
          </p>
        </div>
      </div>
      <div
        className="text-[10px] uppercase tracking-[0.1em] flex-shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        Signup coming soon
      </div>
    </div>
  )
}
