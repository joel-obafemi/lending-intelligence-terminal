"use client"

import { useMemo, useState } from "react"
import { PROTOCOLS, PROTOCOL_BY_SLUG } from "@/lib/protocols"
import { MAJOR_ASSETS } from "@/lib/rates"
import { classifyAsset } from "@/lib/assets"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { RateMatrixCell } from "@/lib/rates"

interface Props {
  title: string
  cells: RateMatrixCell[]
}

type RateMode = "headline" | "effective"
type MetricMode = "supply" | "borrow" | "both"

interface FamilyConfig {
  label: string
  tagline: string
}

const FAMILIES: FamilyConfig[] = [
  { label: "Stablecoins", tagline: "USDC · USDT · DAI · USDS · GHO" },
  {
    label: "ETH + LST / LRT",
    tagline: "WETH · WSTETH · WEETH and the wrapped-ETH family (BTC excluded)",
  },
  { label: "BTC", tagline: "WBTC · CBBTC" },
]

const BTC_SYMBOLS = new Set(["WBTC", "CBBTC", "TBTCV2", "TBTC", "LBTC"])
const ETH_SYMBOLS = new Set(["WETH", "ETH"])

function familyOf(symbol: string): string {
  if (BTC_SYMBOLS.has(symbol.toUpperCase())) return "BTC"
  const t = classifyAsset(symbol)
  if (t === "stable") return "Stablecoins"
  if (t === "native" && ETH_SYMBOLS.has(symbol.toUpperCase())) return "ETH + LST / LRT"
  if (t === "lst" || t === "lrt") return "ETH + LST / LRT"
  if (t === "native") return "BTC"
  return "ETH + LST / LRT"
}

function fmtPct(v: number | null) {
  return v == null || !Number.isFinite(v) ? (
    <span style={{ color: "var(--text-muted)" }}>—</span>
  ) : (
    <span className="tabular-nums">{formatPercent(v, 2)}</span>
  )
}

/** Heat color for a utilization 0..100 — cool/blue at low, warm/orange at
 *  high. Used as the fill color of the per-cell utilization bar so a
 *  reader can scan utilization without reading the number.
 */
function utilColor(utilPct: number): string {
  if (utilPct >= 95) return "#EF4444" // red — extreme
  if (utilPct >= 85) return "#F97316" // orange — hot
  if (utilPct >= 65) return "#EAB308" // yellow — healthy
  if (utilPct >= 30) return "#10B981" // green — comfortable
  return "#3B82F6" // blue — cold (low demand)
}

export function RateMatrixTable({ title, cells }: Props) {
  const [mode, setMode] = useState<RateMode>("headline")
  const [metric, setMetric] = useState<MetricMode>("supply")

  const byFamily = useMemo(() => {
    const out = new Map<string, Map<string, Map<string, RateMatrixCell>>>()
    for (const c of cells) {
      const fam = familyOf(c.symbol)
      const famMap = out.get(fam) ?? new Map<string, Map<string, RateMatrixCell>>()
      const row = famMap.get(c.symbol) ?? new Map<string, RateMatrixCell>()
      row.set(c.protocolSlug, c)
      famMap.set(c.symbol, row)
      out.set(fam, famMap)
    }
    return out
  }, [cells])

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
        style={{ padding: "10px 16px" }}
      >
        <span className="flex items-center gap-3 flex-wrap">
          <span
            className="text-accent"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {title}
          </span>
          <span className="text-[10px] text-text-muted">
            {metric === "supply"
              ? "Supply APY · hover for 30d avg, spread, util, TVL"
              : metric === "borrow"
              ? "Borrow APY · hover for 30d avg, spread, util, TVL"
              : "Supply / Borrow APY · current with 30d-avg"}
          </span>
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <MetricToggle metric={metric} setMetric={setMetric} />
          <ModeToggle mode={mode} setMode={setMode} />
        </div>
      </div>
      <div className="space-y-0">
        {FAMILIES.map((fam) => {
          const familyMap = byFamily.get(fam.label)
          if (!familyMap) return null
          const orderedAssets = MAJOR_ASSETS.filter((a) => familyMap.has(a))
          if (orderedAssets.length === 0) return null
          return (
            <FamilySection
              key={fam.label}
              family={fam}
              orderedAssets={orderedAssets}
              familyMap={familyMap}
              mode={mode}
              metric={metric}
            />
          )
        })}
      </div>
    </div>
  )
}

