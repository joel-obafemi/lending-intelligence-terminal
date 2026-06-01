/**
 * Root-level OG image (1200×630) for the Lending Intelligence Terminal.
 *
 * Visual identity: Datum Labs' own house style as established on social
 * cards / data-thread covers — cream parchment base, big royal-blue
 * gradient blob, serif display headline in cream-over-blue, sans-serif
 * subtitle, dashed-border slug pill at bottom-left.
 *
 * Built deliberately distinct from the Blockworks dashboard family
 * (dark + indigo bloom + centered sans pill + bottom tab). Different
 * palette, different layout, different typography, different motif.
 *
 * Fonts are loaded from Google Fonts at edge runtime so the serif
 * actually renders as a serif (Satori's bundled fallback is sans-only).
 * The fetch happens once per OG cache miss — crawlers cache the PNG for
 * days, so the cost is negligible.
 *
 * Portable to other Datum Labs dashboards by editing the BRAND block.
 * The slug pill is the per-property knob (DATA THREAD, LENDING TERMINAL,
 * MORPHO TERMINAL, etc.) — same composition, different label.
 */
import { ImageResponse } from "next/og"

export const alt = "Lending Terminal · Datum Labs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const runtime = "edge"

// ─── Palette — mirrors the Datum Labs social cards ───────────────────────
const CREAM = "#F1EBD8"
const CREAM_OVER_BLUE = "#F4EFE2"
const CREAM_MUTED = "rgba(244, 239, 226, 0.85)"
const BLUE_BRIGHT = "#4F6CE6"
const BLUE_DEEP = "#1A2160"

// ─── Brand block — to port to another dashboard, edit this block ─────────
const HEADLINE = "Lending Terminal."
const SUBTITLE =
  "Live multi-protocol intelligence for Ethereum lending — TVL, rates, flows, and risk."
const PILL_LABEL = "/ Live Terminal"

/**
 * Fetch a Google Font binary at edge runtime. Subsets the file to the
 * characters we'll actually render so the download stays small.
 */
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const url =
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}` +
    `:wght@${weight}&text=${encodeURIComponent(text)}`
  const css = await fetch(url).then((r) => r.text())
  // Match the actual font file URL from the @font-face src declaration.
  const fileUrl = css.match(/src:\s*url\((https:\/\/[^)]+)\)/)?.[1]
  if (!fileUrl) {
    throw new Error(`Google Fonts: no src URL found for ${family} ${weight}`)
  }
  return fetch(fileUrl).then((r) => r.arrayBuffer())
}

export default async function OgImage() {
  // Each font only needs to render its own text — subsetting keeps the
  // edge fetch tiny.
  const serifText = HEADLINE
  const sansText = SUBTITLE + PILL_LABEL

  const [serifData, sansData] = await Promise.all([
    loadGoogleFont("Newsreader", 700, serifText),
    loadGoogleFont("Inter", 500, sansText),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          position: "relative",
          background: CREAM,
          fontFamily: "Inter",
          color: CREAM_OVER_BLUE,
        }}
      >
        {/* Royal-blue gradient blob — covers most of the canvas, fades to
            cream at the right edge and bottom-right corner. Anchored
            slightly left of center so the headline sits in the brightest
            patch and the right edge feels like paper bleeding through. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: `radial-gradient(circle at 36% 48%, ${BLUE_BRIGHT} 0%, ${BLUE_BRIGHT} 18%, ${BLUE_DEEP} 52%, rgba(26, 33, 96, 0) 86%)`,
          }}
        />

        {/* Content stack — vertically centered, padded from the left edge */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 90px 0 90px",
            width: 1200,
            height: 630,
            gap: 30,
          }}
        >
          {/* Serif display headline */}
          <div
            style={{
              display: "flex",
              fontFamily: "Newsreader",
              fontWeight: 700,
              fontSize: 124,
              lineHeight: 1.0,
              letterSpacing: "-0.022em",
              color: CREAM_OVER_BLUE,
              maxWidth: 980,
            }}
          >
            {HEADLINE}
          </div>

          {/* Sans-serif subtitle */}
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 500,
              fontSize: 30,
              lineHeight: 1.32,
              color: CREAM_MUTED,
              maxWidth: 900,
            }}
          >
            {SUBTITLE}
          </div>
        </div>

        {/* Dashed-border slug pill — bottom-left, sits over the blue area.
            This is the Datum Labs "data thread" idiom adapted for the
            Terminal — the slash + uppercase label vocabulary stays, the
            wording is per-property. */}
        <div
          style={{
            position: "absolute",
            left: 90,
            bottom: 70,
            display: "flex",
            alignItems: "center",
            padding: "11px 22px",
            border: `1.5px dashed ${CREAM_OVER_BLUE}`,
            borderRadius: 999,
          }}
        >
          <span
            style={{
              fontFamily: "Inter",
              fontWeight: 500,
              fontSize: 17,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: CREAM_OVER_BLUE,
            }}
          >
            {PILL_LABEL}
          </span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Newsreader", data: serifData, weight: 700, style: "normal" },
        { name: "Inter", data: sansData, weight: 500, style: "normal" },
      ],
    },
  )
}
