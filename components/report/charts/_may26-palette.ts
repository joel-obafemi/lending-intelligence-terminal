/**
 * Issue 002 (May 2026) cover-SVG palette + shared font/axis helpers.
 *
 * Used by the seven inline charts added in the "Capital Rotates" reframe.
 * Source: cover artwork colors are the canonical brand palette for this
 * issue's editorial work — ink + cobalt + terracotta + cream + fog.
 *
 *   ink       #0E1B2C — deep navy / headline text
 *   cobalt    #1F3A5F — brand primary, positive series, brand reference lines
 *   terracotta#C5511A — accent / single-point callouts / negative series
 *   cream     #F7F4ED — tooltip surface
 *   fog       #B8C9DD — grid + subtle structure
 *   muted     #595959 — body text muted state
 */
export const INK = "#0E1B2C"
export const COBALT = "#1F3A5F"
export const TERRACOTTA = "#C5511A"
export const CREAM = "#F7F4ED"
export const FOG = "#B8C9DD"
export const MUTED = "#595959"

/** Pos / neg semantic colors. Positive = cobalt, negative = terracotta. */
export const POS = COBALT
export const NEG = TERRACOTTA

/** Standard recharts axis tick style for May'26 charts. */
export const axisTick = {
  fontFamily: "var(--report-font-mono)",
  fontSize: 11,
  fill: MUTED,
}

/** Standard caption / source-line typography. Used inside the
 *  ChartFrame the registry wraps charts in, not inside the chart body. */
export const captionStyle = {
  fontFamily: "var(--report-font-serif)",
  fontStyle: "italic" as const,
  fontSize: 14,
  color: MUTED,
  lineHeight: 1.5,
}
