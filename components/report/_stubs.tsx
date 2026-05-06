/**
 * Remaining stub components for the /reports section.
 *
 * Replacement schedule:
 *  - Commit 2: SectionHeading, Lead, PullQuote, DataTable, Annotation,
 *              MethodologyNote ✓ (graduated to own files)
 *  - Commit 3-4: Chart
 *  - Commit 5: TOC, ProgressBar, ShareToolbar (added in their own files)
 *  - Commit 6: Hero, NextIssue, NewsletterSignup, CiteWidget
 *
 * As components graduate to real files under components/report/<Name>.tsx,
 * the corresponding stub here gets removed and the route's `components`
 * map points at the real file.
 */
import type { IssueFrontmatter } from "@/lib/reports/types"

// ─── Hero (commit 6) ─────────────────────────────────────────────────────
export function HeroStub({ issue }: { issue: IssueFrontmatter }) {
  return (
    <header
      className="report-hero-stub"
      style={{
        padding: "48px 24px 24px",
        borderBottom: "1px solid var(--report-border)",
        marginBottom: "32px",
      }}
    >
      <div
        className="report-numeric"
        style={{
          fontSize: "11px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--report-accent)",
          marginBottom: "16px",
        }}
      >
        Issue {issue.issue_label} · {issue.date}
      </div>
      <h1
        style={{
          fontFamily: "var(--report-font-serif)",
          fontWeight: 700,
          fontSize: "56px",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          marginBottom: "16px",
        }}
      >
        {issue.title}
      </h1>
      <p
        style={{
          fontFamily: "var(--report-font-serif)",
          fontStyle: "italic",
          fontSize: "24px",
          color: "var(--report-brand)",
          lineHeight: 1.3,
          marginBottom: "12px",
        }}
      >
        {issue.theme}
      </p>
      <p
        style={{
          fontFamily: "var(--report-font-serif)",
          fontSize: "18px",
          color: "var(--report-text-muted)",
          lineHeight: 1.5,
          marginBottom: "16px",
          maxWidth: "720px",
        }}
      >
        {issue.tagline}
      </p>
      <div
        className="report-numeric"
        style={{
          fontSize: "11px",
          letterSpacing: "0.08em",
          color: "var(--report-text-muted)",
          textTransform: "uppercase",
        }}
      >
        {issue.reading_time_min} min read · Snapshot {issue.date}
      </div>
    </header>
  )
}

// ─── Chart (commit 3-4) ──────────────────────────────────────────────────
interface ChartStubProps {
  source: string
  range?: string
  asset?: string
  protocol?: string
  caption?: string
  source_label?: string
  height?: number
  view?: string
  metric?: string
  annotations?: Array<{ date: string; label: string; color?: string }>
}

export function ChartStub({
  source,
  caption,
  source_label,
  height = 360,
  asset,
  protocol,
  range,
}: ChartStubProps) {
  const subtitle = [protocol, asset, range].filter(Boolean).join(" · ")
  return (
    <figure style={{ margin: "2em 0" }}>
      <div
        role="img"
        aria-label={`Chart placeholder for ${source}${subtitle ? ` (${subtitle})` : ""}`}
        style={{
          height,
          background: "rgba(31, 58, 95, 0.04)",
          border: "1px dashed var(--report-border)",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          color: "var(--report-text-muted)",
        }}
      >
        <span
          className="report-numeric"
          style={{
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Chart · {source}
        </span>
        {subtitle && (
          <span
            className="report-numeric"
            style={{ fontSize: "11px", letterSpacing: "0.06em" }}
          >
            {subtitle}
          </span>
        )}
      </div>
      {caption && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: "14px",
            color: "var(--report-text-muted)",
            marginTop: "10px",
          }}
        >
          {caption}
        </figcaption>
      )}
      {source_label && (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            color: "var(--report-text-muted)",
            marginTop: "4px",
            letterSpacing: "0.04em",
          }}
        >
          Source: {source_label}
        </div>
      )}
    </figure>
  )
}

// ─── CiteWidget (commit 6) ───────────────────────────────────────────────
export function CiteWidgetStub({ issue }: { issue: IssueFrontmatter }) {
  return (
    <section
      style={{
        margin: "4em 0 2em",
        padding: "20px",
        border: "1px solid var(--report-border)",
        borderRadius: "4px",
      }}
      aria-labelledby="cite-this-issue"
    >
      <h3
        id="cite-this-issue"
        style={{
          fontFamily: "var(--report-font-sans)",
          fontWeight: 600,
          fontSize: "12px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--report-brand)",
          marginBottom: "8px",
        }}
      >
        Cite this issue
      </h3>
      <p
        style={{
          fontFamily: "var(--report-font-serif)",
          fontSize: "14px",
          color: "var(--report-text-muted)",
          lineHeight: 1.6,
        }}
      >
        DatumLabs. ({new Date(issue.publication_date).getFullYear()}). {issue.title}, Issue {issue.issue_label}.
      </p>
    </section>
  )
}

// ─── NextIssue (commit 6) ────────────────────────────────────────────────
export function NextIssueStub() {
  return (
    <section
      style={{
        margin: "4em 0",
        padding: "32px 20px",
        textAlign: "center",
        borderTop: "1px solid var(--report-border)",
      }}
      aria-label="Next issue"
    >
      <p
        style={{
          fontFamily: "var(--report-font-sans)",
          fontSize: "12px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--report-text-muted)",
        }}
      >
        Next issue arrives at the end of May 2026.
      </p>
    </section>
  )
}
