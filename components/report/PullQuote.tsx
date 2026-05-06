/**
 * Visual pull quote — large italic serif, thick left border in the accent
 * color, breaking out of the prose column slightly to draw the eye.
 *
 * MDX usage:
 *   <PullQuote attribution="The author" optional>
 *     The capital that left Aave V3 chose Spark almost exclusively…
 *   </PullQuote>
 *
 * The component renders as a <figure> with a <blockquote> + optional
 * <figcaption attribution> for proper semantics. Slight negative margins
 * on desktop pull the quote a few pixels left of the prose column, which
 * is the visual cue readers expect from print typography.
 */
import type { ReactNode } from "react"

interface Props {
  children: ReactNode
  /** Optional attribution line shown below the quote. */
  attribution?: string
}

export function PullQuote({ children, attribution }: Props) {
  return (
    <figure
      className="report-pullquote"
      style={{
        margin: "2.5em 0",
        marginLeft: "-12px",
      }}
    >
      <blockquote
        style={{
          fontFamily: "var(--report-font-serif)",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: "30px",
          lineHeight: 1.32,
          color: "var(--report-text)",
          borderLeft: "4px solid var(--report-accent)",
          paddingLeft: "20px",
          margin: 0,
        }}
      >
        {children}
      </blockquote>
      {attribution && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-sans)",
            fontSize: "13px",
            color: "var(--report-text-muted)",
            marginTop: "12px",
            paddingLeft: "24px",
            letterSpacing: "0.04em",
          }}
        >
          — {attribution}
        </figcaption>
      )}
    </figure>
  )
}
