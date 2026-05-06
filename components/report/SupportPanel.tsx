"use client"

/**
 * Magazine-mode counterpart to SiteFooter — used on /reports pages
 * (archive landing + each issue) instead of the dashboard's
 * terminal-mode footer.
 *
 * Same two concerns: a warm, non-aggressive note pointing at the
 * ERC-20 donation address, and a feedback note with X + email links.
 * Styled to match the report's serif typography and cream surface.
 */
import { useState, useCallback } from "react"

const DONATION_ADDRESS = "0xD96A202CD742B00BfdFeb71b3Ce48291Ba3749D1"
const X_PROFILE_URL = "https://x.com/joel_obafemi"
const X_HANDLE = "@joel_obafemi"
const EMAIL = "joelobafemii@gmail.com"

function shortenAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function SupportPanel() {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {}
  }, [])

  return (
    <section
      aria-labelledby="support-heading"
      style={{
        marginTop: "4em",
        padding: "32px 28px 28px",
        borderTop: "1px solid var(--report-border)",
        borderBottom: "1px solid var(--report-border)",
        background: "rgba(31, 58, 95, 0.04)",
        borderRadius: 4,
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 24,
      }}
    >
      {/* Support */}
      <div>
        <h2
          id="support-heading"
          style={{
            fontFamily: "var(--report-font-sans)",
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--report-brand)",
            marginBottom: 12,
            marginTop: 0,
          }}
        >
          Support the work
        </h2>
        <p
          style={{
            fontFamily: "var(--report-font-serif)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--report-text)",
            margin: 0,
            maxWidth: 640,
          }}
        >
          DatumLabs builds these dashboards and the monthly{" "}
          <em>State of DeFi Lending</em> issues independently, with no paywall and no sponsorships.
          If the work has been useful for a treasury decision, a research note, or a product call,
          contributions help fund the next month of analysis.
        </p>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--report-font-mono)",
              fontSize: 11,
              color: "var(--report-text-muted)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Donate (Ethereum mainnet · ETH or any ERC-20)
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              border: "1px solid var(--report-border)",
              background: "var(--report-bg)",
              borderRadius: 4,
              fontFamily: "var(--report-font-mono)",
              fontSize: 13,
              color: "var(--report-text)",
            }}
            title={DONATION_ADDRESS}
          >
            {shortenAddr(DONATION_ADDRESS)}
            <button
              type="button"
              onClick={onCopy}
              aria-label="Copy donation address"
              style={{
                background: copied ? "var(--report-accent)" : "transparent",
                color: copied ? "#F7F4ED" : "var(--report-accent)",
                border: `1px solid var(--report-accent)`,
                borderRadius: 3,
                padding: "2px 8px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </span>
        </div>
      </div>

      {/* Feedback */}
      <div
        style={{
          paddingTop: 20,
          borderTop: "1px solid var(--report-border)",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--report-font-sans)",
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--report-brand)",
            marginBottom: 12,
            marginTop: 0,
          }}
        >
          Feedback
        </h3>
        <p
          style={{
            fontFamily: "var(--report-font-serif)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--report-text)",
            margin: 0,
            maxWidth: 640,
          }}
        >
          Spotted an error in the data, or want a metric added? You can{" "}
          <a
            href={X_PROFILE_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--report-accent)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            DM {X_HANDLE} on X
          </a>{" "}
          or email{" "}
          <a
            href={`mailto:${EMAIL}?subject=${encodeURIComponent("Lending Terminal feedback")}`}
            style={{
              color: "var(--report-accent)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            {EMAIL}
          </a>
          . Both go to the author.
        </p>
      </div>
    </section>
  )
}
