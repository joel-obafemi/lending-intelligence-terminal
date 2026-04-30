"use client"

/**
 * Rates page asset-selector chart — one chart at a time, switchable via a
 * chip row. Replaces the previous "stack 5 charts vertically" layout that
 * blew the page out to ~2000px.
 *
 * URL-synced: `?asset=USDC` (default = USDC). Permalink-able.
 */

import { useEffect, useState } from "react"
import { RateHistoryChart } from "./rate-history-chart"
import type { RateHistoryPoint } from "@/lib/rates"
import type { FredPoint } from "@/lib/fred"

interface Props {
  assets: string[]
  /** Map of asset symbol → history series. Symbols with empty / missing
   *  series are still listed but the chip is disabled. */
  historyByAsset: Record<string, RateHistoryPoint[]>
  fedFunds: FredPoint[]
}

const DEFAULT_ASSET = "USDC"
const URL_PARAM = "asset"

function readUrlAsset(allowed: string[]): string | null {
  if (typeof window === "undefined") return null
  const v = new URLSearchParams(window.location.search).get(URL_PARAM)
  if (v && allowed.includes(v)) return v
  return null
}

function writeUrlAsset(asset: string, defaultAsset: string) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (asset === defaultAsset) url.searchParams.delete(URL_PARAM)
  else url.searchParams.set(URL_PARAM, asset)
  window.history.replaceState(null, "", url.toString())
}

export function RateHistorySelector({ assets, historyByAsset, fedFunds }: Props) {
  // Filter to assets that have data — disabled chips for the rest would be
  // noise on first load. If nothing has data, render the parent's empty
  // case instead of an empty chart.
  const populated = assets.filter((sym) => (historyByAsset[sym] ?? []).length > 0)
  const fallback = populated[0] ?? assets[0] ?? DEFAULT_ASSET
  const initial = populated.includes(DEFAULT_ASSET) ? DEFAULT_ASSET : fallback

  const [active, setActive] = useState<string>(initial)

  // Apply URL state on mount (after hydration to avoid SSR mismatch).
  useEffect(() => {
    const fromUrl = readUrlAsset(populated)
    if (fromUrl && fromUrl !== active) setActive(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pick(sym: string) {
    setActive(sym)
    writeUrlAsset(sym, initial)
  }

  if (populated.length === 0) {
    return (
      <div
        className="tui-card bg-card-bg border border-card-border rounded p-6 text-[11px] text-center"
        style={{ color: "var(--text-muted)" }}
      >
        No supply APY history available right now.
      </div>
    )
  }

  const series = historyByAsset[active] ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[10px] uppercase tracking-[0.1em]"
          style={{ color: "var(--text-muted)" }}
        >
          Asset
        </span>
        {assets.map((sym) => {
          const hasData = (historyByAsset[sym] ?? []).length > 0
          const isActive = sym === active
          return (
            <button
              key={sym}
              type="button"
              disabled={!hasData}
              onClick={() => pick(sym)}
              className="px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                color: isActive ? "var(--accent-orange)" : "var(--text-muted)",
                background: isActive
                  ? "rgba(255, 107, 53, 0.1)"
                  : "transparent",
                border: `1px solid ${isActive ? "var(--accent-orange)" : "var(--card-border)"}`,
                cursor: hasData ? "pointer" : "not-allowed",
              }}
              aria-pressed={isActive}
            >
              {sym}
            </button>
          )
        })}
      </div>
      <RateHistoryChart
        title={`${active} · Supply APY vs Fed Funds`}
        data={series}
        fedFunds={fedFunds}
        methodologyKey="rate-history"
      />
    </div>
  )
}
