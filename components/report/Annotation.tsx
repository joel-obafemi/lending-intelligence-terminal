/**
 * Inline aside / sidebar note.
 *
 * Spec: on desktop, renders as a small box in the right margin (outside
 * the prose column). On mobile, collapses inline as an indented box
 * below the paragraph it follows. Used for footnote-style asides,
 * technical clarifications, or methodology notes that don't merit a
 * full <MethodologyNote>.
 *
 * Implementation: the article body is a CSS Grid on desktop with a
 * "main" column at the reading width and an "aside" column to its right.
 * <Annotation> elements get `grid-column: aside`, which floats them
 * outside the prose flow. On viewports under 1100px the grid collapses
 * to a single column and the annotation flows inline as a styled
 * indented block.
 *
 * The grid is set up by the article wrapper in app/reports/[slug]/page.tsx
 * via the `report-prose-grid` class. The grid CSS lives in globals.css.
 */
import type { ReactNode } from "react"

interface Props {
  children: ReactNode
}

export function Annotation({ children }: Props) {
  return (
    <aside
      className="report-annotation"
      role="note"
      style={{
        fontFamily: "var(--report-font-sans)",
        fontSize: "13px",
        lineHeight: 1.55,
        color: "var(--report-text-muted)",
      }}
    >
      {children}
    </aside>
  )
}
