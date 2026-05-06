/**
 * Stub components for the /reports section.
 *
 * Every MDX-callable component the spec describes lives here as a minimal
 * placeholder. Each stub is replaced by a real implementation in later
 * commits; the MDX file renders end-to-end after every commit, just with
 * progressively better visual treatment.
 *
 * Replacement schedule:
 *  - Commit 2: SectionHeading, Lead, PullQuote, DataTable, Annotation,
 *              MethodologyNote
 *  - Commit 3-4: Chart
 *  - Commit 5: TOC, ProgressBar, ShareToolbar (added in their own files)
 *  - Commit 6: Hero, NextIssue, NewsletterSignup, CiteWidget
 *
 * As components graduate to real files under components/report/<Name>.tsx,
 * the corresponding stub here gets removed and the route's `components`
 * map points at the real file.
 */
import type { ReactNode } from "react"
import type { IssueFrontmatter } from "@/lib/reports/types"

/**
 * Stubs that need frontmatter (Hero, CiteWidget) accept it via props.
 * The route binds the frontmatter into the components map by closure so
 * each stub stays a server component — no client-context plumbing
 * required just to read frontmatter.
 */

// ─── Hero ────────────────────────────────────────────────────────────────
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

// ─── SectionHeading ──────────────────────────────────────────────────────
export function SectionHeadingStub({
  number,
  children,
}: {
  number?: string
  children: ReactNode
}) {
  return (
    <h2
      style={{
        fontFamily: "var(--report-font-serif)",
        fontWeight: 700,
        fontSize: "32px",
        lineHeight: 1.15,
        marginTop: "80px",
        marginBottom: "20px",
      }}
    >
      {number != null && (
        <span
          className="report-numeric"
          style={{
            fontSize: "12px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
            display: "block",
            marginBottom: "10px",
            fontWeight: 500,
          }}
        >
          § {number}
        </span>
      )}
      {children}
    </h2>
  )
}

// ─── Lead ────────────────────────────────────────────────────────────────
export function LeadStub({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "var(--report-font-serif)",
        fontSize: "var(--report-lead-size)",
        lineHeight: 1.55,
        marginBottom: "1.4em",
        color: "var(--report-text)",
      }}
    >
      {children}
    </p>
  )
}

// ─── PullQuote ───────────────────────────────────────────────────────────
export function PullQuoteStub({ children }: { children: ReactNode }) {
  return (
    <blockquote
      style={{
        fontFamily: "var(--report-font-serif)",
        fontStyle: "italic",
        fontSize: "28px",
        lineHeight: 1.35,
        color: "var(--report-text)",
        borderLeft: "4px solid var(--report-accent)",
        paddingLeft: "24px",
        margin: "2em 0",
      }}
    >
      {children}
    </blockquote>
  )
}

// ─── DataTable ───────────────────────────────────────────────────────────
interface DataTableColumn {
  key: string
  label: string
  align?: "left" | "right"
  sortable?: boolean
}

interface DataTableProps {
  caption?: string
  columns: DataTableColumn[]
  rows: Array<Record<string, string | number>>
  source_label?: string
}

export function DataTableStub({ caption, columns, rows, source_label }: DataTableProps) {
  return (
    <figure style={{ margin: "2em 0" }}>
      {caption && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: "14px",
            color: "var(--report-text-muted)",
            marginBottom: "8px",
          }}
        >
          {caption}
        </figcaption>
      )}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderTop: "2px solid var(--report-accent)",
            borderBottom: "2px solid var(--report-accent)",
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    padding: "10px 12px",
                    fontFamily: "var(--report-font-sans)",
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--report-text-muted)",
                    fontWeight: 600,
                    borderBottom: "1px solid var(--report-border)",
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 1 ? "rgba(31, 58, 95, 0.025)" : undefined,
                }}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      textAlign: c.align ?? "left",
                      padding: "10px 12px",
                      fontFamily:
                        c.align === "right"
                          ? "var(--report-font-mono)"
                          : "var(--report-font-serif)",
                      fontVariantNumeric: c.align === "right" ? "tabular-nums" : undefined,
                      fontSize: "14px",
                    }}
                  >
                    {row[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {source_label && (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            color: "var(--report-text-muted)",
            marginTop: "8px",
            letterSpacing: "0.04em",
          }}
        >
          Source: {source_label}
        </div>
      )}
    </figure>
  )
}

// ─── Annotation ──────────────────────────────────────────────────────────
export function AnnotationStub({ children }: { children: ReactNode }) {
  return (
    <aside
      style={{
        fontFamily: "var(--report-font-sans)",
        fontSize: "14px",
        lineHeight: 1.55,
        color: "var(--report-text-muted)",
        background: "rgba(31, 58, 95, 0.04)",
        borderLeft: "2px solid var(--report-brand)",
        padding: "12px 16px",
        margin: "1.5em 0",
        borderRadius: "0 4px 4px 0",
      }}
      role="note"
    >
      {children}
    </aside>
  )
}

// ─── MethodologyNote ─────────────────────────────────────────────────────
export function MethodologyNoteStub({ children }: { children: ReactNode }) {
  return (
    <details
      style={{
        margin: "3em 0",
        padding: "16px 20px",
        background: "rgba(31, 58, 95, 0.04)",
        borderRadius: "4px",
      }}
    >
      <summary
        style={{
          fontFamily: "var(--report-font-sans)",
          fontWeight: 600,
          fontSize: "13px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--report-brand)",
          cursor: "pointer",
        }}
      >
        Methodology
      </summary>
      <div
        style={{
          marginTop: "16px",
          fontFamily: "var(--report-font-serif)",
          fontSize: "15px",
          lineHeight: 1.6,
          color: "var(--report-text-muted)",
        }}
      >
        {children}
      </div>
    </details>
  )
}

// ─── Chart ───────────────────────────────────────────────────────────────
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

// ─── CiteWidget ──────────────────────────────────────────────────────────
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

// ─── NextIssue ───────────────────────────────────────────────────────────
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
