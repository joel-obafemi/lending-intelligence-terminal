/**
 * /reports archive — placeholder for commit 1.
 *
 * The full archive landing page (latest issue as a hero card, all others
 * as a grid below) lands in commit 8. This placeholder lists every
 * published issue as a simple link list so /reports works end-to-end
 * before then.
 */
import Link from "next/link"
import { getAllIssues } from "@/lib/reports/getAllIssues"

export const dynamic = "force-static"

export const metadata = {
  title: "State of DeFi Lending on Ethereum · DatumLabs Reports",
  description:
    "Monthly research on DeFi lending — Aave V3, Spark, Morpho, Fluid on Ethereum.",
}

export default async function ReportsArchivePage() {
  const issues = await getAllIssues()

  return (
    <main
      className="report-reading-column"
      style={{ paddingTop: "64px", paddingBottom: "96px" }}
    >
      <header style={{ marginBottom: "48px" }}>
        <p
          className="report-numeric"
          style={{
            fontSize: "11px",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
            marginBottom: "12px",
          }}
        >
          DatumLabs Research
        </p>
        <h1
          style={{
            fontFamily: "var(--report-font-serif)",
            fontWeight: 700,
            fontSize: "48px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginBottom: "16px",
          }}
        >
          State of DeFi Lending on Ethereum
        </h1>
        <p
          style={{
            fontFamily: "var(--report-font-serif)",
            fontSize: "18px",
            color: "var(--report-text-muted)",
            lineHeight: 1.5,
          }}
        >
          Monthly research on the four protocols that matter — Aave V3, Spark,
          Morpho, Fluid.
        </p>
      </header>

      {issues.length === 0 ? (
        <p style={{ color: "var(--report-text-muted)" }}>
          No issues published yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {issues.map((issue) => (
            <li
              key={issue.slug}
              style={{
                paddingTop: "24px",
                paddingBottom: "24px",
                borderTop: "1px solid var(--report-border)",
              }}
            >
              <Link
                href={`/reports/${issue.slug}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <p
                  className="report-numeric"
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--report-accent)",
                    marginBottom: "8px",
                  }}
                >
                  Issue {issue.frontmatter.issue_label} ·{" "}
                  {new Date(issue.frontmatter.publication_date).toLocaleDateString(
                    "en-US",
                    { month: "long", day: "numeric", year: "numeric" },
                  )}
                </p>
                <h2
                  style={{
                    fontFamily: "var(--report-font-serif)",
                    fontWeight: 600,
                    fontSize: "28px",
                    lineHeight: 1.2,
                    marginBottom: "8px",
                  }}
                >
                  {issue.frontmatter.theme}
                </h2>
                <p
                  style={{
                    fontFamily: "var(--report-font-serif)",
                    fontSize: "16px",
                    color: "var(--report-text-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {issue.frontmatter.tagline}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