function MetricToggle({
  metric,
  setMetric,
}: {
  metric: MetricMode
  setMetric: (m: MetricMode) => void
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--card-border)",
        borderRadius: "4px",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {(
        [
          { value: "supply" as const, label: "Supply" },
          { value: "borrow" as const, label: "Borrow" },
          { value: "both" as const, label: "Both" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          onClick={() => setMetric(opt.value)}
          style={{
            padding: "4px 10px",
            fontSize: "10px",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
            fontFamily: "inherit",
            backgroundColor: metric === opt.value ? "var(--card-border)" : "transparent",
            color: metric === opt.value ? "var(--text-primary)" : "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
          title={
            opt.value === "supply"
              ? "Show only Supply APY per cell — clearest view for depositors."
              : opt.value === "borrow"
              ? "Show only Borrow APY per cell — clearest view for borrowers."
              : "Show both Supply and Borrow APY plus 30d / spread / util inline (dense view)."
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: RateMode
  setMode: (m: RateMode) => void
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--card-border)",
        borderRadius: "4px",
        overflow: "hidden",
        background: "var(--background)",
      }}
    >
      {(
        [
          { value: "headline" as const, label: "Headline" },
          { value: "effective" as const, label: "Reward-adj." },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          onClick={() => setMode(opt.value)}
          style={{
            padding: "4px 10px",
            fontSize: "10px",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
            fontFamily: "inherit",
            backgroundColor: mode === opt.value ? "var(--card-border)" : "transparent",
            color: mode === opt.value ? "var(--text-primary)" : "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
          title={
            opt.value === "effective"
              ? "Effective APY: supply = base + reward incentives, borrow = base − reward incentives. Re-ranks the Best columns by net effective rate."
              : "Headline APY: base supply / borrow rate without incentive token rewards layered on."
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function FamilySection({
  family,
  orderedAssets,
  familyMap,
  mode,
  metric,
}: {
  family: FamilyConfig
  orderedAssets: readonly string[]
  familyMap: Map<string, Map<string, RateMatrixCell>>
  mode: RateMode
  metric: MetricMode
}) {
  return (
    <div className="border-t border-card-border first:border-t-0">
      <div
        className="flex items-center gap-3 flex-wrap"
        style={{ padding: "8px 16px", background: "var(--card-hover)" }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.12em] font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          {family.label}
        </span>
        <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
          {family.tagline}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              {PROTOCOLS.map((p) => (
                <th key={p.slug} className="text-right">
                  <span style={{ color: p.color }}>{p.name}</span>
                </th>
              ))}
              {(metric === "supply" || metric === "both") && (
                <th className="text-right">Best Supply</th>
              )}
              {(metric === "borrow" || metric === "both") && (
                <th className="text-right">Best Borrow</th>
              )}
            </tr>
          </thead>
          <tbody>
            {orderedAssets.map((sym) => (
              <Row
                key={sym}
                symbol={sym}
                row={familyMap.get(sym)!}
                mode={mode}
                metric={metric}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({
  symbol,
  row,
  mode,
  metric,
}: {
  symbol: string
  row: Map<string, RateMatrixCell>
  mode: RateMode
  metric: MetricMode
}) {
  function supplyValue(c: RateMatrixCell): number | null {
    if (mode === "effective") return c.supplyApyEffective ?? c.supplyApy
    return c.supplyApy
  }
  function borrowValue(c: RateMatrixCell): number | null {
    if (mode === "effective") return c.borrowApyEffective ?? c.borrowApy
    return c.borrowApy
  }

  const supplies: Array<{ slug: string; v: number }> = []
  const borrows: Array<{ slug: string; v: number }> = []
  for (const p of PROTOCOLS) {
    const c = row.get(p.slug)
    if (!c) continue
    const sv = supplyValue(c)
    const bv = borrowValue(c)
    if (sv != null && Number.isFinite(sv)) supplies.push({ slug: p.slug, v: sv })
    if (bv != null && Number.isFinite(bv)) borrows.push({ slug: p.slug, v: bv })
  }
  const bestSupply = [...supplies].sort((a, b) => b.v - a.v)[0]
  const bestBorrow = [...borrows].sort((a, b) => a.v - b.v)[0]

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{symbol}</td>
      {PROTOCOLS.map((p) => {
        const cell = row.get(p.slug)
        return (
          <td key={p.slug} className="text-right">
            <CellContent
              cell={cell}
              mode={mode}
              metric={metric}
              supplyValue={cell ? supplyValue(cell) : null}
              borrowValue={cell ? borrowValue(cell) : null}
            />
          </td>
        )
      })}
      {(metric === "supply" || metric === "both") && (
        <td className="text-right">
          {bestSupply ? (
            <span style={{ color: PROTOCOL_BY_SLUG[bestSupply.slug]?.color }} className="tabular-nums">
              {formatPercent(bestSupply.v, 2)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </td>
      )}
      {(metric === "borrow" || metric === "both") && (
        <td className="text-right">
          {bestBorrow ? (
            <span style={{ color: PROTOCOL_BY_SLUG[bestBorrow.slug]?.color }} className="tabular-nums">
              {formatPercent(bestBorrow.v, 2)}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </td>
      )}
    </tr>
  )
}

/** Cell-content renderer split out so we can branch cleanly on `metric`
 *  without nesting deeply inside the Row. In single-metric mode the cell
 *  is one large rate with a utilization heatbar and a hover tooltip
 *  carrying 30d/spread/util/TVL. In "both" mode it falls back to the
 *  legacy dense layout. */
function CellContent({
  cell,
  mode,
  metric,
  supplyValue,
  borrowValue,
}: {
  cell: RateMatrixCell | undefined
  mode: RateMode
  metric: MetricMode
  supplyValue: number | null
  borrowValue: number | null
}) {
  if (!cell) {
    return (
      <div className="flex items-center justify-end gap-1">
        <span style={{ color: "var(--text-muted)" }}>—</span>
      </div>
    )
  }

  // Hover tooltip is identical across modes — surfaces the 30d / spread /
  // util / TVL facts that used to live inline.
  const tooltipLines: string[] = []
  if (cell.supplyApy30d != null) {
    tooltipLines.push(`Supply 30d avg: ${formatPercent(cell.supplyApy30d, 2)}`)
  }
  if (cell.borrowApy30d != null) {
    tooltipLines.push(`Borrow 30d avg: ${formatPercent(cell.borrowApy30d, 2)}`)
  }
  if (cell.spread != null) {
    tooltipLines.push(
      `Spread (borrow − supply): ${cell.spread >= 0 ? "+" : ""}${cell.spread.toFixed(2)}%`,
    )
  }
  if (cell.utilization != null) {
    tooltipLines.push(`Utilization: ${cell.utilization.toFixed(1)}%`)
  }
  if (cell.totalSupplyUsd != null) {
    tooltipLines.push(`Total supply: ${formatUSD(cell.totalSupplyUsd)}`)
  }
  if (cell.totalBorrowUsd != null) {
    tooltipLines.push(`Total borrow: ${formatUSD(cell.totalBorrowUsd)}`)
  }
  const tooltipText = tooltipLines.join("\n")

  // ─── Legacy dense layout when "both" is selected ──────────────────────
  if (metric === "both") {
    const supplyReward = cell.supplyApyReward ?? 0
    const borrowReward = cell.borrowApyReward ?? 0
    const hasRewards = supplyReward > 0 || borrowReward > 0
    return (
      <>
        <div className="flex items-center justify-end gap-2">
          <span
            title={
              mode === "effective"
                ? "Supply APY (effective = base + rewards)"
                : "Supply APY base"
            }
            className="flex items-center gap-1"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--success)" }}
            />
            {fmtPct(supplyValue)}
          </span>
          <span className="text-text-muted">/</span>
          <span
            title={
              mode === "effective"
                ? "Borrow APY (effective = base − rewards)"
                : "Borrow APY base"
            }
            className="flex items-center gap-1"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--danger)" }}
            />
            {fmtPct(borrowValue)}
          </span>
        </div>
        {hasRewards && mode === "headline" && (
          <div
            className="text-[9px] tabular-nums"
            style={{ color: "var(--accent-orange)" }}
          >
            +rew {supplyReward > 0 ? `+${supplyReward.toFixed(2)}%` : "—"}
            {" / "}
            {borrowReward > 0 ? `−${borrowReward.toFixed(2)}%` : "—"}
          </div>
        )}
        <div className="text-[9px] text-text-muted tabular-nums">
          {cell.supplyApy30d != null || cell.borrowApy30d != null ? (
            <span title="Trailing 30-day average">
              30d:{" "}
              {cell.supplyApy30d != null ? formatPercent(cell.supplyApy30d, 2) : "—"}
              {" / "}
              {cell.borrowApy30d != null ? formatPercent(cell.borrowApy30d, 2) : "—"}
            </span>
          ) : null}
          {cell.spread != null && (
            <span className="ml-2" title="Borrow APY minus Supply APY">
              Spr {cell.spread >= 0 ? "+" : ""}
              {cell.spread.toFixed(2)}%
            </span>
          )}
        </div>
        {cell.utilization != null && (
          <div className="text-[9px] text-text-muted tabular-nums">
            {cell.utilization.toFixed(0)}% util
            {cell.totalSupplyUsd ? ` · ${formatUSD(cell.totalSupplyUsd)}` : ""}
          </div>
        )}
        {cell.protocolSlug === "morpho-blue" &&
          cell.totalSupplyUsd != null &&
          cell.borrowApy == null && (
            <div className="text-[9px] text-text-muted">Blended across vaults</div>
          )}
      </>
    )
  }

  // ─── Single-metric mode: one big rate + util heatbar + hover tooltip ─
  const value = metric === "supply" ? supplyValue : borrowValue
  const reward =
    metric === "supply" ? cell.supplyApyReward ?? 0 : cell.borrowApyReward ?? 0
  const rewardSign = metric === "supply" ? "+" : "−"
  const dotColor = metric === "supply" ? "var(--success)" : "var(--danger)"
  const utilPct =
    cell.utilization != null && Number.isFinite(cell.utilization)
      ? Math.max(0, Math.min(100, cell.utilization))
      : null

  // Morpho doesn't publish a borrow APY at the protocol level — flag this
  // explicitly in borrow mode so a reader doesn't read the missing value
  // as "rate = 0%".
  const morphoBorrowBlended =
    metric === "borrow" &&
    cell.protocolSlug === "morpho-blue" &&
    cell.borrowApy == null &&
    cell.totalSupplyUsd != null

  return (
    <div
      title={tooltipText || undefined}
      style={{ display: "flex", flexDirection: "column", gap: "3px", alignItems: "flex-end" }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        {morphoBorrowBlended ? (
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            blended
          </span>
        ) : (
          <span
            className="tabular-nums"
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: value != null ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {value != null && Number.isFinite(value) ? formatPercent(value, 2) : "—"}
          </span>
        )}
      </div>
      {reward > 0 && mode === "headline" && (
        <div
          className="text-[9px] tabular-nums"
          style={{ color: "var(--accent-orange)" }}
        >
          {rewardSign}rew {rewardSign}
          {reward.toFixed(2)}%
        </div>
      )}
      {utilPct != null && (
        <div
          style={{
            width: "56px",
            height: "3px",
            borderRadius: "1.5px",
            background: "var(--card-border)",
            overflow: "hidden",
          }}
          title={`Utilization ${utilPct.toFixed(0)}%`}
        >
          <div
            style={{
              width: `${utilPct}%`,
              height: "100%",
              background: utilColor(utilPct),
              opacity: 0.85,
            }}
          />
        </div>
      )}
      {metric === "supply" &&
        cell.protocolSlug === "morpho-blue" &&
        cell.borrowApy == null &&
        cell.totalSupplyUsd != null && (
          <div className="text-[9px] text-text-muted">blended</div>
        )}
    </div>
  )
}
