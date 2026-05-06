"use client"

/**
 * Dashboard-mode site footer.
 *
 * Renders on every page except the magazine-mode /reports surface
 * (those pages get a serif-typography support module integrated into
 * the article flow instead). Two concerns:
 *
 *  1. Support — a warm, non-aggressive note pointing at the ERC-20
 *     donation address that funds further development of these
 *     dashboards and the monthly research issues. ETH or any ERC-20
 *     token (USDC, USDT, etc.) on Ethereum mainnet.
 *
 *  2. Feedback — DM on X or email so readers can flag bugs and
 *     request additional metrics directly.
 *
 * Hidden on /reports/* via the usePathname check so the report's own
 * editorial footer takes over there.
 */
import { useState, useCallback } from "react"
import { usePathname } from "next/navigation"

const DONATION_ADDRESS = "0xD96A202CD742B00BfdFeb71b3Ce48291Ba3749D1"
const X_PROFILE_URL = "https://x.com/joel_obafemi"
const X_HANDLE = "@joel_obafemi"
const EMAIL = "joelobafemii@gmail.com"

function shortenAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

export function SiteFooter() {
  const pathname = usePathname() || ""
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {}
  }, [])

  // The reports surface has its own magazine-mode footer; skip the
  // terminal-mode footer there to avoid stylistic clash.
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
        lineHeight: 1.55,
      }}
    >
      <div
        className="max-w-[1400px] mx-auto"
        style={{
          padding: "16px 16px 14px",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 10,
        }}
      >
        {/* Support note */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "var(--accent-orange)", letterSpacing: "0.06em" }}>
            ◆ Support the work ·
          </span>
          <span>
            These dashboards and the monthly{" "}
            <a
              href="/reports"
              style={{ color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              State of DeFi Lending
            </a>{" "}
            issues are built independently. If they&apos;ve helped your work, contributions toward the
            next month&apos;s research go to:
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
          <span style={{ color: "var(--text-muted)" }}>
            Any ETH or ERC-20 token on Ethereum mainnet.
          </span>
        </div>

        {/* Feedback note */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "var(--accent-blue)", letterSpacing: "0.06em" }}>
            ◆ Feedback ·
          </span>
          <span>Spotted an error or want a metric added? Reach out:</span>
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
    </footer>
  )
}
