"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

/**
 * Top navigation bar for the Lending Intelligence Terminal.
 *
 * Mirrors the `DashboardLayout` chrome from `@datumlabs/dashboard-kit` so the
 * terminal stays visually consistent with other DatumLabs dashboards (the
 * Datum Labs icon on the left, terminal title, nav links, CONNECTED status).
 *
 * Light-mode only — the SDK theme is light-only and we follow.
 */

const DASHBOARD_TITLE = "Lending Intelligence Terminal"

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/protocols", label: "Protocols" },
  { href: "/rates", label: "Rates" },
  { href: "/revenue", label: "Revenue" },
  { href: "/collateral", label: "Collateral" },
  { href: "/events", label: "Events" },
]

export function NavHeader() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)

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
          return (
            <Link
              key={item.href}
              href={item.href}
              className="px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] rounded whitespace-nowrap transition-colors"
              style={{
                color: active ? "var(--accent-orange)" : "var(--text-muted)",
                background: active ? "rgba(255, 107, 53, 0.08)" : "transparent",
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </>
  )
}
