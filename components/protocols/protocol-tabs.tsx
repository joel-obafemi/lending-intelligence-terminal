"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { PROTOCOLS } from "@/lib/protocols"

/**
 * Tab selector that syncs the active protocol via the `?p=<slug>` query
 * parameter. Uses Link for prefetching so switching tabs feels instant
 * after the first click.
 */
export function ProtocolTabs() {
  const params = useSearchParams()
  const active = params.get("p") ?? PROTOCOLS[0].slug

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      style={{ borderBottom: "1px solid var(--card-border)", paddingBottom: "8px" }}
    >
      {PROTOCOLS.map((p) => {
        const isActive = p.slug === active
        return (
          <Link
            key={p.slug}
            href={`/protocols?p=${p.slug}`}
            prefetch={true}
            className="px-3 py-1.5 rounded-t text-[11px] uppercase tracking-[0.1em] transition-colors"
            style={{
              color: isActive ? "var(--accent-orange)" : "var(--text-muted)",
              background: isActive ? "rgba(255, 107, 53, 0.08)" : "transparent",
              borderBottom: isActive ? "2px solid var(--accent-orange)" : "2px solid transparent",
              marginBottom: "-9px",
            }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
