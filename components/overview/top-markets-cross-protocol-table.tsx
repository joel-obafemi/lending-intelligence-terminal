"use client"

import { useMemo, useState } from "react"
import { formatUSD, formatPercent } from "@/lib/utils"
import { PeriodPicker, type PeriodSelection } from "./period-picker"
import type { CrossProtocolMarket } from "@/lib/cross-protocol-markets"
import type {
  HistoricalBuckets,
  HistoricalBucket,
  HistoricalMarketRow,
} from "@/lib/historical-buckets"

interface Props {
  title: string
  /** Universe of markets pulled from the server (sorted by total supply). */
  markets: CrossProtocolMarket[]
  /** How many rows to show after sorting by selected mode. Default 10. */
  topN?: number
  /** Optional historical-bucket payload for the period picker. */
  historicalBuckets?: HistoricalBuckets
}

type Mode = "supply" | "borrow" | "utilization" | "supplyApy" | "borrowApy" | "tvl"
type Diversity = "all" | "perProtocol"

const MODE_LABEL: Record<Mode, string> = {
  supply: "Supply",
  borrow: "Borrows",
  utilization: "Utilization",
  supplyApy: "Supply APY",
  borrowApy: "Borrow APY",
  tvl: "Available Liquidity",
}

/** Modes available historically — APY/Util require the live Yields snapshot. */
const HISTORICAL_MODES: Mode[] = ["supply", "borrow", "tvl"]

/**
 * Asset / protocol pairs that earn an asterisk + footnote in the table.
 */
const FOOTNOTE_FOR: Record<string, string> = {
  "USDS|Spark": "SPK farming pool · 0% util by design (incentive program, not a borrow market).",
  "WEETH|Aave V3": "E-Mode collateral · borrowing disabled for most users by design.",
  "RSETH|Aave V3": "E-Mode collateral · borrowing disabled for most users by design.",
  "EZETH|Aave V3": "E-Mode collateral · borrowing disabled for most users by design.",
}

interface Row {
  poolId: string
  protocolSlug: string
  protocolName: string
  protocolColor: string
  asset: string
  poolMeta: string | null
  tvlUsd: number
  totalSupplyUsd: number
  totalBorrowUsd: number
  utilizationPct: number | null
  supplyApy: number | null
  borrowApy: number | null
}

function fromCurrent(m: CrossProtocolMarket): Row {
  return {
    poolId: m.poolId,
    protocolSlug: m.protocolSlug,
    protocolName: m.protocolName,
    protocolColor: m.protocolColor,
    asset: m.asset,
    poolMeta: m.poolMeta,
    tvlUsd: m.tvlUsd,
    totalSupplyUsd: m.totalSupplyUsd,
    totalBorrowUsd: m.totalBorrowUsd,
    utilizationPct: m.utilizationPct,
    supplyApy: m.supplyApy,
    borrowApy: m.borrowApy,
  }
}

/** Synthesize a Row from a historical (protocol, asset) bucket entry. APY +
 *  utilization stay null because we don't have history for those columns. */
function fromHistorical(h: HistoricalMarketRow): Row {
  return {
    poolId: `${h.protocolSlug}|${h.asset}`,
    protocolSlug: h.protocolSlug,
    protocolName: h.protocolName,
    protocolColor: h.protocolColor,
    asset: h.asset,
    poolMeta: null,
    tvlUsd: h.tvlUsd,
    totalSupplyUsd: h.totalSupplyUsd,
    totalBorrowUsd: h.totalBorrowUsd,
    utilizationPct: null,
    supplyApy: null,
    borrowApy: null,
  }
}

function footnoteFor(m: Row): string | undefined {
  return FOOTNOTE_FOR[`${m.asset.toUpperCase()}|${m.protocolName}`]
}

function valueFor(m: Row, mode: Mode): number {
  switch (mode) {
    case "supply":
      return m.totalSupplyUsd
    case "borrow":
      return m.totalBorrowUsd
    case "utilization":
      return m.utilizationPct ?? -Infinity
    case "tvl":
      return m.tvlUsd
    case "supplyApy":
      return m.supplyApy ?? -Infinity
    case "borrowApy":
      return m.borrowApy ?? -Infinity
  }
}

