/**
 * End-of-issue navigation — three columns on desktop:
 *   left: previous issue card (cover thumbnail + theme + date)
 *   center: newsletter signup
 *   right: next issue card (or "Next issue arrives [date]" placeholder)
 *
 * Server component: takes the current issue + adjacency from getAllIssues().
 * Receives the resolved prev/next records as props so the route's render
 * stays a single async fetch chain.
 */
import Link from "next/link"
import type { IssueRecord } from "@/lib/reports/types"
import { NewsletterSignup } from "./NewsletterSignup"

interface Props {
  current: IssueRecord
  prev: IssueRecord | null
  next: IssueRecord | null
  /** Optional placeholder text when `next` is null — e.g. "Next issue arrives May 31, 2026". */
  nextPlaceholder?: string
}

interface CardProps {
  direction: "prev" | "next"
  issue: IssueRecord | null
  placeholder?: string
}

function IssueCard({ direction, issue, placeholder }: CardProps) {
  const directionLabel = direction === "prev" ? "Previous" : "Next"
  if (!issue) {
    return (
      <div
        style={{
          padding: 20,
          border: "1px dashed var(--report-border)",
          borderRadius: 4,
          textAlign: direction === "prev" ? "left" : "right",
          color: "var(--report-text-muted)",
          minHeight: 140,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {directionLabel} issue
        </span>
        <span
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: 16,
          }}
        >
          {placeholder ?? "Coming soon."}
        </span>
      </div>
    )
  }

  return (
    <Link
      href={`/reports/${issue.slug}`}
      aria-label={`${directionLabel} issue: ${issue.frontmatter.theme}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 20,
        border: "1px solid var(--report-border)",
        borderRadius: 4,
        textDecoration: "none",
        color: "inherit",
        minHeight: 140,
        textAlign: direction === "prev" ? "left" : "right",
        background: "var(--report-bg)",
        transition: "border-color 100ms ease",
      }}
    >
      <span
        style={{
          fontFamily: "var(--report-font-mono)",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--report-accent)",
        }}
      >
        {direction === "prev" ? "← " : ""}
        {directionLabel} · Issue {issue.frontmatter.issue_label}
        {direction === "next" ? " →" : ""}
      </span>
      <span
        style={{
          fontFamily: "var(--report-font-serif)",
          fontWeight: 600,
          fontSize: 18,
          lineHeight: 1.25,
          color: "var(--report-text)",
        }}
      >
        {issue.frontmatter.theme}
      </span>
      <span
        style={{
          fontFamily: "var(--report-font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--report-text-muted)",
        }}
      >
        {new Date(issue.frontmatter.publication_date).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    </Link>
  )
}

export function NextIssue({ prev, next, nextPlaceholder }: Props) {
  return (
    <nav
      aria-label="Issue navigation"
      style={{
        margin: "4em 0 2em",
        paddingTop: 32,
        borderTop: "1px solid var(--report-border)",
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 24,
      }}
      className="report-next-issue"
    >
      <IssueCard direction="prev" issue={prev} />
      <div
        style={{
          padding: "20px",
          textAlign: "center",
        }}
      >
        <NewsletterSignup />
      </div>
      <IssueCard direction="next" issue={next} placeholder={nextPlaceholder} />
      <style>{`
        @media (min-width: 900px) {
          .report-next-issue {
            grid-template-columns: 1fr 1fr 1fr !important;
            align-items: stretch;
          }
        }
      `}</style>
    </nav>
  )
}
