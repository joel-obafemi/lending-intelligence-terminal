/**
 * Callout — highlighted takeaway box, ported from the DatumLabs blog's
 * component of the same name so report MDX stays portable between the
 * two surfaces. Renders an accent-bordered panel; semantically distinct
 * from <PullQuote> (which restates prose) — a Callout carries a claim
 * that doesn't appear verbatim elsewhere in the section.
 *
 * MDX usage:
 *   <Callout tone="brand">The paradox is not that depositors chose…</Callout>
 *
 * tone: "default" | "brand" | "warn" — matches the blog's prop contract.
 */
import type { ReactNode } from "react"

interface Props {
  children: ReactNode
  title?: string
  tone?: "default" | "brand" | "warn"
}

const TONE_STYLES: Record<
  NonNullable<Props["tone"]>,
  { border: string; background: string }
> = {
  default: {
    border: "var(--report-border, rgba(120, 128, 145, 0.35))",
    background: "rgba(120, 128, 145, 0.06)",
  },
  brand: {
    border: "var(--report-accent)",
    background: "rgba(196, 90, 40, 0.06)",
  },
  warn: {
    border: "#F59E0B",
    background: "rgba(245, 158, 11, 0.07)",
  },
}

export function Callout({ children, title, tone = "default" }: Props) {
  const t = TONE_STYLES[tone] ?? TONE_STYLES.default
  return (
    <aside
      style={{
        borderLeft: `3px solid ${t.border}`,
        background: t.background,
        borderRadius: "0 8px 8px 0",
        padding: "18px 22px",
        margin: "2em 0",
        fontFamily: "var(--report-font-serif)",
        fontSize: "1.05em",
        lineHeight: 1.6,
        color: "var(--report-text)",
      }}
    >
      {title ? (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: tone === "brand" ? "var(--report-accent)" : "var(--report-text-muted)",
            marginBottom: "8px",
          }}
        >
          {title}
        </div>
      ) : null}
      {children}
    </aside>
  )
}
