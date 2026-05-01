/**
 * Safety Module Status — Aave V3 protocol-specific lens, Module D.
 *
 * Three stat cells in one row:
 *   - SM size (USD): AAVE held by stkAAVE × AAVE/USD price
 *   - Max slashable: SM size × on-chain max slash percentage
 *   - Backing ratio: AAVE balance ÷ stkAAVE supply (1.00 = full backing)
 *
 * Server component — pure shape over a precomputed `SafetyModuleStatus`.
 */
import { Shield } from "lucide-react"
import { formatUSD, formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import {
  SAFETY_MODULE_MAX_SLASH_PCT,
  type SafetyModuleStatus,
} from "@/lib/aave-safety-module"

interface Props {
  status: SafetyModuleStatus
  protocolColor: string
}

interface CellProps {
  label: string
  value: string
  caption: string
}

function Cell({ label, value, caption }: CellProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-lg font-semibold tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </span>
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        {caption}
      </span>
    </div>
  )
}

function fmtAaveAmount(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—"
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M AAVE`
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K AAVE`
  return `${v.toFixed(0)} AAVE`
}

function backingTone(ratio: number): "good" | "neutral" | "warn" {
  // Healthy SMs sit at 1.0 backing (1:1 AAVE:stkAAVE). Drift below 0.97
  // would be a real signal — usually that means a recent slash event.
  if (ratio >= 0.99) return "good"
  if (ratio >= 0.95) return "neutral"
  return "warn"
}

const TONE_COLOR: Record<string, string> = {
  good: "var(--success)",
  neutral: "var(--text-muted)",
  warn: "var(--accent-yellow)",
}

export function AaveSafetyModule({ status, protocolColor }: Props) {
  const tone = backingTone(status.backingRatio)
  const insight =
    status.smTotalUsd != null
      ? `${formatUSD(status.smTotalUsd)} of AAVE is staked in the Safety Module — up to ${formatUSD(
          status.maxSlashableUsd ?? 0,
        )} (${SAFETY_MODULE_MAX_SLASH_PCT}%) is slashable to cover protocol bad debt.`
      : `${fmtAaveAmount(status.aaveBacking)} is staked in the Safety Module. Up to ${SAFETY_MODULE_MAX_SLASH_PCT}% is slashable to cover protocol bad debt.`

  return (
    <div className="space-y-2">
      <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
        <div
          className="border-b border-card-border flex items-center justify-between"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            <Shield size={12} strokeWidth={2.5} style={{ color: protocolColor }} />
            Safety Module
            <MethodologyTooltip methodologyKey="aave-safety-module" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            stkAAVE · live on-chain
          </span>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
          style={{ borderColor: "var(--card-border)" }}
        >
          <Cell
            label="SM Size"
            value={status.smTotalUsd != null ? formatUSD(status.smTotalUsd) : fmtAaveAmount(status.aaveBacking)}
            caption={
              status.aavePriceUsd != null
                ? `${fmtAaveAmount(status.aaveBacking)} × $${status.aavePriceUsd.toFixed(2)}`
                : "AAVE price unavailable — USD not shown"
            }
          />
          <Cell
            label="Max Slashable"
            value={
              status.maxSlashableUsd != null
                ? formatUSD(status.maxSlashableUsd)
                : `${SAFETY_MODULE_MAX_SLASH_PCT}% of SM`
            }
            caption={`${SAFETY_MODULE_MAX_SLASH_PCT}% on-chain governance cap`}
          />
          <div className="flex flex-col gap-1 px-4 py-3">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--text-muted)" }}
            >
              Backing Ratio
            </span>
            <span
              className="text-lg font-semibold tabular-nums"
              style={{ color: TONE_COLOR[tone] }}
            >
              {formatPercent(status.backingRatio * 100, 2)}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              AAVE balance ÷ stkAAVE supply · 100% = full backing
            </span>
          </div>
        </div>
      </div>
      <p
        className="text-[12px] leading-relaxed px-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {insight}
      </p>
    </div>
  )
}
