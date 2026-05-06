/**
 * Issue page hero — full-bleed top-of-page block.
 *
 * Behavior:
 *  - Cover image as background when frontmatter.cover_image resolves to a
 *    real public asset; falls back to a brand-coordinated gradient when
 *    it doesn't (e.g. before the cover-render script has run for a new
 *    issue).
 *  - Title in serif, with the "of" pulled out as italic + brand color
 *    to match the cover art.
 *  - Issue label, date, theme, tagline, reading-time, "Subscribe / Cite /
 *    Download" affordances — all sized as a magazine cover, not a
 *    web header.
 *
 * Server component — receives the parsed frontmatter as props from the
 * route's MDX components map (route binds via closure).
 */
import path from "node:path"
import { promises as fs } from "node:fs"
import type { IssueFrontmatter } from "@/lib/reports/types"

interface Props {
  issue: IssueFrontmatter
  /** Anchor id used by the "Cite this issue" link in the hero. */
  citeAnchor?: string
}

async function coverImageAvailable(coverPath: string): Promise<boolean> {
  if (!coverPath || !coverPath.startsWith("/")) return false
  const abs = path.join(process.cwd(), "public", coverPath.replace(/^\//, ""))
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}

/** Pulls out the word "of" as a serif-italic accent, matching the cover. */
function styleTitle(title: string) {
  // Split on " of " (case-insensitive) preserving the literal "of".
  const m = title.match(/^(.*?)\s+(of)\s+(.*)$/i)
  if (!m) return <>{title}</>
  return (
    <>
      {m[1]}{" "}
      <span
        style={{
          fontStyle: "italic",
          fontWeight: 400,
          color: "var(--report-brand)",
        }}
      >
        {m[2]}
      </span>{" "}
      {m[3]}
    </>
  )
}

export async function Hero({ issue, citeAnchor = "cite-this-issue" }: Props) {
  const hasCover = await coverImageAvailable(issue.cover_image)

  return (
    <header
      className="report-hero"
      aria-labelledby="issue-title"
      style={{
        position: "relative",
        // Break out of the prose grid by spanning all columns.
        gridColumn: "1 / -1",
        marginTop: "-32px", // overlap the route's paddingTop
        padding: 0,
        minHeight: 480,
        overflow: "hidden",
        background: hasCover
          ? `linear-gradient(180deg, rgba(247,244,237,0) 0%, rgba(247,244,237,0) 55%, rgba(14,27,44,0.55) 100%), url("${issue.cover_image}")`
          : "linear-gradient(135deg, var(--report-bg) 0%, rgba(31, 58, 95, 0.08) 100%)",
        backgroundSize: hasCover ? "cover, cover" : undefined,
        backgroundPosition: hasCover ? "center, center" : undefined,
        borderBottom: "1px solid var(--report-border)",
      }}
    >
      {/* Top accent rail — matches the print cover */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background:
            "linear-gradient(90deg, var(--report-brand) 0%, var(--report-brand) 60%, var(--report-accent) 60%, var(--report-accent) 100%)",
        }}
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "56px 32px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
          minHeight: 480,
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 12,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span>DatumLabs Research · Monthly Sector Brief</span>
          <span style={{ color: "var(--report-text-muted)" }}>
            Issue {issue.issue_label} · {new Date(issue.date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
          </span>
        </div>

        {/* Title block — pushed toward the bottom of the hero */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 20 }}>
          <h1
            id="issue-title"
            style={{
              fontFamily: "var(--report-font-serif)",
              fontWeight: 700,
              fontSize: "clamp(40px, 6vw, 72px)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--report-text)",
              margin: 0,
              maxWidth: 920,
            }}
          >
            {styleTitle(issue.title)}
          </h1>
          <div
            aria-hidden="true"
            style={{
              width: 80,
              height: 4,
              background: "var(--report-accent)",
            }}
          />
          <p
            style={{
              fontFamily: "var(--report-font-serif)",
              fontStyle: "italic",
              fontSize: "clamp(22px, 2.6vw, 32px)",
              lineHeight: 1.25,
              color: "var(--report-brand)",
              margin: 0,
              maxWidth: 720,
            }}
          >
            {issue.theme}
          </p>
          <p
            style={{
              fontFamily: "var(--report-font-serif)",
              fontSize: 18,
              lineHeight: 1.55,
              color: "var(--report-text-muted)",
              margin: 0,
              maxWidth: 720,
            }}
          >
            {issue.tagline}
          </p>
        </div>

        {/* Footer — protocols + reading time + nav links */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
            paddingTop: 20,
            borderTop: "1px solid var(--report-border)",
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--report-text-muted)",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {issue.protocols.map((p) => (
              <span
                key={p}
                style={{
                  padding: "4px 10px",
                  border: "1px solid var(--report-brand)",
                  borderRadius: 999,
                  color: "var(--report-brand)",
                  fontWeight: 500,
                }}
              >
                {p}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <span>{issue.reading_time_min} min read</span>
            <span aria-hidden="true">·</span>
            <a
              href={`#${citeAnchor}`}
              style={{
                color: "var(--report-text-muted)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Cite this issue
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
