/**
 * Per-issue OG image (1200×630) generated at the edge via Next.js's
 * built-in `opengraph-image.tsx` convention.
 *
 * Renders a server-side <img>-equivalent of the print social card:
 *   - Deep navy background, brand gradient panel on the right
 *   - Brand mark + DatumLabs Research eyebrow
 *   - Issue title with italic "of" accent
 *   - Theme tagline in burnt orange
 *   - Issue label + protocol byline footer
 *
 * Approach: pure JSX composed via ImageResponse. No external deps
 * required — Next bundles satori under the hood. The route picks up
 * the issue's frontmatter via getIssueBySlug.
 */
import { ImageResponse } from "next/og"
import { getIssueBySlug } from "@/lib/reports/getIssueBySlug"

export const alt = "DatumLabs · State of DeFi Lending on Ethereum"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OgImage({ params }: { params: { slug: string } }) {
  const issue = await getIssueBySlug(params.slug)
  if (!issue) {
    // Fallback OG image when the slug doesn't resolve. Keeps the route
    // valid even if a stale link is shared.
    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0E1B2C",
            color: "#F7F4ED",
            fontFamily: "serif",
            fontSize: 36,
          }}
        >
          DatumLabs Research
        </div>
      ),
      { ...size },
    )
  }
  const fm = issue.frontmatter

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          background: "#0E1B2C",
          color: "#F7F4ED",
          fontFamily: '"serif"',
        }}
      >
        {/* Left panel — brand + title */}
        <div
          style={{
            flex: 1.4,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px 0 60px 70px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  background: "#C5511A",
                  borderRadius: "50%",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#C5511A",
                  fontWeight: 500,
                }}
              >
                DatumLabs Research
              </span>
            </div>
            <span
              style={{
                fontSize: 12,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "rgba(247, 244, 237, 0.55)",
                fontWeight: 500,
              }}
            >
              Monthly Sector Brief ·{" "}
              {new Date(fm.date).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </span>
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                lineHeight: 1.0,
                letterSpacing: "-0.015em",
                color: "#F7F4ED",
                marginTop: 4,
                display: "flex",
                flexWrap: "wrap",
              }}
            >
              {fm.title}
            </div>
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.2,
                fontStyle: "italic",
                fontWeight: 400,
                color: "#C5511A",
                marginTop: 20,
              }}
            >
              {fm.theme}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 24,
              borderTop: "1px solid rgba(247, 244, 237, 0.15)",
              fontSize: 14,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(247, 244, 237, 0.7)",
            }}
          >
            <span>
              Issue{" "}
              <span style={{ color: "#F7F4ED", fontWeight: 600 }}>
                {fm.issue_label}
              </span>
            </span>
            <span>{fm.protocols.join(" · ")}</span>
          </div>
        </div>

        {/* Right panel — gradient + accent mark */}
        <div
          style={{
            flex: 1,
            position: "relative",
            display: "flex",
            background:
              "linear-gradient(135deg, rgba(31, 58, 95, 0.40) 0%, rgba(14, 27, 44, 0.0) 100%)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 90,
                fontWeight: 700,
                color: "#C5511A",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {fm.issue_label}
            </div>
            <div
              style={{
                fontSize: 13,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(247, 244, 237, 0.7)",
              }}
            >
              {fm.reading_time_min} min read
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
