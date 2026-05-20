"use client"

/**
 * Net Supply Flows — Sankey rendering of the per-asset → protocol → per-asset
 * flow over the trailing W / M / Q window.
 *
 * Three columns:
 *   LEFT     asset nodes contributing net inflow over the window
 *   MIDDLE   protocols with net total (green when positive, red when negative)
 *   RIGHT    asset nodes contributing net outflow
 *
 * Data is pre-computed server-side in lib/overview.ts → netFlowsSankey,
 * one snapshot per window. The W/M/Q toggle just swaps which snapshot the
 * Sankey renders — no further computation runs on the client.
 *
 * The chart uses Recharts' Sankey primitive with a custom node renderer.
 * Recharts hands node rendering an absolute pixel rect (`x`, `y`, `width`,
 * `height`) plus the original `payload` (our SankeyNode shape). The custom
 * node component adds the label and dollar amount to the right of left-
 * column nodes and to the left of right-column nodes.
 */

import { useMemo, useRef, useState } from "react"
import { Layer, ResponsiveContainer, Sankey, Tooltip } from "recharts"
import { MethodologyTooltip } from "./methodology-tooltip"
import { ChartActions } from "../chart-actions"
import type { NetFlowsSankeyData, SankeyNode } from "@/lib/net-flows-sankey"

type WindowKey = "week" | "month" | "quarter"

interface Props {
  title: string
  /** One Sankey snapshot per window. */
  windows: {
    week: NetFlowsSankeyData
    month: NetFlowsSankeyData
    quarter: NetFlowsSankeyData
  }
  methodologyKey?: string
}

const WINDOW_LABEL: Record<WindowKey, string> = { week: "W", month: "M", quarter: "Q" }
const WINDOW_LONG: Record<WindowKey, string> = {
  week: "7 days",
  month: "30 days",
  quarter: "90 days",
}

function formatCompactUsd(v: number, withSign = false): string {
  const sign = withSign && v > 0 ? "+" : v < 0 ? "-" : ""
  const abs = Math.abs(v)
  if (!Number.isFinite(abs) || abs <= 0) return `${sign}$0`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

interface SankeyNodeRenderProps {
  x: number
  y: number
  width: number
  height: number
  index: number
  payload: SankeyNode
  containerWidth: number
}

function SankeyNodeRender(props: SankeyNodeRenderProps) {
  const { x, y, width, height, payload, containerWidth } = props
  const kind = payload.kind
  // Left column nodes attach the label to the right of the rect. Right
  // column nodes attach to the left. Middle column (protocols) labels
  // sit above the rect with the protocol's net total below it.
  const fill = nodeColor(payload)
  const labelText = payload.name
  const valueText =
    kind === "protocol"
      ? formatCompactUsd(payload.totalUsd, true)
      : formatCompactUsd(payload.totalUsd)
  const labelX = kind === "asset_in" ? x - 8 : kind === "asset_out" ? x + width + 8 : x + width / 2
  const labelAnchor: "start" | "end" | "middle" =
    kind === "asset_in" ? "end" : kind === "asset_out" ? "start" : "middle"
  const labelY = kind === "protocol" ? y - 6 : y + height / 2
  return (
    <Layer key={`sankey-node-${props.index}`}>
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(1, height)}
        fill={fill}
        fillOpacity={0.85}
        rx={2}
      />
      {kind === "protocol" ? (
        <>
          <text
            textAnchor="middle"
            x={labelX}
            y={labelY}
            fontSize={11}
            fontWeight={600}
            fill="var(--text-primary)"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {labelText} {valueText}
          </text>
        </>
      ) : (
        <text
          textAnchor={labelAnchor}
          x={labelX}
          y={labelY}
          dy={4}
          fontSize={11}
          fill="var(--text-secondary)"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <tspan fontWeight={600} fill="var(--text-primary)">{labelText}</tspan>
          <tspan dx={6} fill="var(--text-muted)">{valueText}</tspan>
        </text>
      )}
    </Layer>
  )
}

function nodeColor(node: SankeyNode): string {
  if (node.kind === "protocol") {
    if (node.color) return node.color
    return node.totalUsd >= 0 ? "var(--success)" : "var(--danger)"
  }
  return node.kind === "asset_in" ? "var(--success)" : "var(--danger)"
}

interface SankeyLinkRenderProps {
  sourceX: number
  sourceY: number
  sourceControlX: number
  targetControlX: number
  targetX: number
  targetY: number
  linkWidth: number
  index: number
  payload: { source: { kind?: string }; target: { kind?: string } }
}

function SankeyLinkRender(props: SankeyLinkRenderProps) {
  const {
    sourceX,
    sourceY,
    sourceControlX,
    targetControlX,
    targetX,
    targetY,
    linkWidth,
    index,
    payload,
  } = props
  // Recharts gives the link's exit and entry points; mirror that into the
  // band geometry. Color the band based on whether it's the inflow leg
  // (asset_in → protocol) or the outflow leg (protocol → asset_out).
  const isInflow = payload.source?.kind === "asset_in"
  const color = isInflow ? "var(--success)" : "var(--danger)"
  return (
    <path
      key={`sankey-link-${index}`}
      d={`
        M${sourceX},${sourceY}
        C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
      `}
      fill="none"
      stroke={color}
      strokeOpacity={0.28}
      strokeWidth={Math.max(1, linkWidth)}
    />
  )
}

