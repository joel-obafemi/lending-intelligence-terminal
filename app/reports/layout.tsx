/**
 * /reports section layout — applies the magazine-style design tokens by
 * scoping the surface under `.reports-page`. The tokens themselves live
 * in app/globals.css (search for the "Reports section" block).
 *
 * The dashboard's NavHeader from the root layout still renders above this
 * (intentionally — the spec section "RSS feed" notes the dashboard chrome
 * can announce the feed to readers). The .reports-page background takes
 * over the visual surface for everything below the nav.
 */
import type { ReactNode } from "react"

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="reports-page" style={{ minHeight: "100%" }}>
      {children}
    </div>
  )
}
