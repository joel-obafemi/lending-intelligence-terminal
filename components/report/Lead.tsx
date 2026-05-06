/**
 * Lead paragraph — used once per issue, wraps the opening paragraph of
 * the executive summary. Renders with a serif drop cap (~4 lines tall, in
 * the accent color) and a slightly larger body type than standard prose.
 *
 * MDX usage:
 *   <Lead>April was the month an attacker drained Kelp's rsETH bridge…</Lead>
 *
 * The drop cap is purely decorative — it's `aria-hidden` so a screen
 * reader doesn't read the first letter twice (once for the float, once
 * for the inline paragraph text continuing after).
 */
import type { ReactNode, ReactElement } from "react"
import { Children, cloneElement, isValidElement } from "react"

interface Props {
  children: ReactNode
}

/**
 * Extract the first character of the lead paragraph for the drop cap.
 * Returns the first char and the remainder, or null if the children
 * don't start with a string we can split.
 */
function splitFirstChar(node: ReactNode): { first: string; rest: ReactNode } | null {
  // Direct string — split at the first character.
  if (typeof node === "string") {
    if (node.length === 0) return null
    return { first: node[0], rest: node.slice(1) }
  }
  // Array — try splitting the first element, keep siblings.
  if (Array.isArray(node)) {
    const [head, ...tail] = node
    const split = splitFirstChar(head)
    if (!split) return null
    return { first: split.first, rest: [split.rest, ...tail] }
  }
  // React element — recurse into its children.
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>
    const split = splitFirstChar(el.props.children)
    if (!split) return null
    return {
      first: split.first,
      rest: cloneElement(el, undefined, split.rest),
    }
  }
  return null
}

export function Lead({ children }: Props) {
  // MDX wraps content in a paragraph; the children we get are likely a
  // string or a single text node. Try to extract the first letter for
  // the drop cap; fall back to plain rendering if extraction fails.
  const flatChildren = Children.toArray(children)
  const split = splitFirstChar(flatChildren)

  if (!split) {
    return (
      <p
        style={{
          fontFamily: "var(--report-font-serif)",
          fontSize: "var(--report-lead-size)",
          lineHeight: 1.55,
          marginBottom: "1.4em",
          color: "var(--report-text)",
        }}
      >
        {children}
      </p>
    )
  }

  return (
    <p
      style={{
        fontFamily: "var(--report-font-serif)",
        fontSize: "var(--report-lead-size)",
        lineHeight: 1.55,
        marginBottom: "1.4em",
        color: "var(--report-text)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          float: "left",
          fontFamily: "var(--report-font-serif)",
          fontWeight: 700,
          fontSize: "5em",
          lineHeight: 0.92,
          color: "var(--report-accent)",
          marginRight: "10px",
          marginTop: "4px",
          paddingTop: "4px",
        }}
      >
        {split.first}
      </span>
      {split.rest}
    </p>
  )
}
