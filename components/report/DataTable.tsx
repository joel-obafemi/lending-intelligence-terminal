"use client"

/**
 * DataTable — sortable, accent-bordered, monospaced numerals.
 *
 * Spec: thin top + bottom borders in the accent color, no vertical lines,
 * monospaced numeric columns, serif label columns, sticky header,
 * horizontal scroll on mobile, optional caption + source line.
 *
 * Sortability is opt-in per column via `sortable: true`. When a sortable
 * column header is clicked, rows re-render in ascending → descending →
 * unsorted (original order) cycle. Numeric strings (containing $, %, M,
 * B, K, ,) are detected and sorted numerically; everything else sorts
 * lexicographically.
 */
import { useMemo, useState } from "react"

export interface DataTableColumn {
  key: string
  label: string
  align?: "left" | "right"
  sortable?: boolean
}

export interface DataTableProps {
  caption?: string
  columns: DataTableColumn[]
  rows: Array<Record<string, string | number>>
  source_label?: string
}

type SortState = { key: string; dir: "asc" | "desc" } | null

/** Parse a cell value into a number when it looks numeric. Handles
 *  formatted strings like "$32.26B", "−$9.66B (−23.0%)", "+1.92 pp",
 *  "94.4%", "3,026". When parsing fails, returns NaN — sort falls back
 *  to string comparison. */
function parseNumeric(v: string | number | undefined): number {
  if (typeof v === "number") return v
  if (v == null) return NaN
  const s = v.replace(/[\s$,]/g, "")
  // Extract leading sign + first numeric block.
  const match = s.match(/^([−+-]?)(\d+(?:\.\d+)?)/)
  if (!match) return NaN
  const sign = match[1] === "−" || match[1] === "-" ? -1 : 1
  const mag = parseFloat(match[2])
  if (!Number.isFinite(mag)) return NaN
  // Suffix multipliers — only the first one we see matters.
  const tail = s.slice(match[0].length)
  let mult = 1
  if (/^B/i.test(tail)) mult = 1e9
  else if (/^M/i.test(tail)) mult = 1e6
  else if (/^K/i.test(tail)) mult = 1e3
  return sign * mag * mult
}

export function DataTable({ caption, columns, rows, source_label }: DataTableProps) {
  const [sort, setSort] = useState<SortState>(null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const dir = sort.dir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const an = parseNumeric(av as any)
      const bn = parseNumeric(bv as any)
      const numericPair = Number.isFinite(an) && Number.isFinite(bn)
      if (numericPair) return (an - bn) * dir
      const as = String(av ?? "")
      const bs = String(bv ?? "")
      return as.localeCompare(bs) * dir
    })
  }, [rows, sort, columns])

  function onHeaderClick(col: DataTableColumn) {
    if (!col.sortable) return
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: "asc" }
      if (prev.dir === "asc") return { key: col.key, dir: "desc" }
      return null
    })
  }

  return (
    <figure className="report-data-table" style={{ margin: "2em 0" }}>
      {caption && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: "14px",
            color: "var(--report-text-muted)",
            marginBottom: "10px",
          }}
        >
          {caption}
        </figcaption>
      )}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderTop: "2px solid var(--report-accent)",
            borderBottom: "2px solid var(--report-accent)",
            borderCollapse: "collapse",
          }}
        >
          <thead style={{ position: "sticky", top: 0 }}>
            <tr>
              {columns.map((c) => {
                const isSorted = sort?.key === c.key
                const arrow = isSorted ? (sort!.dir === "asc" ? "▲" : "▼") : ""
                return (
                  <th
                    key={c.key}
                    onClick={() => onHeaderClick(c)}
                    style={{
                      textAlign: c.align ?? "left",
                      padding: "10px 12px",
                      fontFamily: "var(--report-font-sans)",
                      fontSize: "11px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: isSorted
                        ? "var(--report-accent)"
                        : "var(--report-text-muted)",
                      fontWeight: 600,
                      borderBottom: "1px solid var(--report-border)",
                      cursor: c.sortable ? "pointer" : "default",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      background: "var(--report-bg)",
                    }}
                    aria-sort={
                      isSorted
                        ? sort!.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : c.sortable
                        ? "none"
                        : undefined
                    }
                    scope="col"
                  >
                    {c.label}
                    {c.sortable && (
                      <span
                        style={{
                          display: "inline-block",
                          width: "1ch",
                          marginLeft: "6px",
                          fontSize: "9px",
                          verticalAlign: "middle",
                          color: isSorted
                            ? "var(--report-accent)"
                            : "var(--report-border)",
                        }}
                        aria-hidden="true"
                      >
                        {arrow || "↕"}
                      </span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 1 ? "rgba(31, 58, 95, 0.025)" : undefined,
                }}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      textAlign: c.align ?? "left",
                      padding: "10px 12px",
                      fontFamily:
                        c.align === "right"
                          ? "var(--report-font-mono)"
                          : "var(--report-font-serif)",
                      fontVariantNumeric:
                        c.align === "right" ? "tabular-nums" : undefined,
                      fontSize: c.align === "right" ? "13px" : "14px",
                      color: "var(--report-text)",
                    }}
                  >
                    {row[c.key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {source_label && (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            color: "var(--report-text-muted)",
            marginTop: "10px",
            letterSpacing: "0.04em",
          }}
        >
          Source: {source_label}
        </div>
      )}
    </figure>
  )
}
