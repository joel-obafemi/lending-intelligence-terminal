/**
 * Root-level OG image (1200×630) for the Lending Intelligence Terminal.
 *
 * Visual reference: Blockworks Research dashboards (Kamino, RWA Lending) —
 * dark base + indigo radial glow + centered "brand pill / hero title / by-
 * line" stack + small dark identifier tab in the bottom-left. The same
 * layout is intended to be reused across other Datum Labs dashboards by
 * swapping the constants in the BRAND block below.
 *
 * Why this design, not the earlier protocol-chip card:
 *   - Stops at the eye level a reader uses on X. Title + brand + one
 *     line — that's the whole card.
 *   - Holds up identically across products (Lending Terminal, Morpho
 *     Research Terminal, future dashboards). Only the title changes.
 *   - Reads cleanly even at the small "summary_large_image" size X uses.
 *
 * Kept static (no DB / API). OG crawlers cache the rendered PNG for
 * days, so dynamic numbers would be misleading anyway.
 */
import { ImageResponse } from "next/og"

export const alt = "Lending Terminal · Datum Labs Research"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const runtime = "edge"

// ─── Brand constants — to port to another dashboard, edit this block ──────
const BRAND_PILL = "Datum Labs"
const HERO_TITLE = "Lending Terminal"
const SUBTITLE = "by Datum Labs Research"
const TAB_LABEL = "Lending Terminal | Datum Labs Research"

// Palette — kept inline so we don't reach into a tokens module from edge.
const BG = "#0A0B0F"
const TEXT = "#F7F4ED"
const TEXT_MUTED = "rgba(247, 244, 237, 0.66)"
const PILL_BORDER = "rgba(247, 244, 237, 0.55)"
const TAB_BG = "rgba(0, 0, 0, 0.55)"
const TAB_BORDER = "rgba(247, 244, 237, 0.14)"

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          // Indigo radial bloom layered over the dark base — the signature
          // Blockworks "spotlight" effect. Put directly on the container
          // (Satori renders gradients on backgrounds reliably; standalone
          // absolute-overlay divs are hit-or-miss).
          background: `radial-gradient(circle at 50% 38%, rgba(99, 79, 232, 0.72) 0%, rgba(74, 58, 200, 0.36) 28%, rgba(48, 36, 130, 0.12) 50%, ${BG} 70%)`,
          color: TEXT,
          fontFamily: "sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >

        {/* Top brand pill — outlined, transparent fill, centered. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            border: `1.5px solid ${PILL_BORDER}`,
            borderRadius: 999,
            padding: "11px 30px",
            marginBottom: 40,
            background: "rgba(10, 11, 15, 0.18)",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.005em",
              color: TEXT,
            }}
          >
            {BRAND_PILL}
          </span>
        </div>

        {/* Hero title — large, bold, tight tracking. Centered. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            fontSize: 94,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            color: TEXT,
            textAlign: "center",
          }}
        >
          {HERO_TITLE}
        </div>

        {/* By-line — muted, smaller. Same row width as the title naturally. */}
        <div
          style={{
            position: "relative",
            display: "flex",
            marginTop: 24,
            fontSize: 22,
            color: TEXT_MUTED,
            letterSpacing: "0.01em",
          }}
        >
          {SUBTITLE}
        </div>

        {/* Bottom-left identifier tab — the Blockworks "Kamino | Blockworks
            Research" chip equivalent. Keeps the product name attached to
            the brand when the title alone is ambiguous in feed previews. */}
        <div
          style={{
            position: "absolute",
            left: 60,
            bottom: 60,
            display: "flex",
            padding: "13px 22px",
            background: TAB_BG,
            border: `1px solid ${TAB_BORDER}`,
            borderRadius: 12,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: "0.015em",
              color: TEXT,
            }}
          >
            {TAB_LABEL}
          </span>
        </div>
      </div>
    ),
    { ...size },
  )
}
