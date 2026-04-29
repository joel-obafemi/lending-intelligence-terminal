"use client"

export type TimeRange = 7 | 30 | 90 | 365 | 0
// 0 = All time

interface TimeToggleProps {
  selected: TimeRange
  onChange: (days: TimeRange) => void
  options?: TimeRange[]
  /** Override labels for each option. Defaults to "7D", "30D", "90D", "1Y", "All" */
  labels?: Partial<Record<TimeRange, string>>
}

const DEFAULT_LABELS: Record<TimeRange, string> = {
  7: "7D",
  30: "30D",
  90: "90D",
  365: "1Y",
  0: "All",
}

export function TimeToggle({
  selected,
  onChange,
  options = [7, 30, 90, 365, 0],
  labels,
}: TimeToggleProps) {
  const getLabel = (opt: TimeRange) => labels?.[opt] ?? DEFAULT_LABELS[opt]
  return (
    <div
      // ChartActions hides this during PNG export — html2canvas doesn't
      // rasterize the toggle's tight border + bg cleanly at small sizes
      // and the chart's x-axis already conveys the time range.
      data-chart-export-hide="time-toggle"
      style={{
        display: "inline-flex",
        borderRadius: "4px",
        border: "1px solid var(--card-border)",
        overflow: "hidden",
        backgroundColor: "var(--background)",
      }}
    >
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "4px 10px",
            fontSize: "11px",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
            fontFamily: "inherit",
            backgroundColor: selected === opt ? "var(--card-border)" : "transparent",
            color: selected === opt ? "var(--text-primary)" : "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {getLabel(opt)}
        </button>
      ))}
    </div>
  )
}
