"use client"

/**
 * Two-button segmented control: snapshot date (default) vs Live data.
 *
 * Used internally by ChartFrame. Pure presentation — owns no state, just
 * surfaces the current selection and emits onChange. Accessible: each
 * button has aria-pressed, the group has role="group" with an
 * aria-label.
 */
import type { CSSProperties } from "react"

interface Props {
  snapshotLabel: string
  selected: "snapshot" | "live"
  onChange: (value: "snapshot" | "live") => void
}

export function ChartFreezeToggle({ snapshotLabel, selected, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Chart data source"
      style={{
        display: "inline-flex",
        border: "1px solid var(--report-border)",
        borderRadius: "4px",
        overflow: "hidden",
        background: "var(--report-bg)",
        fontFamily: "var(--report-font-mono)",
        fontSize: "11px",
      }}
    >
      <button
        type="button"
        onClick={() => onChange("snapshot")}
        aria-pressed={selected === "snapshot"}
        style={pillStyle(selected === "snapshot")}
      >
        {snapshotLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange("live")}
        aria-pressed={selected === "live"}
        style={pillStyle(selected === "live")}
      >
        Live data
      </button>
    </div>
  )
}

function pillStyle(active: boolean): CSSProperties {
  return {
    padding: "4px 12px",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "11px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    background: active ? "var(--report-brand)" : "transparent",
    color: active ? "#F7F4ED" : "var(--report-text-muted)",
    transition: "background 80ms ease, color 80ms ease",
  }
}
