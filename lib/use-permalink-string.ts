"use client"

/**
 * usePermalinkString — same shape as `usePermalinkRange`, but for arbitrary
 * string values (Compare page's asset selector + view toggle).
 *
 * Usage:
 *   const [asset, setAsset] = usePermalinkString("asset", "USDC")
 *   const [view, setView] = usePermalinkString<CompareView>("view", "yields")
 *
 * Reads the URL on mount, writes via `history.replaceState` on every change,
 * and elides the default value so shared URLs stay tidy. Set the `allow`
 * option to constrain accepted values; anything outside the set falls back
 * to the default. Without `allow`, any non-empty string is accepted.
 */
import { useEffect, useState } from "react"

interface Options<T extends string> {
  /** When set, only these values are accepted from the URL. Anything else
   *  decays to `defaultValue`. */
  allow?: readonly T[]
}

function readFromUrl(paramKey: string): string | undefined {
  if (typeof window === "undefined") return undefined
  const sp = new URLSearchParams(window.location.search)
  return sp.get(paramKey) ?? undefined
}

function writeToUrl(paramKey: string, value: string, defaultValue: string) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (value === defaultValue) {
    url.searchParams.delete(paramKey)
  } else {
    url.searchParams.set(paramKey, value)
  }
  window.history.replaceState(null, "", url.toString())
}

export function usePermalinkString<T extends string>(
  paramKey: string,
  defaultValue: T,
  opts: Options<T> = {},
): [T, (next: T) => void] {
  const { allow } = opts
  const [value, setValue] = useState<T>(defaultValue)

  useEffect(() => {
    const raw = readFromUrl(paramKey)
    if (!raw) return
    if (allow && !allow.includes(raw as T)) return
    if (raw !== value) setValue(raw as T)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey])

  function setAndSync(next: T) {
    setValue(next)
    writeToUrl(paramKey, next, defaultValue)
  }

  return [value, setAndSync]
}
