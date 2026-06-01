/**
 * Root-level OG image (1200×630) for the Lending Intelligence Terminal.
 *
 * Visual family: matches the existing report-issue OG at
 * `app/reports/[slug]/opengraph-image.tsx` — deep navy base, cream type,
 * burnt-orange accent, serif title with an italic accent line, two-panel
 * layout. This is the DatumLabs publishing identity; the Terminal sits in
 * the same visual world as the reports rather than looking like a
 * third-party dashboard preview.
 *
 * Designed to be deliberately distinct from the Blockworks dashboard OG
 * family (centered sans-serif over an indigo radial bloom). Different
 * palette, alignment, typography, and structure.
 *
 * Portable to other Datum Labs dashboards by editing the BRAND block. The
 * right-panel stat (here: "06 / VENUES TRACKED") is the per-dashboard
 * proof-point — Morpho Research Terminal might show "{N} / CHAINS" or
 * "{N} / CURATORS", etc.
 *
 * Static — no DB / API. OG crawlers cache the rendered PNG for days, so
 * dynamic numbers would be misleading.
 */
import { ImageResponse } from "next/og"

export const alt = "Lending Terminal · Datum Labs Research"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const runtime = "edge"

// ─── Palette (mirrors the report OG so the family reads as one product) ──
const NAVY = "#0E1B2C"
const CREAM = "#F7F4ED"
const ORANGE = "#C5511A"
const SUBTLE_NAVY_TINT = "rgba(31, 58, 95, 0.40)"
const CREAM_55 = "rgba(247, 244, 237, 0.55)"
const CREAM_70 = "rgba(247, 244, 237, 0.70)"
const HAIRLINE = "rgba(247, 244, 237, 0.15)"

// ─── Brand block — to port to another dashboard, edit this block ─────────
const EYEBROW = "DatumLabs Research"
const SUB_EYEBROW = "Live Terminal · Multi-protocol intelligence for Ethereum lending"
const TITLE_LINES = ["Lending", "Terminal"] // stacked serif headline
const ITALIC_ACCENT = "TVL, rates, flows, and risk across the major venues."
const FOOTER_URL = "datumlab.xyz/lending-terminal"
const FOOTER_VENUES = "AAVE V3 · SPARK · MORPHO · FLUID · COMPOUND · EULER"
const STAT_NUMBER = "06"
const STAT_LABEL_1 = "Venues"
const STAT_LABEL_2 = "Tracked"

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          background: NAVY,
          color: CREAM,
          fontFamily: '"serif"',
        }}
      >
        {/* ─── Left panel — content ─────────────────────────────────────── */}
        <div
          style={{
            flex: 1.4,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px 0 60px 70px",
          }}
        >
          {/* Top stack: eyebrows + title + italic accent */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Eyebrow row — orange bullet + small-caps label */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  background: ORANGE,
                  borderRadius: "50%",
                }}
              />
              <span
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 13,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: ORANGE,
                  fontWeight: 500,
                }}
              >
                {EYEBROW}
              </span>
            </div>

            {/* Sub-eyebrow — muted small-caps */}
            <span
              style={{
                fontFamily: "sans-serif",
                fontSize: 12,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: CREAM_55,
                fontWeight: 500,
                maxWidth: 600,
                lineHeight: 1.4,
              }}
            >
              {SUB_EYEBROW}
            </span>

            {/* Serif headline — two stacked lines */}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {TITLE_LINES.map((line) => (
                <div
                  key={line}
                  style={{
                    fontSize: 96,
                    fontWeight: 700,
                    lineHeight: 1.02,
                    letterSpacing: "-0.022em",
                    color: CREAM,
                    display: "flex",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>

            {/* Italic orange accent — the tagline */}
            <div
              style={{
                fontSize: 26,
                lineHeight: 1.28,
                fontStyle: "italic",
                fontWeight: 400,
                color: ORANGE,
                marginTop: 12,
                maxWidth: 620,
                display: "flex",
              }}
            >
              {ITALIC_ACCENT}
            </div>
          </div>

          {/* Footer — URL on the left, venues list on the right, both in
              small-caps mono-feel sans-serif so they sit clearly under the
              serif headline without competing with it. */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 22,
              borderTop: `1px solid ${HAIRLINE}`,
              fontFamily: "sans-serif",
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: CREAM_70,
              gap: 24,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: ORANGE, fontWeight: 700 }}>&gt;</span>
              <span style={{ color: CREAM }}>{FOOTER_URL}</span>
            </span>
            <span>{FOOTER_VENUES}</span>
          </div>
        </div>

        {/* ─── Right panel — stat marker over subtle gradient ───────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(135deg, ${SUBTLE_NAVY_TINT} 0%, rgba(14, 27, 44, 0) 100%)`,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 196,
                fontWeight: 700,
                color: ORANGE,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                display: "flex",
              }}
            >
              {STAT_NUMBER}
            </div>
            <div
              style={{
                fontFamily: "sans-serif",
                fontSize: 14,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: CREAM_70,
                marginTop: 6,
                display: "flex",
              }}
            >
              {STAT_LABEL_1}
            </div>
            <div
              style={{
                fontFamily: "sans-serif",
                fontSize: 14,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: CREAM_70,
                display: "flex",
              }}
            >
              {STAT_LABEL_2}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
