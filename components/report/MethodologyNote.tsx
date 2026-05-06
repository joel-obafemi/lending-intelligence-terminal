/**
 * MethodologyNote — a persistent, accessible methodology block placed
 * near the bottom of the issue.
 *
 * Spec offers two presentations: a `<details>` collapsible (less visually
 * heavy) or a persistent section (more discoverable). Going with the
 * persistent presentation: the block always renders open, with a styled
 * heading and a slightly-muted body. Readers who want a collapse-by-
 * default experience can implement that locally; serious research
 * audiences benefit from methodology being visible without an extra
 * click.
 */
import type { ReactNode } from "react"

interface Props {
  /** When true, render as a `<details>` collapsible (legacy behavior).
   *  Defaults to false (persistent open block). */
  collapsible?: boolean
  children: ReactNode
}

export function MethodologyNote({ children, collapsible = false }: Props) {
  if (collapsible) {
    return (
      <details
        className="report-methodology"
        style={{
          margin: "4em 0 2em",
          padding: "20px 24px",
          background: "rgba(31, 58, 95, 0.04)",
          borderRadius: "4px",
        }}
      >
        <summary
          style={{
            fontFamily: "var(--report-font-sans)",
            fontWeight: 600,
            fontSize: "12px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--report-brand)",
            cursor: "pointer",
            listStyle: "none",
          }}
        >
          Methodology
        </summary>
        <div className="report-methodology-body" style={{ marginTop: "20px" }}>
          {children}
        </div>
      </details>
    )
  }

  return (
    <section
      className="report-methodology"
      aria-labelledby="methodology-heading"
      style={{
        margin: "4em 0 2em",
        padding: "28px 28px 24px",
        background: "rgba(31, 58, 95, 0.04)",
        borderTop: "2px solid var(--report-border)",
        borderRadius: "0 0 4px 4px",
      }}
    >
      <h2
        id="methodology-heading"
        style={{
          fontFamily: "var(--report-font-sans)",
          fontWeight: 600,
          fontSize: "12px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--report-brand)",
          marginBottom: "20px",
          marginTop: 0,
        }}
      >
        Methodology
      </h2>
      <div className="report-methodology-body">{children}</div>
    </section>
  )
}
