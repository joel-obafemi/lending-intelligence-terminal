"use client"

/**
 * usePermalinkRange — drop-in replacement for `useState<TimeRange>` that
 * syncs the chart's selected time range to a URL query parameter, so the
 * chart's W / M / Q / All state survives a page reload and can be linked.
 *
 * Usage:
 *   const [range, setRange] = usePermalinkRange("tvl", 30)
 *
 * The first arg is the URL query key (omit it / pass undefined to opt out
 * of URL sync — behaves like plain `useState` in that case). Multiple
 * charts on the same page need distinct keys.
 *
 * Encoding: numeric TimeRange is mapped to short letters in the URL —
 * `?tvl=W` (7), `tvl=M` (30), `tvl=Q` (90), `tvl=All` (0). On hydration
 * the URL value wins; on update we use `history.replaceState` so the
 * back-button history doesn't fill with every toggle click.
 */
import { useEffect, useState } from "react"
import type { TimeRange } from "@/components/time-toggle"

const ENCODE: Record<TimeRange, string> = {
  7: "W",
  30: "M",
  90: "Q",
  365: "Y",
  0: "All",
}
const DECODE: Record<string, TimeRange> = {
  W: 7,
  M: 30,
  Q: 90,
  Y: 365,
  All: 0,
  "7": 7,
  "30": 30,
  "90": 90,
  "365": 365,
  "0": 0,
}

function readFromUrl(paramKey: string): TimeRange | undefined {
  if (typeof window === "undefined") return undefined
  const sp = new URLSearchParams(window.location.search)
  const raw = sp.get(paramKey)
  if (!raw) return undefined
  return DECODE[raw]
}

function writeToUrl(paramKey: string, value: TimeRange, defaultValue: TimeRange) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (value === defaultValue) {
    // Don't pollute the URL with the default — keep it clean for sharing.
    url.searchParams.delete(paramKey)
  } else {
    url.searchParams.set(paramKey, ENCODE[value])
  }
  // replaceState (not pushState) — toggling W/M/Q shouldn't add history entries.
  window.history.replaceState(null, "", url.toString())
}

export function usePermalinkRange(
  paramKey: string | undefined,
  defaultRange: TimeRange,
): [TimeRange, (next: TimeRange) => void] {
  const [range, setRange] = useState<TimeRange>(defaultRange)

  // On mount (client-only), read the URL value if present. We do this in
  // useEffect rather than the initial useState callback so SSR'd output
  // matches the default — avoids hydration mismatch warnings.
  useEffect(() => {
    if (!paramKey) return
    const fromUrl = readFromUrl(paramKey)
    if (fromUrl != null && fromUrl !== range) setRange(fromUrl)
    // We deliberately only run this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey])

  function setAndSync(next: TimeRange) {
    setRange(next)
    if (paramKey) writeToUrl(paramKey, next, defaultRange)
  }

  return [range, setAndSync]
}
