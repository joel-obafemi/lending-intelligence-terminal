"use client"

/**
 * Net Supply Flows — Sankey rendering of the per-asset → protocol →
 * per-asset flow over the active period.
 *
 * Three columns:
 *   LEFT     asset nodes contributing net inflow (green)
 *   MIDDLE   protocols with net total (signed, color-coded)
 *   RIGHT    asset nodes contributing net outflow (red)
 *
 * Two scoping controls in the header:
 *   - W / M / Q toggle picks the window length.
 *   - When M or Q is active, a period picker scrubs between calendar
 *     months / quarters ("May 2026", "Q1 2026", ...). W stays as
 *     "trailing 7 days" since "this week so far" is the natural read.
 *
 * Column headers above the chart label the inflow / outflow split so the
 * direction is obvious without hovering. Hover-state tooltip is rendered
 * by the component (Recharts' Tooltip strips Sankey-node custom fields).
 */

import { useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ResponsiveContainer, Sankey } from "recharts"
import { MethodologyTooltip } from "./methodology-tooltip"
import { ChartActions } from "../chart-actions"
import type { NetFlowsSankeyData, SankeyNode } from "@/lib/net-flows-sankey"
import type { NetFlowsSankeyPeriod } from "@/lib/overview"

type WindowKey = "week" | "month" | "quarter"

interface Props {
  title: string
  windows: {
    week: NetFlowsSankeyData
    monthly: NetFlowsSankeyPeriod[]
    quarterly: NetFlowsSankeyPeriod[]
  }
  methodologyKey?: string
}

const WINDOW_LABEL: Record<WindowKey, string> = { week: "W", month: "M", quarter: "Q" }

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

function clampLabel(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name
  return name.slice(0, maxChars - 1) + "…"
}

interface HoverPayload {
  kind: "node" | "link"
  node?: SankeyNode
  link?: { source: SankeyNode; target: SankeyNode; value: number }
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
    body = (
      <>
        <p className="text-xs text-text-muted mb-1.5">
          {source.name ?? "?"} → {target.name ?? "?"}
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

interface PeriodPickerProps {
  periods: NetFlowsSankeyPeriod[]
  activeIndex: number
  onChange: (next: number) => void
}

function PeriodPicker({ periods, activeIndex, onChange }: PeriodPickerProps) {
  // Newest period is index 0; "go back" means moving to a larger index.
  const active = periods[activeIndex]
  if (!active) return null
  const canGoNewer = activeIndex > 0
  const canGoOlder = activeIndex < periods.length - 1
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "1px solid var(--card-border)",
        borderRadius: 4,
        background: "var(--background)",
        padding: "2px 4px",
      }}
    >
      <button
        type="button"
        onClick={() => canGoOlder && onChange(activeIndex + 1)}
        disabled={!canGoOlder}
        aria-label="Older period"
        style={{
          background: "transparent",
          border: "none",
          color: canGoOlder ? "var(--text-muted)" : "var(--card-border)",
          cursor: canGoOlder ? "pointer" : "not-allowed",
          padding: "2px 2px",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ChevronLeft size={12} />
      </button>
      <select
        value={active.key}
        onChange={(e) => {
          const idx = periods.findIndex((p) => p.key === e.target.value)
          if (idx >= 0) onChange(idx)
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 4px",
          cursor: "pointer",
          outline: "none",
          appearance: "none",
          letterSpacing: "0.03em",
        }}
      >
        {periods.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
            {p.isCurrent ? " (current)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => canGoNewer && onChange(activeIndex - 1)}
        disabled={!canGoNewer}
        aria-label="Newer period"
        style={{
          background: "transparent",
          border: "none",
          color: canGoNewer ? "var(--text-muted)" : "var(--card-border)",
          cursor: canGoNewer ? "pointer" : "not-allowed",
          padding: "2px 2px",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <ChevronRight size={12} />
      </button>
    </div>
  )
}

export function NetFlowsSankey({ title, windows, methodologyKey }: Props) {
  const [window, setWindow] = useState<WindowKey>("week")
  // Monthly / quarterly picker index. 0 = current period.
  const [monthIndex, setMonthIndex] = useState(0)
  const [quarterIndex, setQuarterIndex] = useState(0)
  const [hover, setHover] = useState<HoverPayload | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Pick the active Sankey snapshot based on the toggle + picker state.
  const { data, contextLabel } = useMemo(() => {
    if (window === "week") {
      return { data: windows.week, contextLabel: "7 days" }
    }
    if (window === "month") {
      const period = windows.monthly[monthIndex] ?? windows.monthly[0]
      return { data: period?.sankey, contextLabel: period?.label ?? "" }
    }
    const qp = windows.quarterly[quarterIndex] ?? windows.quarterly[0]
    return { data: qp?.sankey, contextLabel: qp?.label ?? "" }
  }, [window, windows, monthIndex, quarterIndex])

  const chartData = useMemo(
    () => ({
      nodes: (data?.nodes ?? []).map((n) => ({ ...n, name: n.name })),
      links: (data?.links ?? []).map((l) => ({
        source: l.source,
        target: l.target,
        value: l.value,
      })),
    }),
    [data],
  )

  const hasData = !!data && data.nodes.length > 0 && data.links.length > 0
  const sideCount = data
    ? Math.max(
        data.nodes.filter((n) => n.kind === "asset_in").length,
        data.nodes.filter((n) => n.kind === "asset_out").length,
      )
    : 0
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

          {/* W has no picker — period is just "7 days". M and Q expose a
              calendar-aligned picker so the active snapshot can be May,
              April, March, etc. */}
          {window === "month" && windows.monthly.length > 0 && (
            <PeriodPicker
              periods={windows.monthly}
              activeIndex={monthIndex}
              onChange={setMonthIndex}
            />
          )}
          {window === "quarter" && windows.quarterly.length > 0 && (
            <PeriodPicker
              periods={windows.quarterly}
              activeIndex={quarterIndex}
              onChange={setQuarterIndex}
            />
          )}
          {window === "week" && (
            <span
              className="text-[10px] uppercase tracking-[0.08em]"
              style={{ color: "var(--text-muted)" }}
            >
              {contextLabel}
            </span>
          )}
          <ChartActions cardRef={cardRef} title={`${title} · ${contextLabel}`} />
        </div>
      </div>

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
            No net flows recorded for {contextLabel || "the active period"}.
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
          {data
            ? `Net inflow ${formatCompactUsd(data.totalInflowUsd)} · Net outflow ${formatCompactUsd(data.totalOutflowUsd)}`
            : ""}
        </span>
        <span>Constant prices · DefiLlama token quantities · &quot;Mixed&quot; = USD-only protocols</span>
      </div>
    </div>
  )
}
