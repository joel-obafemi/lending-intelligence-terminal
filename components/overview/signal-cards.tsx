import { TrendingUp, TrendingDown, Minus, AlertTriangle, Activity, Zap, PieChart, Coins } from "lucide-react"
import type { Signal } from "@/lib/signals"

interface Props {
  signals: Signal[]
}

const TONE_COLOR: Record<Signal["tone"], { accent: string; bg: string }> = {
  positive: { accent: "#10B981", bg: "rgba(16, 185, 129, 0.08)" },
  negative: { accent: "#FF4444", bg: "rgba(255, 68, 68, 0.08)" },
  notable: { accent: "#FF6B35", bg: "rgba(255, 107, 53, 0.08)" },
}

function IconFor({ iconKey, tone }: { iconKey?: Signal["iconKey"]; tone: Signal["tone"] }) {
  const color = TONE_COLOR[tone].accent
  const props = { size: 14, strokeWidth: 2.5, color }
  switch (iconKey) {
    case "liquidation":
      return <AlertTriangle {...props} />
    case "share":
      return <PieChart {...props} />
    case "rate":
      return <Activity {...props} />
    case "asset":
      return <Coins {...props} />
    case "trend":
    default:
      return <Zap {...props} />
  }
}

function DirectionArrow({ direction, tone }: { direction: Signal["direction"]; tone: Signal["tone"] }) {
  const color = TONE_COLOR[tone].accent
  const props = { size: 12, strokeWidth: 2.5, color }
  if (direction === "up") return <TrendingUp {...props} />
  if (direction === "down") return <TrendingDown {...props} />
  return <Minus {...props} />
}

export function SignalCards({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div
        className="text-[11px] text-text-muted border border-card-border rounded px-3 py-2"
        style={{ background: "var(--card-bg)" }}
      >
        Not enough history yet to compute week-over-week signals.
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
          Signals of the Week
        </h2>
        <span className="text-[10px] text-text-muted">
          Auto-generated from the past 7 days of data
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {signals.map((s, i) => {
          const t = TONE_COLOR[s.tone]
          return (
            <div
              key={`${s.label}-${i}`}
              className="tui-card bg-card-bg border border-card-border rounded-lg p-4 flex flex-col gap-1.5 relative overflow-hidden"
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-[2px]"
                style={{ backgroundColor: t.accent }}
              />
              <div className="flex items-start justify-between gap-2 pl-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.1em] leading-tight"
                  style={{ color: t.accent }}
                >
                  {s.label}
                </span>
                <span
                  className="flex-shrink-0 p-1 rounded"
                  style={{ background: t.bg }}
                >
                  <IconFor iconKey={s.iconKey} tone={s.tone} />
                </span>
              </div>
              <div className="pl-2 flex items-baseline gap-1.5">
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: "var(--text-primary)" }}
                >
                  {s.value}
                </span>
                <span
                  className="inline-flex items-center"
                  style={{ color: t.accent }}
                >
                  <DirectionArrow direction={s.direction} tone={s.tone} />
                </span>
              </div>
              <p
                className="pl-2 text-[11px] leading-snug"
                style={{ color: "var(--text-muted)" }}
              >
                {s.subtext}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
