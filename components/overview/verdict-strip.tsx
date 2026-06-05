/**
 * Verdict Strip — Zone 1 of the Sector Overview rebuild.
 *
 * Six cards in two rows of three, plus an auto-generated summary line:
 *
 *   Row 1 (scale)
 *     Total Supply       — TVL + Active Borrows, 30d sparkline + MoM/YoY $
 *     Active Borrows     — outstanding debt principal, 30d sparkline + MoM/YoY $
 *     Available Liquidity — DefiLlama net-liquidity TVL, 30d sparkline + MoM/YoY $
 *
 *   Row 2 (rates)
 *     Sector Utilization     — borrows ÷ supplied %, 30d sparkline + MoM pp
 *     Real Yield Spread      — stables yield vs T-bills, 30d sparkline + MoM pp
 *     Sector Take Rate       — annualized revenue ÷ TVL %
 *
 * Each card uses the shared MetricCard. Where MoM/YoY math doesn't apply
 * (Take Rate, currently no daily series), those pills just don't render.
 */
import {
  TrendingUp,
  TrendingDown,
  Banknote,
  Activity,
  Percent,
  Receipt,
} from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import { formatPercent } from "@/lib/utils"
import { PROTOCOLS } from "@/lib/protocols"
import { MethodologyTooltip } from "./methodology-tooltip"

interface RatePillProps {
  label: string
  /** Change expressed in pp (already a difference). Undefined hides the pill. */
  pp?: number
  format?: (v: number) => string
}

function ratePillContent({ pp, label, format }: RatePillProps): string | null {
  if (pp == null || !Number.isFinite(pp) || Math.abs(pp) < 0.005) return null
  const sign = pp > 0 ? "▲" : "▼"
  const fmt = format ?? ((v) => `${v.toFixed(2)} pp`)
  return `${sign} ${fmt(Math.abs(pp))} ${label}`
}

interface RateCardProps {
  label: string
  value: string
  caption?: string
  accent: string
  icon: React.ReactNode
  methodologyKey?: string
  /** Optional MoM / YoY deltas in pp (already differences, not ratios). */
  changeMoMPp?: number
  changeYoYPp?: number
  /** Optional 30-day sparkline. */
  sparkline?: Array<{ timestamp: number; value: number }>
  /** Bespoke pill formatter — defaults to `${v.toFixed(2)} pp`. */
  formatPp?: (v: number) => string
}

function RateCard({
  label,
  value,
  caption,
  accent,
  icon,
  methodologyKey,
  changeMoMPp,
  changeYoYPp,
  sparkline,
  formatPp,
}: RateCardProps) {
  const momPill = ratePillContent({ pp: changeMoMPp, label: "MoM", format: formatPp })
  const yoyPill = ratePillContent({ pp: changeYoYPp, label: "YoY", format: formatPp })
  const hasSpark = sparkline && sparkline.length > 1

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded-lg px-4 py-3 flex flex-col gap-1.5 relative">
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{ backgroundColor: accent }}
      />
      <div className="pl-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span style={{ color: accent }}>{icon}</span>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: accent }}
          >
            {label}
          </span>
          <MethodologyTooltip methodologyKey={methodologyKey} />
        </div>
        {hasSpark && (
          <div className="w-[80px] h-[24px]">
            <Sparkline data={sparkline!} accent={accent} />
          </div>
        )}
      </div>
      <div className="pl-2">
        <span className="text-lg font-semibold text-text-primary tabular-nums">{value}</span>
      </div>
      <div className="pl-2 flex flex-wrap gap-x-3 gap-y-0.5">
        {momPill && (
          <span
            className="text-[10px] font-medium tabular-nums"
            style={{ color: changeMoMPp! >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {momPill}
          </span>
        )}
        {yoyPill && (
          <span
            className="text-[10px] font-medium tabular-nums"
            style={{ color: changeYoYPp! >= 0 ? "var(--success)" : "var(--danger)" }}
          >
            {yoyPill}
          </span>
        )}
      </div>
      {caption && (
        <div className="pl-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {caption}
        </div>
      )}
    </div>
  )
}

/**
 * Tiny inline sparkline for the rate cards. The MetricCard already does this
 * for USD cards via Recharts; for the rate cards we just render an SVG
 * polyline (no axes / dots) to keep the bundle slim.
 */
