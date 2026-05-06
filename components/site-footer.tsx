"use client"

/**
 * Site-wide footer for dashboard pages.
 *
 * Three-column layout on desktop, single column on mobile:
 *   - Left  : newsletter signup (terminal-mode form)
 *   - Center: latest-issue card (cover thumbnail + title + Read CTA)
 *   - Right : links + about (RSS, methodology, support address,
 *             feedback contacts)
 *
 * Hidden on /reports/* via usePathname check — the reports surface has
 * its own magazine-mode SupportPanel.
 */
import { useState, useCallback, type FormEvent } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import type { FeaturedIssueSummary } from "@/lib/reports/featuredIssue"

const DONATION_ADDRESS = "0xD96A202CD742B00BfdFeb71b3Ce48291Ba3749D1"
const X_PROFILE_URL = "https://x.com/joel_obafemi"
const X_HANDLE = "@joel_obafemi"
const EMAIL = "joelobafemii@gmail.com"
const FALLBACK_MAILTO = "research@datumlab.xyz"

function shortenAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

interface Props {
  featured: FeaturedIssueSummary | null
}

export function SiteFooter({ featured }: Props) {
  const pathname = usePathname() || ""
  if (pathname.startsWith("/reports")) return null

  return (
    <footer
      className="site-footer"
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--panel-header)",
        color: "var(--text-muted)",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
      }}
    >
      <div
        className="max-w-[1400px] mx-auto site-footer-grid"
        style={{
          padding: "24px 16px 18px",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 24,
        }}
      >
        <NewsletterColumn />
        <LatestIssueColumn featured={featured} />
        <LinksColumn />
      </div>

      {/* Bottom row: support + feedback notes (kept as a single line of
          terminal-mode prose so the donation address is always
          surfaced even when the 3-col area is collapsed). */}
      <SupportFeedbackRow />

      <style>{`
        @media (min-width: 900px) {
          .site-footer-grid {
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 40px !important;
          }
        }
      `}</style>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function ColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--accent-orange)",
        margin: "0 0 12px",
        fontWeight: 600,
      }}
    >
      {children}
    </h3>
  )
}

function NewsletterColumn() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle")

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setStatus("err")
      return
    }
    const subject = encodeURIComponent("Subscribe me to State of DeFi Lending")
    const body = encodeURIComponent(`Please add ${email} to the monthly issue.`)
    window.location.href = `mailto:${FALLBACK_MAILTO}?subject=${subject}&body=${body}`
    setStatus("ok")
  }

  return (
    <div>
      <ColumnHeading>Subscribe</ColumnHeading>
      <p style={{ marginBottom: 10, lineHeight: 1.55, color: "var(--text-muted)" }}>
        The monthly <em>State of DeFi Lending</em> issue, in your inbox on the 7th. Once a month, no spam.
      </p>
      <form
        onSubmit={onSubmit}
        aria-label="Subscribe to State of DeFi Lending"
        style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (status === "err") setStatus("idle")
            }}
            placeholder="you@firm.com"
            required
            aria-label="Email address"
            style={{
              flex: 1,
              padding: "6px 10px",
              border: `1px solid ${status === "err" ? "var(--accent-red)" : "var(--border-bright)"}`,
              borderRadius: 3,
              fontFamily: "inherit",
              fontSize: 12,
              background: "var(--card)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "6px 12px",
              background: "var(--accent-orange)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {status === "ok" ? "Sent" : "Subscribe"}
          </button>
        </div>
      </form>
    </div>
  )
}

