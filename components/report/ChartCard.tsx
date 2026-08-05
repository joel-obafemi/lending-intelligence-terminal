/**
 * ChartCard — embeds a pre-rendered static SVG chart in a report.
 *
 * Issue 004 introduced hand-rendered house-style SVGs (cream background,
 * cobalt / terracotta palette) that carry annotations a generic
 * <InlineChart> cannot reproduce — e.g. the July-23 Atlas Edit event line
 * and label on the SparkLend rate chart, or the "Sentora overtakes
 * Steakhouse" marker on the curator crossover.
 *
 * Each SVG is self-contained: it bakes in its own title, descriptive
 * caption, and "Source: Datum Labs Research" attribution. ChartCard
 * therefore renders the SVG as a responsive figure and does NOT repeat the
 * caption underneath it (that would duplicate what the artwork already
 * shows). The `caption` prop supplies the accessible alt text for screen
 * readers, and `sources` renders a small provenance line naming the
 * snapshot files that back the chart — data lineage for the analyst
 * audience, distinct from the artwork's own attribution line.
 */
interface ChartCardProps {
  /** Path under /public to the pre-rendered SVG, e.g.
   *  "/reports/charts/2026-07/section-01-curator-crossover.svg". */
  src: string
  /** Descriptive caption. The SVG already renders this visually, so here
   *  it becomes the image alt text rather than a visible duplicate. */
  caption?: string
  /** Snapshot files backing the chart, surfaced as a data-lineage line. */
  sources?: string[]
}

export function ChartCard({ src, caption, sources }: ChartCardProps) {
  return (
    <figure
      className="report-chart-card"
      style={{
        margin: "40px 0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Static, house-rendered SVG. next/image would require
          dangerouslyAllowSVG + explicit sizing for no benefit here; a
          plain img is the correct primitive for an inline SVG figure. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={caption ?? ""}
        loading="lazy"
        style={{
          width: "100%",
          height: "auto",
          borderRadius: 6,
          border: "1px solid var(--report-border)",
        }}
      />
      {sources && sources.length > 0 && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 10,
            letterSpacing: "0.04em",
            color: "var(--report-text-muted)",
            lineHeight: 1.5,
          }}
        >
          Data: {sources.join(", ")}
        </figcaption>
      )}
    </figure>
  )
}
