"use client"

import { useRef } from "react"
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useThemeColors } from "../theme-provider"
import { ChartActions } from "../chart-actions"

interface Props {
  /** Per-utilization sample points. Utilization is 0-1; APYs are PERCENT. */
  curve: Array<{ utilization: number; supplyApy: number; borrowApy: number }>
  /** Current live utilization (0-100) for the marker line. */
  currentUtilizationPct: number | null
  /** Kink utilization (0-1). Renders as a dashed vertical reference line. */
  kink: number
}

function pct(v: number, d = 1): string {
  return `${v.toFixed(d)}%`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  // payload entries are the rendered lines; pull values by dataKey.
  const supplyEntry = payload.find((p: any) => p.dataKey === "supplyApy")
  const borrowEntry = payload.find((p: any) => p.dataKey === "borrowApy")
  return (
    <div className="custom-tooltip min-w-[160px]">
      <p className="text-xs text-text-muted mb-1.5">Util {pct((label ?? 0) * 100, 1)}</p>
      <div className="space-y-1">
        {borrowEntry && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FF8A3D" }} />
              <span className="text-xs text-text-secondary">Borrow Rate</span>
            </div>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {pct(Number(borrowEntry.value), 2)}
            </span>
          </div>
        )}
        {supplyEntry && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#10B981" }} />
              <span className="text-xs text-text-secondary">Supply Rate</span>
            </div>
            <span className="text-xs font-medium text-text-primary tabular-nums">
              {pct(Number(supplyEntry.value), 2)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function MarketIrmCurve({ curve, currentUtilizationPct, kink }: Props) {
  const colors = useThemeColors()
  const cardRef = useRef<HTMLDivElement>(null)
  const data = curve.map((p) => ({
    utilization: p.utilization,
    supplyApy: p.supplyApy,
    borrowApy: p.borrowApy,
  }))
  // Cap the y-axis at the borrow APY at 100% util so the slope-2 spike
  // doesn't pancake the in-band activity into a flat line.
  const yMax = Math.max(...data.map((d) => d.borrowApy), 0)

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
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Interest Rate Curve
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#FF8A3D" }} />
              <span>Borrow Rate</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#10B981" }} />
              <span>Supply Rate</span>
            </div>
          </div>
          <ChartActions cardRef={cardRef} title="Interest Rate Curve" />
        </div>
      </div>
      <div className="relative p-4 h-[260px] chart-body">
        <ResponsiveContainer width="100%" height="100%">
          {/* `top: 28` reserves headroom for two stacked reference-line labels
              (e.g. when current util sits right on the kink, both labels live
              above the chart and need vertical room). */}
          <LineChart data={data} margin={{ top: 28, right: 5, left: 5, bottom: 5 }}>
            <XAxis
              dataKey="utilization"
              type="number"
              domain={[0, 1]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: colors.textMuted }}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              width={50}
              domain={[0, Math.ceil(yMax / 25) * 25]}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: colors.textMuted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {(() => {
              // Compute label positions so neither label clips at the edges
              // and they don't stack on top of each other when current ≈ kink.
              const currentX = currentUtilizationPct != null ? currentUtilizationPct / 100 : null
              // textAnchor: "start" pushes label right of the line, "end" pushes left,
              // "middle" centers. Use the directional one when the line is near
              // an axis; default to centered otherwise.
              const anchorFor = (x: number): "start" | "middle" | "end" =>
                x <= 0.08 ? "start" : x >= 0.92 ? "end" : "middle"
              // When kink and current are within 5% of each other their "top"
              // labels would overlap. Push the second label up by `dy: -12`
              // so it sits a row higher.
              const close =
                currentX != null && Math.abs(currentX - kink) < 0.05
              return (
                <>
                  {/* Kink marker — dashed amber vertical line where slope changes. */}
                  <ReferenceLine
                    x={kink}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{
                      value: `Kink ${(kink * 100).toFixed(0)}%`,
                      position: "top",
                      fill: "#F59E0B",
                      fontSize: 10,
                      textAnchor: anchorFor(kink),
                    }}
                  />
                  {/* Current util marker — dashed green vertical line. */}
                  {currentX != null && (
                    <ReferenceLine
                      x={currentX}
                      stroke="#10B981"
                      strokeDasharray="2 2"
                      strokeWidth={1}
                      label={{
                        value: `Current ${currentUtilizationPct!.toFixed(1)}%`,
                        position: "top",
                        fill: "#10B981",
                        fontSize: 10,
                        textAnchor: anchorFor(currentX),
                        dy: close ? -14 : 0,
                      }}
                    />
                  )}
                </>
              )
            })()}
            <Line
              type="monotone"
              dataKey="borrowApy"
              stroke="#FF8A3D"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="supplyApy"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