function findBucket(
  buckets: HistoricalBuckets | undefined,
  selection: PeriodSelection,
): HistoricalBucket | null {
  if (!buckets || selection.granularity === "current") return null
  const list =
    selection.granularity === "week"
      ? buckets.weeks
      : selection.granularity === "month"
      ? buckets.months
      : buckets.quarters
  return list.find((b) => b.id === selection.bucketId) ?? null
}

export function TopMarketsCrossProtocolTable({
  title,
  markets,
  topN = 10,
  historicalBuckets,
}: Props) {
  const [selection, setSelection] = useState<PeriodSelection>({
    granularity: "current",
    bucketId: "",
  })
  const [mode, setMode] = useState<Mode>("supply")
  const [diversity, setDiversity] = useState<Diversity>("all")

  const bucket = findBucket(historicalBuckets, selection)
  const isCurrent = selection.granularity === "current" || !bucket
  const universe: Row[] = useMemo(
    () =>
      isCurrent ? markets.map(fromCurrent) : bucket!.topMarkets.map(fromHistorical),
    [isCurrent, markets, bucket],
  )

  // If the user picks a historical period while sorting by an unsupported mode,
  // automatically fall back to "supply" so the table remains meaningful.
  const effectiveMode: Mode =
    !isCurrent && !HISTORICAL_MODES.includes(mode) ? "supply" : mode

  const rows = useMemo(() => {
    const sorted = [...universe].sort((a, b) => valueFor(b, effectiveMode) - valueFor(a, effectiveMode))
    const filtered =
      effectiveMode === "supplyApy"
        ? sorted.filter((m) => m.supplyApy != null)
        : effectiveMode === "borrowApy"
        ? sorted.filter((m) => m.borrowApy != null)
        : effectiveMode === "utilization"
        ? sorted.filter((m) => m.utilizationPct != null)
        : sorted
    if (diversity === "perProtocol") {
      const perProto: Record<string, number> = {}
      const out: Row[] = []
      for (const m of filtered) {
        const slug = m.protocolSlug
        if ((perProto[slug] ?? 0) >= 5) continue
        perProto[slug] = (perProto[slug] ?? 0) + 1
        out.push(m)
        if (out.length >= topN) break
      }
      return out
    }
    return filtered.slice(0, topN)
  }, [universe, effectiveMode, topN, diversity])

  const top = rows[0] ? valueFor(rows[0], effectiveMode) : 0
  const isApyMode = effectiveMode === "supplyApy" || effectiveMode === "borrowApy"
  const isUtilMode = effectiveMode === "utilization"
  const visibleFootnotes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of rows) {
      const note = footnoteFor(m)
      if (note) seen.set(`${m.asset.toUpperCase()}|${m.protocolName}`, note)
    }
    return [...seen.entries()].map(([k, note]) => ({ key: k, note }))
  }, [rows])

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {title}
          {!isCurrent && (
            <span
              className="ml-2 text-[10px]"
              style={{ color: "var(--text-muted)", fontWeight: 500, textTransform: "none", letterSpacing: 0 }}
            >
              · {bucket!.label}
            </span>
          )}
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodPicker
            buckets={historicalBuckets}
            value={selection}
            onChange={setSelection}
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              View
            </span>
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--card-border)",
                borderRadius: "4px",
                overflow: "hidden",
                background: "var(--background)",
              }}
            >
              <button
                onClick={() => setDiversity("all")}
                style={pillStyle(diversity === "all")}
              >
                Top 10 sector
              </button>
              <button
                onClick={() => setDiversity("perProtocol")}
                style={pillStyle(diversity === "perProtocol")}
              >
                Max 5 / protocol
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
              Sort by
            </span>
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--card-border)",
                borderRadius: "4px",
                overflow: "hidden",
                background: "var(--background)",
              }}
            >
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => {
                const disabled = !isCurrent && !HISTORICAL_MODES.includes(m)
                return (
                  <button
                    key={m}
                    onClick={() => !disabled && setMode(m)}
                    disabled={disabled}
                    title={disabled ? "APY / Utilization not available historically" : undefined}
                    style={pillStyle(effectiveMode === m, disabled)}
                  >
                    {MODE_LABEL[m]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>#</th>
              <th>Asset</th>
              <th>Protocol</th>
              <th className="text-right">Total Supply</th>
              <th className="text-right">Available Liquidity</th>
              <th className="text-right">Borrowed</th>
              <th className="text-right">Util</th>
              <th className="text-right">Supply APY</th>
              <th className="text-right">Borrow APY</th>
              <th style={{ width: "16%" }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => {
              const v = valueFor(m, effectiveMode)
              const barWidth = top > 0 ? `${(v / top) * 100}%` : "0%"
              return (
                <tr key={m.poolId}>
                  <td style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>
                    {m.asset}
                    {footnoteFor(m) && (
                      <span
                        className="ml-1 text-[10px]"
                        style={{ color: "var(--accent-yellow)" }}
                        title={footnoteFor(m)}
                      >
                        *
                      </span>
                    )}
                    {m.poolMeta && (
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {m.poolMeta}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1.5" style={{ color: m.protocolColor }}>
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: m.protocolColor }}
                      />
                      {m.protocolName}
                    </span>
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: effectiveMode === "supply" ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {formatUSD(m.totalSupplyUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: effectiveMode === "tvl" ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {formatUSD(m.tvlUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{ color: effectiveMode === "borrow" ? "var(--text-primary)" : "var(--text-muted)" }}
                  >
                    {formatUSD(m.totalBorrowUsd)}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{
                      color: effectiveMode === "utilization" ? "var(--text-primary)" : undefined,
                      fontWeight: effectiveMode === "utilization" ? 600 : 400,
                    }}
                  >
                    {m.utilizationPct != null ? formatPercent(m.utilizationPct, 1) : "—"}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{
                      color:
                        effectiveMode === "supplyApy" ? "var(--text-primary)" : "var(--success)",
                      fontWeight: effectiveMode === "supplyApy" ? 600 : 400,
                    }}
                  >
                    {m.supplyApy != null ? formatPercent(m.supplyApy, 2) : "—"}
                  </td>
                  <td
                    className="text-right tabular-nums"
                    style={{
                      color:
                        effectiveMode === "borrowApy" ? "var(--text-primary)" : "var(--danger)",
                      fontWeight: effectiveMode === "borrowApy" ? 600 : 400,
                    }}
                  >
                    {m.borrowApy != null ? formatPercent(m.borrowApy, 2) : "—"}
                  </td>
                  <td>
                    <div
                      style={{
                        width: barWidth,
                        height: "6px",
                        background: m.protocolColor,
                        opacity: 0.6,
                        borderRadius: "2px",
                      }}
                      title={
                        isApyMode || isUtilMode
                          ? formatPercent(v as number, 2)
                          : formatUSD(v as number)
                      }
                    />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", color: "var(--text-muted)" }}>
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!isCurrent && (
        <div
          className="px-4 py-2 text-[10px]"
          style={{
            background: "var(--panel-header)",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          Supply APY, Borrow APY, and Utilization aren&apos;t available historically across all four protocols and render as <span style={{ color: "var(--text-secondary)" }}>—</span>. Switch the period to <span style={{ color: "var(--text-secondary)" }}>Current</span> to see them.
        </div>
      )}
      {visibleFootnotes.length > 0 && (
        <div
          className="px-4 py-2 text-[10px] space-y-0.5"
          style={{
            background: "var(--panel-header)",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          {visibleFootnotes.map(({ key, note }) => (
            <div key={key}>
              <span style={{ color: "var(--accent-yellow)", marginRight: 4 }}>*</span>
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function pillStyle(active: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "4px 10px",
    fontSize: "11px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
    fontFamily: "inherit",
    backgroundColor: active ? "var(--card-border)" : "transparent",
    color: disabled
      ? "var(--text-muted)"
      : active
      ? "var(--text-primary)"
      : "var(--text-muted)",
    opacity: disabled ? 0.5 : 1,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  }
}
