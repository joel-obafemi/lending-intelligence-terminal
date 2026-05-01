/**
 * Reports Footer — Zone 8 of the Sector Overview rebuild.
 *
 * Latest issue cover (placeholder until /reports ships in Week 3) +
 * <NewsletterSignup /> + <CiteThisPage /> + back-issue thumbnail row.
 *
 * The /reports page itself is the Week 3 deliverable. This footer is the
 * surface area that primes readers to expect a publication cadence and
 * gives them a citation handle today.
 */
import { ArrowRight, BookOpen } from "lucide-react"
import { NewsletterSignup } from "@/components/newsletter-signup"
import { CiteThisPage } from "./cite-this-page"

interface BackIssue {
  id: string
  title: string
  date: string
  blurb: string
}

const PLACEHOLDER_BACK_ISSUES: BackIssue[] = [
  {
    id: "2026-04",
    title: "April: Stables debt share holds at 52%",
    date: "Apr 28, 2026",
    blurb: "Aave V3 utilization pinned at 100%, Fluid liquidations cool.",
  },
  {
    id: "2026-03",
    title: "March: rsETH contagion week",
    date: "Mar 24, 2026",
    blurb: "Aave V3 net outflow of $9.1B, USDT supply −$2.1B in a week.",
  },
  {
    id: "2026-02",
    title: "February: Morpho crosses 17% TVL share",
    date: "Feb 26, 2026",
    blurb: "Vault allocators rotate from Aave shared-liquidity to isolated WEETH markets.",
  },
]

const LATEST_ISSUE = {
  title: "The Lending Pulse · April 2026",
  blurb:
    "Our monthly read of Aave V3, Spark, Morpho and Fluid on Ethereum. Sector TVL, real yield, liquidations, and the events the data flagged.",
  cta: "Read on /reports",
  date: "Issue 4 · Apr 28, 2026",
}

export function ReportsFooter({ pageUrl }: { pageUrl: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        {/* Latest issue cover (placeholder until /reports ships in Week 3) */}
        <a
          href="/reports"
          className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex"
          style={{ textDecoration: "none" }}
        >
          <div
            className="hidden sm:flex items-center justify-center"
            style={{
              width: "120px",
              minHeight: "120px",
              background:
                "linear-gradient(135deg, rgba(255, 107, 53, 0.16), rgba(91, 127, 255, 0.16))",
              borderRight: "1px solid var(--card-border)",
              flexShrink: 0,
            }}
          >
            <BookOpen size={36} strokeWidth={1.25} color="var(--accent-orange)" />
          </div>
          <div className="flex-1 p-4 flex flex-col justify-between gap-3">
            <div>
              <div
                className="text-[10px] uppercase tracking-[0.1em] mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                {LATEST_ISSUE.date}
              </div>
              <div
                className="text-[14px] font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                {LATEST_ISSUE.title}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {LATEST_ISSUE.blurb}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium"
              style={{ color: "var(--accent-orange)" }}
            >
              {LATEST_ISSUE.cta}
              <ArrowRight size={12} strokeWidth={2} />
            </span>
          </div>
        </a>
        <NewsletterSignup />
      </div>
      <CiteThisPage pageTitle="Sector Overview" pageUrl={pageUrl} />
      {/* Back-issue thumbnails */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLACEHOLDER_BACK_ISSUES.map((iss) => (
          <a
            key={iss.id}
            href={`/reports#${iss.id}`}
            className="tui-card bg-card-bg border border-card-border rounded p-3 flex flex-col gap-1"
            style={{ textDecoration: "none" }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.08em]"
              style={{ color: "var(--text-muted)" }}
            >
              {iss.date}
            </div>
            <div
              className="text-[12px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {iss.title}
            </div>
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {iss.blurb}
            </p>
          </a>
        ))}
      </div>
    </div>
  )
}
