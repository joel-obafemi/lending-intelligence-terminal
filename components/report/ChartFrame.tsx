"use client"

/**
 * Client-side wrapper around a registry chart's renderer.
 *
 * The Chart server component pre-loads BOTH the snapshot dataset
 * (clamped to freeze_date) and the live dataset (un-clamped) and
 * passes them as JSON props. This client-side wrapper owns the
 * selection state for the freeze toggle and renders the appropriate
 * dataset through the registered renderer Component.
 *
 * No client-side fetching here — both datasets are already on the
 * page from server render. The toggle just swaps which one drives
 * the chart.
 *
 * Caption + source label + share-link icon all render below the chart
 * regardless of selection, since they describe the visual rather
 * than the dataset.
 */
import { useState, type ComponentType } from "react"
import { ChartFreezeToggle } from "./ChartFreezeToggle"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Props<TData> {
  Component: ComponentType<{ data: TData; params: ChartRegistryParams }>
  snapshotData: TData
  liveData: TData
  snapshotParams: ChartRegistryParams
  liveParams: ChartRegistryParams
  /** Display label for the snapshot button — derived from freeze_date. */
  snapshotLabel: string
  caption?: string
  source_label?: string
  /** When false, hide the toggle (no freeze_date on issue). */
  showFreezeToggle: boolean
  /** Stable id used by the share-link button to anchor in-page. */
  anchorId: string
}

export function ChartFrame<TData>({
  Component,
  snapshotData,
  liveData,
  snapshotParams,
  liveParams,
  snapshotLabel,
  caption,
  source_label,
  showFreezeToggle,
  anchorId,
}: Props<TData>) {
  const [selected, setSelected] = useState<"snapshot" | "live">("snapshot")
  const data = selected === "snapshot" ? snapshotData : liveData
  const params = selected === "snapshot" ? snapshotParams : liveParams
  const liveBadge = selected === "live"

  return (
    <figure
      id={anchorId}
      className="report-chart-frame"
      style={{ margin: "2.5em 0", scrollMarginTop: "32px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        {showFreezeToggle ? (
          <ChartFreezeToggle
            snapshotLabel={snapshotLabel}
            selected={selected}
            onChange={setSelected}
          />
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => copyAnchor(anchorId)}
          aria-label="Copy link to this chart"
          style={shareBtnStyle}
        >
          ↗ Share
        </button>
      </div>

      <Component data={data} params={params} />

      {liveBadge && (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--report-accent)",
            marginTop: "6px",
          }}
        >
          ● Live · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      )}

      {caption && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: "14px",
            color: "var(--report-text-muted)",
            marginTop: "10px",
          }}
        >
          {caption}
        </figcaption>
      )}
      {source_label && (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            color: "var(--report-text-muted)",
            marginTop: "4px",
            letterSpacing: "0.04em",
          }}
        >
          Source: {source_label}
        </div>
      )}
    </figure>
  )
}

const shareBtnStyle = {
  background: "transparent",
  border: "1px solid var(--report-border)",
  color: "var(--report-text-muted)",
  fontFamily: "var(--report-font-mono)",
  fontSize: "11px",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  padding: "4px 10px",
  borderRadius: "4px",
  cursor: "pointer",
}

function copyAnchor(anchorId: string) {
  if (typeof window === "undefined") return
  const url = `${window.location.origin}${window.location.pathname}#${anchorId}`
  navigator.clipboard?.writeText(url).catch(() => {})
}
