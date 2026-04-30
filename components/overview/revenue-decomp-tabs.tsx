"use client"

/**
 * Revenue page protocol-tab decomposition — replaces the previous "stack 4
 * RevenueByRecipientCharts vertically" layout with a single chart switched
 * by a protocol-tab row at the top. Cuts the page's vertical scroll roughly
 * in half.
 *
 * URL-synced: `?d=<slug>` (default = first protocol). Permalink-able.
 */

import { useEffect, useState } from "react"
import { RevenueByRecipientChart } from "./revenue-by-recipient-chart"
import type { ProtocolRevenueBreakdown } from "@/lib/revenue-decomp"

interface Props {
  protocols: ProtocolRevenueBreakdown[]
}

const URL_PARAM = "d"

function readUrlSlug(allowed: string[]): string | null {
  if (typeof window === "undefined") return null
  const v = new URLSearchParams(window.location.search).get(URL_PARAM)
  if (v && allowed.includes(v)) return v
  return null
}

function writeUrlSlug(slug: string, defaultSlug: string) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (slug === defaultSlug) url.searchParams.delete(URL_PARAM)
  else url.searchParams.set(URL_PARAM, slug)
  window.history.replaceState(null, "", url.toString())
}

export function RevenueDecompTabs({ protocols }: Props) {
  if (protocols.length === 0) return null
  const slugs = protocols.map((p) => p.slug)
  const initial = slugs[0]
  const [active, setActive] = useState(initial)

  useEffect(() => {
    const fromUrl = readUrlSlug(slugs)
    if (fromUrl && fromUrl !== active) setActive(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pick(slug: string) {
    setActive(slug)
    writeUrlSlug(slug, initial)
  }

  const current = protocols.find((p) => p.slug === active) ?? protocols[0]

  return (
    <div className="space-y-3">
      {/* Tab row */}
      <div
        className="flex flex-wrap items-center gap-1"
        style={{ borderBottom: "1px solid var(--card-border)", paddingBottom: "8px" }}
      >
        {protocols.map((p) => {
          const isActive = p.slug === active
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => pick(p.slug)}
              className="px-3 py-1.5 rounded-t text-[11px] uppercase tracking-[0.1em] transition-colors"
              style={{
                color: isActive ? "var(--accent-orange)" : "var(--text-muted)",
                background: isActive ? "rgba(255, 107, 53, 0.08)" : "transparent",
                borderBottom: isActive
                  ? "2px solid var(--accent-orange)"
                  : "2px solid transparent",
                marginBottom: "-9px",
                cursor: "pointer",
                border: "none",
                borderBottomWidth: "2px",
                borderBottomStyle: "solid",
                borderBottomColor: isActive ? "var(--accent-orange)" : "transparent",
              }}
              aria-pressed={isActive}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active protocol's chart */}
      <RevenueByRecipientChart
        title={`${current.name} · Weekly Revenue`}
        subtitle="Supply-side / Protocol / Holders"
        color={current.color}
        data={current.weekly}
        methodologyKey="revenue-by-recipient"
      />
    </div>
  )
}
