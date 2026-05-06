"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import type { FeaturedIssueSummary } from "@/lib/reports/featuredIssue"

/**
 * Top navigation bar for the Lending Intelligence Terminal.
 *
 * Mirrors the `DashboardLayout` chrome from `@datumlabs/dashboard-kit` so the
 * terminal stays visually consistent with other DatumLabs dashboards (the
 * Datum Labs icon on the left, terminal title, nav links, CONNECTED status).
 *
 * Light-mode only — the SDK theme is light-only and we follow.
 *
 * Reports tab gets a "NEW" badge when the latest published issue is fresh
 * (publication_date < 14 days) and a hover dropdown showing the issue
 * cover thumbnail + title + theme + Read CTA.
 */

const DASHBOARD_TITLE = "Lending Intelligence Terminal"

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/protocols", label: "Protocols" },
  { href: "/rates", label: "Rates" },
  { href: "/revenue", label: "Revenue" },
  { href: "/collateral", label: "Collateral" },
  { href: "/risk", label: "Risk" },
  { href: "/compare", label: "Compare" },
  { href: "/reports", label: "Reports" },
]

interface Props {
  featured: FeaturedIssueSummary | null
}

export function NavHeader({ featured }: Props) {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

  function fmtMonth(s: string): string {
    return new Date(s).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  }

  return (
    <>
      {/* Top Navigation Bar */}
      <nav style={{ borderBottom: "1px solid var(--border)", background: "var(--panel-header)" }}>
        <div className="max-w-[1400px] mx-auto px-4 lg:px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/branding/datumlabs-icon.png"
                alt="Datum Labs"
                width={22}
                height={22}
                className="rounded-sm"
                priority
              />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                |
              </span>
              <span
                className="text-[10px] uppercase tracking-[0.15em]"
                style={{ color: "var(--text-muted)" }}
              >
                {DASHBOARD_TITLE}
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const active = isActive(item.href)
                if (item.href === "/reports") {
                  return (
                    <ReportsNavItem
                      key={item.href}
                      active={active}
                      featured={featured}
                    />
                  )
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className="px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] rounded transition-colors"
                    style={{
                      color: active ? "var(--accent-orange)" : "var(--text-muted)",
                      background: active ? "rgba(255, 107, 53, 0.08)" : "transparent",
                      borderBottom: active
                        ? "1px solid var(--accent-orange)"
                        : "1px solid transparent",
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {/* CONNECTED indicator (matches SDK DashboardLayout) */}
            <span
              className="inline-flex items-center gap-1.5 text-[10px]"
              style={{ color: "var(--text-muted)" }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "var(--accent-orange)" }}
              />
              CONNECTED
            </span>
          </div>
        </div>
      </nav>

      {/* Mobile Nav */}
      <div
        className="md:hidden flex items-center gap-1 px-4 py-2 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--panel-header)" }}
      >
        {navItems.map((item) => {
          const active = isActive(item.href)
          const showBadge = item.href === "/reports" && featured?.isFresh
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] rounded whitespace-nowrap transition-colors"
              style={{
                color: active ? "var(--accent-orange)" : "var(--text-muted)",
                background: active ? "rgba(255, 107, 53, 0.08)" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {item.label}
              {showBadge && (
                <span
                  style={{
                    background: "var(--accent-orange)",
                    color: "#FFFFFF",
                    padding: "1px 5px",
                    borderRadius: 2,
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                  }}
                >
                  NEW
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </>
  )

  function ReportsNavItem({
    active,
    featured,
  }: {
    active: boolean
    featured: FeaturedIssueSummary | null
  }) {
    return (
      <div className="reports-nav-wrapper" style={{ position: "relative" }}>
        <Link
          href="/reports"
          prefetch={true}
          className="px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] rounded transition-colors"
          style={{
            color: active ? "var(--accent-orange)" : "var(--text-muted)",
            background: active ? "rgba(255, 107, 53, 0.08)" : "transparent",
            borderBottom: active
              ? "1px solid var(--accent-orange)"
              : "1px solid transparent",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Reports
          {featured?.isFresh && (
            <span
              aria-label="New issue available"
              style={{
                background: "var(--accent-orange)",
                color: "#FFFFFF",
                padding: "1px 6px",
                borderRadius: 2,
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.08em",
                lineHeight: 1.2,
              }}
            >
              NEW
            </span>
          )}
        </Link>
        {featured && (
          <div
            className="reports-nav-dropdown"
            role="menu"
            aria-label="Latest issue"
          >
            <div
              style={{
                width: 320,
                background: "var(--card)",
                border: "1px solid var(--border-bright)",
                borderRadius: 6,
                boxShadow: "0 12px 32px rgba(15, 17, 21, 0.18)",
                overflow: "hidden",
                fontFamily: "JetBrains Mono, monospace",
              }}
            >
              <div
                style={{
                  height: 120,
                  background:
                    "linear-gradient(135deg, #F7F4ED 0%, #1F3A5F 100%)",
                  position: "relative",
                  overflow: "hidden",
                  backgroundImage: `url("${featured.coverImage}"), linear-gradient(135deg, #F7F4ED 0%, #1F3A5F 100%)`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 10,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 9,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#C5511A",
                    fontWeight: 600,
                    background: "rgba(247, 244, 237, 0.92)",
                    padding: "2px 6px",
                    borderRadius: 2,
                  }}
                >
                  Issue {featured.issueLabel} · {fmtMonth(featured.publicationDate)}
                </span>
              </div>
              <div style={{ padding: "12px 14px 14px", display: "grid", gap: 6 }}>
                <p
                  style={{
                    fontFamily: '"Source Serif 4", Georgia, serif',
                    fontWeight: 700,
                    fontSize: 16,
                    lineHeight: 1.2,
                    color: "var(--foreground)",
                    margin: 0,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  {featured.theme}
                </p>
                <p
                  style={{
                    fontFamily: '"Source Serif 4", Georgia, serif',
                    fontStyle: "italic",
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: "var(--text-muted)",
                    margin: 0,
                    textTransform: "none",
                    letterSpacing: 0,
                  }}
                >
                  {featured.tagline}
                </p>
                <Link
                  href={featured.url.replace(/^https?:\/\/[^/]+/, "")}
                  style={{
                    color: "var(--accent-orange)",
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    textDecoration: "none",
                    marginTop: 6,
                  }}
                >
                  Read →
                </Link>
              </div>
            </div>
          </div>
        )}
        <style>{`
          .reports-nav-wrapper .reports-nav-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            padding-top: 8px;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-4px);
            transition: opacity 100ms ease, transform 100ms ease;
            z-index: 40;
          }
          .reports-nav-wrapper:hover .reports-nav-dropdown,
          .reports-nav-wrapper:focus-within .reports-nav-dropdown {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
          }
        `}</style>
      </div>
    )
  }
}
