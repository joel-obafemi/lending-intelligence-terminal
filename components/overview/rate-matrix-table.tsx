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

interface FamilyConfig {
  /** Display label for the sub-table caption. */
  label: string
  /** Tagline rendered next to the family label so a reader knows
   *  what's grouped here without reading the rows. */
  tagline: string
}

const FAMILIES: FamilyConfig[] = [
  {
    label: "Stablecoins",
    tagline: "USDC · USDT · DAI · USDS · GHO",
  },
  {
    label: "ETH + LST / LRT",
    tagline: "WETH · WSTETH · WEETH and the wrapped-ETH family (BTC excluded)",
  },
  {
    label: "BTC",
    tagline: "WBTC · CBBTC",
  },
]

const BTC_SYMBOLS = new Set(["WBTC", "CBBTC", "TBTCV2", "TBTC", "LBTC"])
const ETH_SYMBOLS = new Set(["WETH", "ETH"])

function familyOf(symbol: string): string {
  if (BTC_SYMBOLS.has(symbol.toUpperCase())) return "BTC"
  const t = classifyAsset(symbol)
  if (t === "stable") return "Stablecoins"
  if (t === "native" && ETH_SYMBOLS.has(symbol.toUpperCase())) return "ETH + LST / LRT"
  if (t === "lst" || t === "lrt") return "ETH + LST / LRT"
  // Native that isn't ETH (rare) gets BTC-style treatment, since the
  // BTC family is the only "native non-ETH" bucket the matrix lists.
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

export function RateMatrixTable({ title, cells }: Props) {
  const [mode, setMode] = useState<RateMode>("headline")

  // Group cells first by family, then by symbol, then by protocol.
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
        <span className="flex items-center gap-3">
          <span
            className="text-accent"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {title}
          </span>
          <span className="text-[10px] text-text-muted">
            Supply / Borrow APY · current with 30d-avg
          </span>
        </span>
        <ModeToggle mode={mode} setMode={setMode} />
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
            />
          )
        })}
      </div>
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
              ? "Effective APY: supply = base + reward incentives, borrow = base − reward incentives. Re-ranks the Best Supply / Best Borrow columns by net return."
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
}: {
  family: FamilyConfig
  orderedAssets: readonly string[]
  familyMap: Map<string, Map<string, RateMatrixCell>>
  mode: RateMode
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
              <th className="text-right">Best Supply</th>
              <th className="text-right">Best Borrow</th>
            </tr>
          </thead>
          <tbody>
            {orderedAssets.map((sym) => (
              <Row key={sym} symbol={sym} row={familyMap.get(sym)!} mode={mode} />
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
}: {
  symbol: string
  row: Map<string, RateMatrixCell>
  mode: RateMode
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
        const supplyReward = cell?.supplyApyReward ?? 0
        const borrowReward = cell?.borrowApyReward ?? 0
        const hasRewards = supplyReward > 0 || borrowReward > 0
        const supply = cell ? supplyValue(cell) : null
        const borrow = cell ? borrowValue(cell) : null
        return (
          <td key={p.slug} className="text-right">
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
                {fmtPct(supply)}
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
                {fmtPct(borrow)}
              </span>
            </div>
            {hasRewards && mode === "headline" && (
              <div
                className="text-[9px] tabular-nums"
                style={{ color: "var(--accent-orange)" }}
                title={
                  `Effective APY including token rewards (depositor earns base + rewards; borrower pays base − rewards). ` +
                  `Toggle "Reward-adj." above the matrix to re-rank the Best Supply / Best Borrow columns by these effective rates.`
                }
              >
                +rew {supplyReward > 0 ? `+${supplyReward.toFixed(2)}%` : "—"}
                {" / "}
                {borrowReward > 0 ? `−${borrowReward.toFixed(2)}%` : "—"}
              </div>
            )}
            <div className="text-[9px] text-text-muted tabular-nums">
              {cell?.supplyApy30d != null || cell?.borrowApy30d != null ? (
                <span title="Trailing 30-day average">
                  30d:{" "}
                  {cell.supplyApy30d != null ? formatPercent(cell.supplyApy30d, 2) : "—"}
                  {" / "}
                  {cell.borrowApy30d != null ? formatPercent(cell.borrowApy30d, 2) : "—"}
                </span>
              ) : null}
              {cell?.spread != null && (
                <span className="ml-2" title="Borrow APY minus Supply APY">
                  Spr {cell.spread >= 0 ? "+" : ""}
                  {cell.spread.toFixed(2)}%
                </span>
              )}
            </div>
            {cell?.utilization != null && (
              <div className="text-[9px] text-text-muted tabular-nums">
                {cell.utilization.toFixed(0)}% util
                {cell.totalSupplyUsd
                  ? ` · ${formatUSD(cell.totalSupplyUsd)}`
                  : ""}
              </div>
            )}
            {cell?.protocolSlug === "morpho-blue" &&
              cell?.totalSupplyUsd != null &&
              cell?.borrowApy == null && (
                <div className="text-[9px] text-text-muted">
                  Blended across vaults
                </div>
              )}
          </td>
        )
      })}
      <td className="text-right">
        {bestSupply ? (
          <span style={{ color: PROTOCOL_BY_SLUG[bestSupply.slug]?.color }} className="tabular-nums">
            {formatPercent(bestSupply.v, 2)}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>
      <td className="text-right">
        {bestBorrow ? (
          <span style={{ color: PROTOCOL_BY_SLUG[bestBorrow.slug]?.color }} className="tabular-nums">
            {formatPercent(bestBorrow.v, 2)}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>
    </tr>
  )
}
