"use client"

/**
 * Period picker for date-pickable charts on the Sector Overview.
 *
 * Lets the user choose Current (latest snapshot) or a specific
 * Week / Month / Quarter from a list of pre-computed buckets shipped on
 * the page payload (see `lib/historical-buckets.ts`).
 *
 * URL semantics: stateless. The parent component owns the selection so the
 * Composition Donuts and Top Markets tables can have independent pickers,
 * and re-renders are cheap.
 */
import { useMemo } from "react"
import type { HistoricalBuckets } from "@/lib/historical-buckets"

export type Granularity = "current" | "week" | "month" | "quarter"

export interface PeriodSelection {
  granularity: Granularity
  /** Bucket id (e.g. "2026-04"). Empty when granularity === "current". */
  bucketId: string
}

interface Props {
  buckets: HistoricalBuckets | undefined
  value: PeriodSelection
  onChange: (next: PeriodSelection) => void
  /** Render compact (single-row) vs comfortable (label above). */
  size?: "compact"
}

const GRAN_LABEL: Record<Granularity, string> = {
  current: "Current",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
}

const PILL_ORDER: Granularity[] = ["current", "week", "month", "quarter"]

export function PeriodPicker({ buckets, value, onChange }: Props) {
  const options = useMemo(() => {
    if (value.granularity === "week") return buckets?.weeks ?? []
    if (value.granularity === "month") return buckets?.months ?? []
    if (value.granularity === "quarter") return buckets?.quarters ?? []
    return []
  }, [buckets, value.granularity])

  // When the user switches granularity, default to the most-recent bucket of
  // the new granularity so they don't see an empty dropdown.
  function setGranularity(g: Granularity) {
    if (g === "current") {
      onChange({ granularity: "current", bucketId: "" })
      return
    }
    const list =
      g === "week"
        ? buckets?.weeks
        : g === "month"
        ? buckets?.months
        : buckets?.quarters
    const latest = list?.[list.length - 1]
    onChange({ granularity: g, bucketId: latest?.id ?? "" })
  }

  // Disable historical pills when the data isn't available (older snapshot
  // pre-dating this feature).
  const haveBuckets = !!buckets && (
    (buckets.weeks?.length ?? 0) > 0 ||
    (buckets.months?.length ?? 0) > 0 ||
    (buckets.quarters?.length ?? 0) > 0
  )

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="text-[10px] uppercase tracking-[0.08em]"
        style={{ color: "var(--text-muted)" }}
      >
        Period
      </span>
      <div
        style={{
          display: "inline-flex",
          border: "1px solid var(--card-border)",
          borderRadius: "4px",
          overflow: "hidden",
          background: "var(--background)",
        }}
      >
        {PILL_ORDER.map((g) => {
          const disabled = g !== "current" && !haveBuckets
          const active = value.granularity === g
          return (
            <button
              key={g}
              onClick={() => !disabled && setGranularity(g)}
              disabled={disabled}
              title={disabled ? "Historical data not available on this snapshot" : undefined}
              style={pillStyle(active, disabled)}
            >
              {GRAN_LABEL[g]}
            </button>
          )
        })}
      </div>
      {value.granularity !== "current" && options.length > 0 && (
        <select
          value={value.bucketId}
          onChange={(e) =>
            onChange({ granularity: value.granularity, bucketId: e.target.value })
          }
          style={{
            background: "var(--background)",
            color: "var(--text-primary)",
            border: "1px solid var(--card-border)",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "11px",
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          {[...options].reverse().map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function pillStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
    fontFamily: "inherit",
    backgroundColor: active ? "var(--card-border)" : "transparent",
    color: disabled
      ? "var(--text-muted)"
      : active
      ? "var(--text-primary)"
      : "var(--text-muted)",
    opacity: disabled ? 0.5 : 1,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  }
}