function LatestIssueColumn({ featured }: { featured: FeaturedIssueSummary | null }) {
  return (
    <div>
      <ColumnHeading>Latest issue</ColumnHeading>
      {!featured ? (
        <p style={{ color: "var(--text-muted)", lineHeight: 1.55 }}>
          The first issue arrives soon.
        </p>
      ) : (
        <Link
          href={featured.url.replace(/^https?:\/\/[^/]+/, "")}
          style={{
            display: "grid",
            gridTemplateColumns: "72px 1fr",
            gap: 12,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              aspectRatio: "1240 / 1748",
              backgroundImage: `url("${featured.coverImage}"), linear-gradient(135deg, #F7F4ED 0%, #1F3A5F 100%)`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: 3,
              border: "1px solid var(--border)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "var(--text-muted)", fontSize: 9, letterSpacing: "0.14em" }}>
              Issue {featured.issueLabel} · {new Date(featured.publicationDate).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
            </span>
            <span
              style={{
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1.2,
                color: "var(--foreground)",
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              {featured.theme}
            </span>
            <span
              style={{
                color: "var(--accent-orange)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              Read →
            </span>
          </div>
        </Link>
      )}
    </div>
  )
}

function LinksColumn() {
  return (
    <div>
      <ColumnHeading>Links</ColumnHeading>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 6,
        }}
      >
        <li>
          <Link
            href="/reports"
            style={{
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 11,
              letterSpacing: "0.04em",
            }}
          >
            All issues
          </Link>
        </li>
        <li>
          <a
            href="/reports/feed.xml"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 11,
              letterSpacing: "0.04em",
            }}
          >
            <svg width="9" height="9" viewBox="0 0 32 32" aria-hidden="true">
              <path
                fill="currentColor"
                d="M5 5v5c11 0 17 6 17 17h5C27 14 18 5 5 5zm0 9v5c4 0 8 4 8 8h5c0-7-6-13-13-13zm3 11a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"
              />
            </svg>
            RSS feed
          </a>
        </li>
        <li>
          <Link
            href="/reports/2026-04-april#methodology-heading"
            style={{
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 11,
              letterSpacing: "0.04em",
            }}
          >
            Methodology
          </Link>
        </li>
        <li>
          <a
            href={X_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 11,
              letterSpacing: "0.04em",
            }}
          >
            {X_HANDLE} on X
          </a>
        </li>
      </ul>
      <p
        style={{
          marginTop: 14,
          color: "var(--text-muted)",
          fontSize: 10,
          lineHeight: 1.5,
        }}
      >
        DatumLabs builds these dashboards and the monthly research issues independently.
      </p>
    </div>
  )
}

function SupportFeedbackRow() {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {}
  }, [])

  return (
    <div
      className="max-w-[1400px] mx-auto"
      style={{
        padding: "12px 16px 14px",
        borderTop: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 10,
        fontSize: 11,
        lineHeight: 1.55,
        color: "var(--text-muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--accent-orange)", letterSpacing: "0.06em" }}>
          ◆ Support the work ·
        </span>
        <span>
          If the work has been useful, contributions toward the next month of research go to
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid var(--border-bright)",
            padding: "3px 8px",
            borderRadius: 3,
            background: "var(--card)",
            color: "var(--foreground)",
          }}
        >
          <span title={DONATION_ADDRESS}>{shortenAddr(DONATION_ADDRESS)}</span>
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy donation address"
            title={copied ? "Copied" : "Copy address"}
            style={{
              background: "transparent",
              border: "none",
              color: copied ? "var(--accent-green)" : "var(--accent-orange)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 10,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: 0,
              fontWeight: 600,
            }}
          >
            {copied ? "✓ copied" : "copy"}
          </button>
        </span>
        <span>any ETH or ERC-20 token on Ethereum mainnet.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--accent-blue)", letterSpacing: "0.06em" }}>
          ◆ Feedback ·
        </span>
        <span>Spotted an error or want a metric added? You can</span>
        <a
          href={X_PROFILE_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            color: "var(--text-secondary)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          DM {X_HANDLE} on X
        </a>
        <span style={{ color: "var(--border-bright)" }}>·</span>
        <a
          href={`mailto:${EMAIL}?subject=${encodeURIComponent("Lending Terminal feedback")}`}
          style={{
            color: "var(--text-secondary)",
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          email {EMAIL}
        </a>
      </div>
    </div>
  )
}