function Sparkline({
  data,
  accent,
}: {
  data: Array<{ timestamp: number; value: number }>
  accent: string
}) {
  if (data.length < 2) return null
  const W = 80
  const H = 24
  const PAD = 2
  let min = Infinity
  let max = -Infinity
  for (const d of data) {
    if (d.value < min) min = d.value
    if (d.value > max) max = d.value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const range = Math.max(max - min, 1e-9)
  const stepX = (W - 2 * PAD) / Math.max(1, data.length - 1)
  const points = data
    .map((d, i) => {
      const x = PAD + i * stepX
      const y = H - PAD - ((d.value - min) / range) * (H - 2 * PAD)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={W} height={H}>
      <polyline points={points} fill="none" stroke={accent} strokeWidth={1.25} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// The main component.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  // Scale row
  totalSuppliedUsd: number
  totalSuppliedDeltas: {
    change24h: number
    changeMoM: number
    changeYoY: number
    sparkline: Array<{ timestamp: number; value: number }>
  }
  totalBorrowedUsd: number
  totalBorrowedDeltas: {
    change24h: number
    changeMoM: number
    changeYoY: number
    sparkline: Array<{ timestamp: number; value: number }>
  }
  availableLiquidityUsd: number
  availableLiquidityDeltas: {
    change24h: number
    changeMoM: number
    changeYoY: number
    sparkline: Array<{ timestamp: number; value: number }>
  }

  // Rate row
  utilizationPct: number
  utilizationDeltas: {
    changeMoM: number  // pp
    changeYoY: number  // pp
    sparkline: Array<{ timestamp: number; value: number }>
  }
  realYieldSpreadPct: number | null
  realYieldDeltas: {
    changeMoM: number  // pp
    changeYoY: number  // pp
    sparkline: Array<{ timestamp: number; value: number }>
  } | null
  takeRatePct: number
  /** Sector Loan-to-Deposit Ratio = totalBorrowed / totalSupplied × 100.
   *  Numerically identical to utilizationPct but surfaced separately for
   *  the depositor-efficiency framing §06.4 of Issue 002 uses. */
  sectorLdrPct: number
}

export function VerdictStrip({
  totalSuppliedUsd,
  totalSuppliedDeltas,
  totalBorrowedUsd,
  totalBorrowedDeltas,
  availableLiquidityUsd,
  availableLiquidityDeltas,
  utilizationPct,
  utilizationDeltas,
  realYieldSpreadPct,
  realYieldDeltas,
  takeRatePct,
  sectorLdrPct,
}: Props) {
  return (
    <div className="space-y-2">
      {/* Row 1 — scale */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Total Supply"
          value={totalSuppliedUsd}
          change24h={totalSuppliedDeltas.change24h}
          changeMoM={totalSuppliedDeltas.changeMoM}
          changeYoY={totalSuppliedDeltas.changeYoY}
          sparkline={totalSuppliedDeltas.sparkline}
          icon={<TrendingUp size={12} strokeWidth={2.5} />}
          accentColor="#10B981"
          caption={`deposits across ${PROTOCOLS.length} protocols`}
        />
        <MetricCard
          label="Active Borrows"
          value={totalBorrowedUsd}
          change24h={totalBorrowedDeltas.change24h}
          changeMoM={totalBorrowedDeltas.changeMoM}
          changeYoY={totalBorrowedDeltas.changeYoY}
          sparkline={totalBorrowedDeltas.sparkline}
          icon={<TrendingDown size={12} strokeWidth={2.5} />}
          accentColor="#EC4899"
          caption="outstanding debt principal"
        />
        <MetricCard
          label="Available Liquidity"
          value={availableLiquidityUsd}
          change24h={availableLiquidityDeltas.change24h}
          changeMoM={availableLiquidityDeltas.changeMoM}
          changeYoY={availableLiquidityDeltas.changeYoY}
          sparkline={availableLiquidityDeltas.sparkline}
          icon={<Banknote size={12} strokeWidth={2.5} />}
          accentColor="#B44AFF"
          caption="unborrowed deposits"
        />
      </div>
      {/* Row 2 — rates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <RateCard
          label="Sector Utilization"
          value={formatPercent(utilizationPct, 1)}
          caption="borrows ÷ supplied"
          accent="#FF6B35"
          icon={<Activity size={12} strokeWidth={2.5} />}
          methodologyKey="sector-utilization-headline"
          changeMoMPp={utilizationDeltas.changeMoM}
          changeYoYPp={utilizationDeltas.changeYoY}
          sparkline={utilizationDeltas.sparkline}
          formatPp={(v) => `${v.toFixed(1)} pp`}
        />
        <RateCard
          label="Sector LDR"
          value={formatPercent(sectorLdrPct, 2)}
          caption="loan ÷ deposit"
          accent="#F59E0B"
          icon={<Activity size={12} strokeWidth={2.5} />}
          methodologyKey="sector-utilization-headline"
          changeMoMPp={utilizationDeltas.changeMoM}
          changeYoYPp={utilizationDeltas.changeYoY}
          sparkline={utilizationDeltas.sparkline}
          formatPp={(v) => `${v.toFixed(2)} pp`}
        />
        <RateCard
          label="Real Yield Spread"
          value={
            realYieldSpreadPct != null
              ? `${realYieldSpreadPct >= 0 ? "+" : "−"}${Math.abs(realYieldSpreadPct).toFixed(2)} pp`
              : "—"
          }
          caption={
            realYieldSpreadPct == null
              ? undefined
              : realYieldSpreadPct >= 0
              ? "stables yield over T-bills"
              : "stables yield under T-bills"
          }
          accent="#0F9D58"
          icon={<Percent size={12} strokeWidth={2.5} />}
          methodologyKey="sector-real-yield-spread"
          changeMoMPp={realYieldDeltas?.changeMoM}
          changeYoYPp={realYieldDeltas?.changeYoY}
          sparkline={realYieldDeltas?.sparkline}
        />
        <RateCard
          label="Sector Take Rate"
          value={formatPercent(takeRatePct, 2)}
          caption="annualized rev ÷ TVL"
          accent="#5B7FFF"
          icon={<Receipt size={12} strokeWidth={2.5} />}
          methodologyKey="sector-take-rate"
        />
      </div>
    </div>
  )
}
