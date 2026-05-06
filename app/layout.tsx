import type { Metadata } from "next"
import { Suspense } from "react"
import { NavHeader } from "@/components/nav-header"
import { IframePathSync } from "@/components/iframe-path-sync"
import "./globals.css"

export const metadata: Metadata = {
  title: "Lending Intelligence Terminal · Datum Labs",
  description: "Multi-protocol lending analytics: Aave V3, SparkLend, Morpho, Fluid",
  alternates: {
    types: {
      "application/rss+xml": [
        { url: "/reports/feed.xml", title: "State of DeFi Lending — DatumLabs" },
      ],
    },
  },
}

function PageFallback() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 animate-pulse space-y-4">
      <div className="h-4 w-24 bg-card rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-card border border-border rounded" />
        ))}
      </div>
      <div className="h-[340px] bg-card border border-border rounded" />
    </div>
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div
          className="min-h-screen font-mono flex flex-col"
          style={{ background: "var(--background)", color: "var(--foreground)" }}
        >
          <NavHeader />
          <Suspense>
            <IframePathSync />
          </Suspense>
          <main className="flex-1">
            <Suspense fallback={<PageFallback />}>{children}</Suspense>
          </main>

          {/* Status Bar — matches SDK DashboardLayout footer */}
          <div
            className="flex items-center justify-between px-4 lg:px-6 h-7 text-[11px]"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--panel-header)",
              color: "var(--text-muted)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ color: "var(--accent-orange)" }}>&gt;</span>
              <span>datumlab.xyz/lending-terminal</span>
            </div>
            <span>Powered by Datum Labs</span>
          </div>
        </div>
      </body>
    </html>
  )
}
