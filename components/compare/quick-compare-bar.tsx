"use client"

/**
 * QuickCompareBar — Zone 1 of the Compare page.
 *
 * A persistent horizontal bar at the top with three controls:
 *   - Asset selector (dropdown across MAJOR_ASSETS)
 *   - View toggle (Yields · Parameters · Capital Efficiency)
 *   - Copy-link button that captures the current query string
 *
 * Updates run through `useRouter().replace()` so the page re-fetches with
 * the new asset / view. The page is server-rendered (force-dynamic), so
 * the rest of the layout reflects the new selection on the next render.
 */

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { ChevronDown, Link as LinkIcon, Check } from "lucide-react"
import { COMPARE_ASSETS, type CompareView } from "@/lib/compare"

const VIEWS: Array<{ key: CompareView; label: string }> = [
  { key: "yields", label: "Yields" },
  { key: "parameters", label: "Parameters" },
  { key: "efficiency", label: "Capital Efficiency" },
]

interface Props {
  asset: string
  view: CompareView
}

export function QuickCompareBar({ asset, view }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [copied, setCopied] = useState(false)

  function pushParams(next: { asset?: string; view?: CompareView }) {
    const sp = new URLSearchParams(params.toString())
    if (next.asset !== undefined) sp.set("asset", next.asset)
    if (next.view !== undefined) {
      if (next.view === "yields") sp.delete("view")
      else sp.set("view", next.view)
    }
    const qs = sp.toString()
    router.replace(qs ? `/compare?${qs}` : "/compare", { scroll: false })
  }

  function handleCopy() {
    if (typeof window === "undefined" || !navigator.clipboard) return
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div
      className="tui-card bg-card-bg border border-card-border rounded p-3 flex flex-wrap items-center gap-3"
      style={{ borderLeft: `2px solid var(--accent-orange)` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
          Asset
        </span>
        <div style={{ position: "relative" }}>
          <select
            value={asset}
            onChange={(e) => pushParams({ asset: e.target.value })}
            style={{
              appearance: "none",
              padding: "5px 26px 5px 10px",
              fontSize: "12px",
              fontFamily: "inherit",
              fontWeight: 600,
              border: "1px solid var(--card-border)",
              borderRadius: "4px",
              background: "var(--background)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {COMPARE_ASSETS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            strokeWidth={2}
            style={{
              position: "absolute",
              right: "8px",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: "var(--text-muted)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "inline-flex",
          border: "1px solid var(--card-border)",
          borderRadius: "4px",
          overflow: "hidden",
          background: "var(--background)",
        }}
      >
        {VIEWS.map((v) => {
          const active = view === v.key
          return (
            <button
              key={v.key}
              onClick={() => pushParams({ view: v.key })}
              style={{
                padding: "5px 12px",
                fontSize: "11px",
                fontWeight: 500,
                cursor: "pointer",
                border: "none",
                fontFamily: "inherit",
                backgroundColor: active ? "var(--card-border)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {v.label}
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em]"
          style={{
            padding: "5px 10px",
            border: "1px solid var(--card-border)",
            borderRadius: "4px",
            background: "var(--background)",
            color: copied ? "var(--success)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          {copied ? (
            <>
              <Check size={11} strokeWidth={2.5} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <LinkIcon size={11} strokeWidth={2.25} />
              <span>Copy link</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
