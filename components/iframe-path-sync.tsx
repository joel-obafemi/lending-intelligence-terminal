"use client"

/**
 * IframePathSync — broadcasts the current pathname + search to the parent
 * window (the Datum Labs site that frames us) on every route change.
 *
 * Why: when this dashboard is iframed at `datumlab.xyz/lending-terminal/*`,
 * the parent owns the URL bar. Without this, refreshing the parent
 * re-mounts the iframe at its bare `src` and the user loses their place
 * (e.g. ends up back at Overview after refreshing on Protocols).
 *
 * The parent listens for our messages and mirrors the path into its URL
 * via `history.replaceState`, so reload now lands back on the same page.
 *
 * Mounted once globally in `app/layout.tsx`. Inert when not iframed
 * (top window) — the message just bounces and is ignored.
 */
import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

const MESSAGE_SOURCE = "datumlabs-lending-terminal"

export function IframePathSync() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.parent === window) return  // Not iframed — nothing to do
    const search = searchParams.toString()
    const fullPath = search ? `${pathname}?${search}` : pathname
    // We don't know the parent's exact origin (datumlab.xyz vs Vercel
    // preview URL), so we post to "*" and let the parent verify it's
    // hearing from our origin. The payload is a plain object — no auth
    // material — so this is safe.
    window.parent.postMessage(
      { source: MESSAGE_SOURCE, type: "path-change", path: fullPath },
      "*",
    )
  }, [pathname, searchParams])

  return null
}