interface FlowsTooltipProps {
  active?: boolean
  payload?: Array<{ payload: any }>
}

function FlowsTooltip({ active, payload }: FlowsTooltipProps) {
  if (!active || !payload?.length) return null
  const p: any = payload[0]?.payload
  if (!p) return null
  // Recharts hands either a node or a link. Nodes have `name` / `kind`;
  // links have `source` and `target` (resolved to the underlying node).
  if (p.source && p.target) {
    const src = p.source
    const tgt = p.target
    return (
      <div className="custom-tooltip min-w-[200px]">
        <p className="text-xs text-text-muted mb-1.5">
          {src.name} → {tgt.name}
        </p>
        <p className="text-xs font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
          {formatCompactUsd(p.value ?? 0)}
        </p>
      </div>
    )
  }
  if (p.kind === "protocol") {
    return (
      <div className="custom-tooltip min-w-[200px]">
        <p className="text-xs text-text-muted mb-1.5">{p.name} · net</p>
        <p
          className="text-xs font-semibold tabular-nums"
          style={{ color: p.totalUsd >= 0 ? "var(--success)" : "var(--danger)" }}
        >
          {formatCompactUsd(p.totalUsd ?? 0, true)}
        </p>
      </div>
    )
  }
  // asset_in / asset_out node
  return (
    <div className="custom-tooltip min-w-[200px]">
      <p className="text-xs text-text-muted mb-1.5">
        {p.name} · {p.kind === "asset_in" ? "inflow" : "outflow"}
      </p>
      <p className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {formatCompactUsd(p.totalUsd ?? 0)}
      </p>
    </div>
  )
}

export function NetFlowsSankey({ title, windows, methodologyKey }: Props) {
  const [window, setWindow] = useState<WindowKey>("week")
  const cardRef = useRef<HTMLDivElement>(null)
  const data = windows[window]

  // Recharts Sankey wants `nodes` + `links` as objects with `name` + the
  // raw `source` / `target` indices. We pass the full SankeyNode through
  // so custom renderers can read `kind`, `color`, `totalUsd` off `payload`.
  const chartData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n, name: n.name })),
      links: data.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
    }),
    [data],
  )

  const hasData = data.nodes.length > 0 && data.links.length > 0
  const dynamicHeight = Math.max(
    360,
    Math.min(720, 60 + data.nodes.length * 22),
  )

  return (
    <div
      ref={cardRef}
      className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col"
    >
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent flex items-center gap-1.5"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          {methodologyKey && <MethodologyTooltip methodologyKey={methodologyKey} />}
        </span>
        <div className="flex items-center gap-2">
          <div
            style={{
              display: "inline-flex",
              border: "1px solid var(--card-border)",
              borderRadius: "4px",
              overflow: "hidden",
              background: "var(--background)",
            }}
          >
            {(Object.keys(WINDOW_LABEL) as WindowKey[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                style={{
                  padding: "4px 10px",
                  fontSize: "10px",
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  fontFamily: "inherit",
                  backgroundColor: window === w ? "var(--card-border)" : "transparent",
                  color: window === w ? "var(--text-primary)" : "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {WINDOW_LABEL[w]}
              </button>
            ))}
          </div>
          <span
            className="text-[10px] uppercase tracking-[0.08em]"
            style={{ color: "var(--text-muted)" }}
          >
            {WINDOW_LONG[window]}
          </span>
          <ChartActions cardRef={cardRef} title={`${title} · ${WINDOW_LONG[window]}`} />
        </div>
      </div>
      <div className="relative chart-body" style={{ height: dynamicHeight }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={chartData}
              nodePadding={14}
              nodeWidth={10}
              iterations={48}
              margin={{ top: 16, right: 120, bottom: 16, left: 120 }}
              node={(nodeProps: any) => <SankeyNodeRender {...nodeProps} />}
              link={(linkProps: any) => <SankeyLinkRender {...linkProps} />}
            >
              <Tooltip content={<FlowsTooltip />} />
            </Sankey>
          </ResponsiveContainer>
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No net flows in the trailing {WINDOW_LONG[window]} window.
          </div>
        )}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-[10px]"
        style={{
          borderTop: "1px solid var(--card-border)",
          color: "var(--text-muted)",
          background: "var(--panel-header)",
        }}
      >
        <span>
          Net inflow {formatCompactUsd(data.totalInflowUsd)} · Net outflow {formatCompactUsd(data.totalOutflowUsd)}
        </span>
        <span>Constant prices · DefiLlama token quantities · "Mixed" = USD-only protocols</span>
      </div>
    </div>
  )
}
