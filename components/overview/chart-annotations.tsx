"use client"

/**
 * ChartAnnotations — drop-in <ReferenceLine> overlay for time-series charts.
 *
 * Each annotation is rendered as a dashed vertical line at its bucketed
 * timestamp, with the label rendered above the chart. Used by the Sector
 * Hero, Risk Hero, and Revenue Cumulative charts to call out depegs,
 * liquidation cascades, and parameter changes.
 *
 * Usage:
 *
 *   import { useAnnotations } from "@/lib/annotations"
 *   import { ChartAnnotations } from "@/components/overview/chart-annotations"
 *   const events = useAnnotations("sector-borrows-share")
 *   ...
 *   <LineChart data={...}>
 *     ...axes / lines...
 *     <ChartAnnotations events={events} bucket={bucket} />
 *   </LineChart>
 *
 * NOTE: must be rendered inside a Recharts chart component (LineChart /
 *  AreaChart / BarChart). Recharts renders the ReferenceLines via a
 *  fragment, but this component returns multiple <ReferenceLine>s grouped
 *  in a `<g>` so you can toss it in mid-chart without juggling fragments.
 */

import { ReferenceLine } from "recharts"
import { bucketStart, type BucketType } from "@/lib/time-bucketing"
import { PROTOCOL_BY_SLUG } from "@/lib/protocols"
import type { ChartAnnotation } from "@/lib/annotations"

interface Props {
  events: ChartAnnotation[]
  /** Active bucket type — annotation timestamps are snapped to bucket
   *  boundaries so the line lands on a grid x-position. */
  bucket: BucketType
}

const NEUTRAL_COLOR = "var(--text-muted)"

export function ChartAnnotations({ events, bucket }: Props) {
  if (!events || events.length === 0) return null
  return (
    <>
      {events.map((evt) => {
        const x = bucketStart(evt.timestamp, bucket)
        const color =
          (evt.protocolSlug && PROTOCOL_BY_SLUG[evt.protocolSlug]?.color) ||
          NEUTRAL_COLOR
        return (
          <ReferenceLine
            key={evt.id}
            x={x}
            stroke={color}
            strokeDasharray="3 3"
            strokeWidth={1}
            strokeOpacity={0.7}
            label={{
              value: evt.label,
              position: "top",
              fontSize: 9,
              fill: color,
              dy: -2,
            }}
            ifOverflow="extendDomain"
          />
        )
      })}
    </>
  )
}
