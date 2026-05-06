/**
 * <Chart> — server component invoked by MDX as <Chart source="…" />.
 *
 * Resolves the source ID against the chart registry, calls the entry's
 * loader twice (once with the issue's freeze_date, once without), and
 * passes both datasets to a client ChartFrame for the toggle.
 *
 * When the source is not in the registry yet (commit 4 fills in the
 * remaining entries), this falls back to the same placeholder the stub
 * was using so the page keeps rendering.
 */
import {
  chartRegistry,
  hasRegistryEntry,
} from "@/lib/reports/chart-registry"
import { ChartFrame } from "./ChartFrame"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface Props {
  source: string
  range?: string
  asset?: string
  protocol?: string
  caption?: string
  source_label?: string
  height?: number
  view?: string
  metric?: string
  annotations?: Array<{ date: string; label: string; color?: string }>
  /** Per-issue freeze date — bound by the route via closure. Not declared
   *  in the MDX file itself; the route injects it before MDX render. */
  freezeDate?: string | null
}

function buildParams(props: Props, withFreeze: boolean): ChartRegistryParams {
  return {
    freezeDate: withFreeze ? props.freezeDate ?? null : null,
    range: props.range,
    asset: props.asset,
    protocol: props.protocol,
    annotations: props.annotations,
    view: props.view,
    metric: props.metric,
  }
}

function chartAnchorId(props: Props): string {
  const parts = [
    "chart",
    props.source.replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
    props.asset?.toLowerCase(),
    props.protocol?.toLowerCase(),
    props.range,
  ].filter(Boolean)
  return parts.join("-")
}

function snapshotLabelFromFreeze(freezeDate: string | null | undefined): string {
  if (!freezeDate) return "Snapshot"
  const d = new Date(freezeDate)
  if (Number.isNaN(d.getTime())) return "Snapshot"
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} snapshot`
}

export async function Chart(props: Props) {
  const source = props.source
  if (!hasRegistryEntry(source)) {
    return <ChartPlaceholder {...props} />
  }
  const entry = chartRegistry[source]
  // Merge the entry's defaults under the MDX-provided params (MDX wins).
  const baseParams = {
    ...(entry.defaultParams ?? {}),
    range: props.range ?? entry.defaultParams?.range,
    asset: props.asset ?? entry.defaultParams?.asset,
    protocol: props.protocol ?? entry.defaultParams?.protocol,
  } as Partial<ChartRegistryParams>
  const snapshotParams: ChartRegistryParams = {
    ...buildParams(props, true),
    ...stripUndefined(baseParams),
    freezeDate: props.freezeDate ?? null,
  }
  const liveParams: ChartRegistryParams = {
    ...buildParams(props, false),
    ...stripUndefined(baseParams),
    freezeDate: null,
  }

  // Run both loaders in parallel. Cached upstream loaders dedup any
  // shared underlying call across charts within the same render.
  const [snapshotData, liveData] = await Promise.all([
    entry.loader(snapshotParams),
    entry.loader(liveParams),
  ])

  const Component = entry.Component
  return (
    <ChartFrame
      Component={Component}
      snapshotData={snapshotData}
      liveData={liveData}
      snapshotParams={snapshotParams}
      liveParams={liveParams}
      snapshotLabel={snapshotLabelFromFreeze(props.freezeDate)}
      showFreezeToggle={!!props.freezeDate}
      caption={props.caption}
      source_label={props.source_label}
      anchorId={chartAnchorId(props)}
    />
  )
}

/** Placeholder for sources not yet in the registry. Same look as the
 *  ChartStub from commits 1-2 so the visual rhythm of the page is
 *  preserved while commit 4 fills in remaining entries. */
function ChartPlaceholder(props: Props) {
  const subtitle = [props.protocol, props.asset, props.range]
    .filter(Boolean)
    .join(" · ")
  const height = props.height ?? 360
  return (
    <figure style={{ margin: "2em 0" }}>
      <div
        role="img"
        aria-label={`Chart placeholder for ${props.source}${subtitle ? ` (${subtitle})` : ""}`}
        style={{
          height,
          background: "rgba(31, 58, 95, 0.04)",
          border: "1px dashed var(--report-border)",
          borderRadius: "4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          color: "var(--report-text-muted)",
        }}
      >
        <span
          className="report-numeric"
          style={{
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Chart · {props.source}
        </span>
        {subtitle && (
          <span
            className="report-numeric"
            style={{ fontSize: "11px", letterSpacing: "0.06em" }}
          >
            {subtitle}
          </span>
        )}
      </div>
      {props.caption && (
        <figcaption
          style={{
            fontFamily: "var(--report-font-serif)",
            fontStyle: "italic",
            fontSize: "14px",
            color: "var(--report-text-muted)",
            marginTop: "10px",
          }}
        >
          {props.caption}
        </figcaption>
      )}
      {props.source_label && (
        <div
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: "11px",
            color: "var(--report-text-muted)",
            marginTop: "4px",
            letterSpacing: "0.04em",
          }}
        >
          Source: {props.source_label}
        </div>
      )}
    </figure>
  )
}

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(o) as Array<keyof T>) {
    if (o[k] !== undefined) out[k] = o[k]
  }
  return out
}
