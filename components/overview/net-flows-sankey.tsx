"use client"

/**
 * Net Supply Flows — Sankey rendering of the per-asset → protocol →
 * per-asset flow over the trailing W / M / Q window.
 *
 * Three columns:
 *   LEFT     asset nodes contributing net inflow (green)
 *   MIDDLE   protocols with net total (signed, color-coded)
 *   RIGHT    asset nodes contributing net outflow (red)
 *
 * Column headers above the chart label the inflow / outflow split so the
 * direction is obvious without hovering. Per-link tooltip details show on
 * hover via a custom hover layer (Recharts' built-in Tooltip strips the
 * custom fields we attach to Sankey nodes, so we render our own from the
 * node/link renderer mouse events).
 */

import { useMemo, useRef, useState } from "react"
import { ResponsiveContainer, Sankey } from "recharts"
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

// Pixel budgets used by the renderer. The two label gutters together with
// the chart center must fit inside the card. Long token names like
// "PT-AVUSD-14MAY2026" (~17 chars * 7px) approach 130px, so 180px on each
// side gives breathing room without crowding the bands.
const LABEL_GUTTER = 180
const NODE_COLUMN_WIDTH = 12

function formatCompactUsd(v: number, withSign = false): string {
  const sign = withSign && v > 0 ? "+" : v < 0 ? "-" : ""
  const abs = Math.abs(v)
  if (!Number.isFinite(abs) || abs <= 0) return `${sign}$0`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function nodeColor(node: SankeyNode): string {
  if (node.kind === "protocol") {
    if (node.color) return node.color
    return node.totalUsd >= 0 ? "var(--success)" : "var(--danger)"
  }
  return node.kind === "asset_in" ? "var(--success)" : "var(--danger)"
}

/**
 * Truncate a long label so it fits the gutter. Comfortable budget at 11px
 * mono font is ~22 chars including the dollar suffix; trim symbols past
 * that with an ellipsis so the layout stays clean.
 */
function clampLabel(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name
  return name.slice(0, maxChars - 1) + "…"
}

interface HoverPayload {
  kind: "node" | "link"
  /** For a node: the SankeyNode object. For a link: source and target SankeyNode + USD value. */
  node?: SankeyNode
  link?: { source: SankeyNode; target: SankeyNode; value: number }
  /** Cursor position in the chart's local (SVG) coordinates. */
  x: number
  y: number
}

interface NodeRenderProps {
  x: number
  y: number
  width: number
  height: number
  index: number
  payload: SankeyNode
  containerWidth: number
  onHover: (h: HoverPayload | null) => void
}

function SankeyNodeRender(props: NodeRenderProps) {
  const { x, y, width, height, payload, onHover } = props
  const kind = payload.kind
  const fill = nodeColor(payload)
  // Label width budget. Mono 11px averages ~6.5px per char; subtract the
  // 8px gap from x so the label visually clears the bar.
  const charBudget = Math.max(8, Math.floor((LABEL_GUTTER - 16) / 6.5))
  const valueText =
    kind === "protocol"
      ? formatCompactUsd(payload.totalUsd, true)
      : formatCompactUsd(payload.totalUsd)
  const clampedName = clampLabel(payload.name, charBudget)
  const labelY = kind === "protocol" ? y - 6 : y + height / 2
  return (
    <g
      onMouseEnter={(e) =>
        onHover({
          kind: "node",
          node: payload,
          x: e.nativeEvent.offsetX ?? x,
          y: e.nativeEvent.offsetY ?? y,
        })
      }
      onMouseLeave={() => onHover(null)}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={Math.max(1, height)}
        fill={fill}
        fillOpacity={0.85}
        rx={2}
        cursor="default"
      />
      {kind === "protocol" ? (
        <text
          textAnchor="middle"
          x={x + width / 2}
          y={labelY}
          fontSize={11}
          fontWeight={600}
          fill="var(--text-primary)"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {payload.name}{" "}
          <tspan
            fill={payload.totalUsd >= 0 ? "var(--success)" : "var(--danger)"}
            fontWeight={700}
          >
            {valueText}
          </tspan>
        </text>
      ) : (
        <text
          textAnchor={kind === "asset_in" ? "end" : "start"}
          x={kind === "asset_in" ? x - 8 : x + width + 8}
          y={labelY}
          dy={4}
          fontSize={11}
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          <tspan fontWeight={600} fill="var(--text-primary)">{clampedName}</tspan>
          <tspan dx={6} fill="var(--text-muted)">{valueText}</tspan>
        </text>
      )}
    </g>
  )
}

interface LinkRenderProps {
  sourceX: number
  sourceY: number
  sourceControlX: number
  targetControlX: number
  targetX: number
  targetY: number
  linkWidth: number
  index: number
  payload: { source: SankeyNode; target: SankeyNode; value: number }
  onHover: (h: HoverPayload | null) => void
}

function SankeyLinkRender(props: LinkRenderProps) {
  const {
    sourceX,
    sourceY,
    sourceControlX,
    targetControlX,
    targetX,
    targetY,
    linkWidth,
    payload,
    onHover,
  } = props
  // Recharts resolves source/target to node objects on the link payload at
  // render time. Read kind off either side; treat unresolved (number)
  // refs as inflow by default since they only appear on the leftmost
  // index 0 case which is always asset_in.
  const srcKind =
    typeof payload.source === "object" ? payload.source?.kind : "asset_in"
  const isInflow = srcKind === "asset_in"
  const color = isInflow ? "var(--success)" : "var(--danger)"
  return (
    <path
      d={`
        M${sourceX},${sourceY}
        C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
      `}
      fill="none"
      stroke={color}
      strokeOpacity={0.28}
      strokeWidth={Math.max(1, linkWidth)}
      onMouseEnter={(e) =>
        onHover({
          kind: "link",
          link: {
            source: payload.source as SankeyNode,
            target: payload.target as SankeyNode,
            value: payload.value,
          },
          x: e.nativeEvent.offsetX ?? sourceX,
          y: e.nativeEvent.offsetY ?? sourceY,
        })
      }
      onMouseLeave={() => onHover(null)}
      style={{ cursor: "default" }}
    />
  )
}

function HoverTooltip({ hover }: { hover: HoverPayload | null }) {
  if (!hover) return null
  const offset = 12
  let body: React.ReactNode
  if (hover.kind === "link" && hover.link) {
    const { source, target, value } = hover.link
    const isInflow = source.kind === "asset_in"
    const arrow = isInflow ? "→" : "→"
    body = (
      <>
        <p className="text-xs text-text-muted mb-1.5">
          {source.name ?? "?"} {arrow} {target.name ?? "?"}
        </p>
        <p
          className="text-xs font-semibold tabular-nums"
          style={{ color: isInflow ? "var(--success)" : "var(--danger)" }}
        >
          {formatCompactUsd(value)}
        </p>
      </>
    )
  } else if (hover.kind === "node" && hover.node) {
    const node = hover.node
    if (node.kind === "protocol") {
      body = (
        <>
          <p className="text-xs text-text-muted mb-1.5">{node.name} · net</p>
          <p
            className="text-xs font-semibold tabular-nums"
            style={{ color: node.totalUsd >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {formatCompactUsd(node.totalUsd, true)}
          </p>
        </>
      )
    } else {
      const direction = node.kind === "asset_in" ? "inflow" : "outflow"
      const color = node.kind === "asset_in" ? "var(--success)" : "var(--danger)"
      body = (
        <>
          <p className="text-xs text-text-muted mb-1.5">
            {node.name} · {direction}
          </p>
          <p className="text-xs font-semibold tabular-nums" style={{ color }}>
            {formatCompactUsd(node.totalUsd)}
          </p>
        </>
      )
    }
  } else {
    return null
  }
  return (
    <div
      className="custom-tooltip min-w-[200px] pointer-events-none"
      style={{
        position: "absolute",
        left: hover.x + offset,
        top: hover.y + offset,
        zIndex: 5,
      }}
    >
      {body}
    </div>
  )
}

export function NetFlowsSankey({ title, windows, methodologyKey }: Props) {
  const [window, setWindow] = useState<WindowKey>("week")
  const [hover, setHover] = useState<HoverPayload | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const data = windows[window]

  const chartData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n, name: n.name })),
      links: data.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
    }),
    [data],
  )

  const hasData = data.nodes.length > 0 && data.links.length > 0
  // Height scales with the side with more nodes; each row needs ~22px to
  // breathe at 11px mono. Cap at 760px so the page does not balloon on
  // the Q view where many small flows would otherwise pile up.
  const sideCount = Math.max(
    data.nodes.filter((n) => n.kind === "asset_in").length,
    data.nodes.filter((n) => n.kind === "asset_out").length,
  )
  const dynamicHeight = Math.max(360, Math.min(760, 80 + sideCount * 24))

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

      {/* Column headers — sit above the chart so visitors know which side
          is inflow vs outflow without hovering. Color-coded to match the
          asset node fills and the link bands. */}
      <div
        className="flex items-center justify-between px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "var(--success)",
            }}
          />
          <span style={{ color: "var(--success)", fontWeight: 700 }}>
            Inflows
          </span>
          <span>→</span>
        </span>
        <span style={{ color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.15em" }}>
          Protocols
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>→</span>
          <span style={{ color: "var(--danger)", fontWeight: 700 }}>
            Outflows
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "var(--danger)",
            }}
          />
        </span>
      </div>

      <div className="relative chart-body" style={{ height: dynamicHeight }}>
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={chartData}
                nodePadding={14}
                nodeWidth={NODE_COLUMN_WIDTH}
                iterations={48}
                margin={{
                  top: 16,
                  right: LABEL_GUTTER,
                  bottom: 16,
                  left: LABEL_GUTTER,
                }}
                node={(nodeProps: any) => (
                  <SankeyNodeRender {...nodeProps} onHover={setHover} />
                )}
                link={(linkProps: any) => (
                  <SankeyLinkRender {...linkProps} onHover={setHover} />
                )}
              />
            </ResponsiveContainer>
            <HoverTooltip hover={hover} />
          </>
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
        <span>Constant prices · DefiLlama token quantities · &quot;Mixed&quot; = USD-only protocols</span>
      </div>
    </div>
  )
}
