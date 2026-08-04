/**
 * LRT collateral across all 6 protocols at June 30 and July 31, 2026 —
 * for Issue 002 §05 cross-protocol context and §08 risk indicators.
 *
 *   npm run query:lrt-collateral-july
 *
 * Hypothesis to test: roughly $1.17B of LRT net outflow in June per the
 * Sankey (WEETH $844M, RSETH $221M, EZETH $64M, OSETH $46M). This script
 * confirms or refutes against DefiLlama-derived figures.
 *
 * Methodology:
 *   1. For each of the 6 protocols, fetch DefiLlama protocol history
 *      (chainTvls.Ethereum.tokensInUsd per asset, per day).
 *   2. Pick the snapshot closest to May 31 and to June 30 per protocol.
 *   3. For each LRT asset (WEETH, RSETH, EZETH, OSETH), sum USD supply
 *      per protocol at both dates.
 *   4. Symbol normalisation via lib/assets.ts (DefiLlama returns mixed
 *      casing — weETH, WEETH, etc.). Source of truth is the canonical
 *      uppercase symbols already in classifyAsset's LRT set.
 *
 * Important methodology gap to note: DefiLlama uses ACTUAL prices on each
 * day, not constant prices. So a June 30 USD figure smaller than May 31
 * reflects BOTH net depositor outflow AND any LRT price decline. The
 * Sankey numbers in the hypothesis are CONSTANT-PRICE (latest price
 * applied to historical quantities) — they isolate flow from price drift.
 * The two methodologies will NOT match exactly. The gap between them is
 * the price effect.
 *
 * Output: content/snapshots/2026-07-lrt-collateral.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { PROTOCOLS } from "../lib/protocols"
import { fetchProtocolHistory } from "../lib/defillama"

const JUNE_30_UTC = "2026-06-30"
const JULY_31_UTC = "2026-07-31"
const LRT_ASSETS = ["WEETH", "RSETH", "EZETH", "OSETH"] as const
type LrtAsset = (typeof LRT_ASSETS)[number]
const OUTPUT_PATH = "content/snapshots/2026-07-lrt-collateral.json"

// Sankey hypothesis from the issue brief — constant-price net outflows in June.
const SANKEY_HYPOTHESIS_USD: Record<LrtAsset, number> = {
  WEETH: -844_000_000,
  RSETH: -221_000_000,
  EZETH: -64_000_000,
  OSETH: -46_000_000,
}

function utcDayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

function dayKeyToTs(dayKey: string): number {
  return Math.floor(new Date(`${dayKey}T00:00:00Z`).getTime() / 1000)
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "−" : ""
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`
  return `${sign}$${abs.toFixed(2)}`
}

function fmtPct(v: number, dp = 1): string {
  if (!Number.isFinite(v)) return "—"
  const sign = v >= 0 ? "+" : ""
  return `${sign}${(v * 100).toFixed(dp)}%`
}

interface ProtocolSnapshot {
  day_utc: string
  // USD per LRT asset (zero if not listed / no supply).
  by_lrt: Record<LrtAsset, number>
}

interface ProtocolEntry {
  protocol_slug: string
  protocol_name: string
  june_30: ProtocolSnapshot
  july_31: ProtocolSnapshot
}

async function main(): Promise<void> {
  const juneTs = dayKeyToTs(JUNE_30_UTC)
  const julyTs = dayKeyToTs(JULY_31_UTC)
  console.log(`LRT collateral across ${PROTOCOLS.length} protocols at ${JUNE_30_UTC} vs ${JULY_31_UTC}`)
  console.log("")

  console.log(`[1/3] Fetching DefiLlama protocol history for ${PROTOCOLS.length} protocols …`)
  const histories = await Promise.all(
    PROTOCOLS.map(async (p) => {
      const h = await fetchProtocolHistory(p.defillamaSlug)
      return { protocol: p, history: h }
    }),
  )
  console.log("")

  console.log("[2/3] Extracting LRT USD per protocol at both dates …")
  function snapshotAt(
    series: Array<{ timestamp: number; tokens: Record<string, number> }>,
    targetTs: number,
  ): ProtocolSnapshot {
    if (series.length === 0) {
      return { day_utc: "", by_lrt: { WEETH: 0, RSETH: 0, EZETH: 0, OSETH: 0 } }
    }
    // Pick last point at or before targetTs.
    let pick = series[0]
    for (const pt of series) {
      if (pt.timestamp <= targetTs) pick = pt
      else break
    }
    const byLrt: Record<LrtAsset, number> = { WEETH: 0, RSETH: 0, EZETH: 0, OSETH: 0 }
    for (const [symRaw, usd] of Object.entries(pick.tokens)) {
      if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) continue
      const sym = symRaw.toUpperCase() as LrtAsset
      if (LRT_ASSETS.includes(sym)) byLrt[sym] += usd
    }
    return { day_utc: utcDayKey(pick.timestamp), by_lrt: byLrt }
  }

  const protocols: ProtocolEntry[] = []
  for (const { protocol, history } of histories) {
    const series = [...history.suppliedByAsset].sort((a, b) => a.timestamp - b.timestamp)
    const june30 = snapshotAt(series, juneTs)
    const july31 = snapshotAt(series, julyTs)
    protocols.push({
      protocol_slug: protocol.slug,
      protocol_name: protocol.name,
      june_30: june30,
      july_31: july31,
    })
  }
  console.log("")

  console.log("[3/3] Aggregating sector totals per LRT + reconciling against Sankey hypothesis …")
  const sectorApr: Record<LrtAsset, number> = { WEETH: 0, RSETH: 0, EZETH: 0, OSETH: 0 }
  const sectorMay: Record<LrtAsset, number> = { WEETH: 0, RSETH: 0, EZETH: 0, OSETH: 0 }
  for (const e of protocols) {
    for (const a of LRT_ASSETS) {
      sectorApr[a] += e.june_30.by_lrt[a]
      sectorMay[a] += e.july_31.by_lrt[a]
    }
  }
  const sectorDelta: Record<LrtAsset, number> = { WEETH: 0, RSETH: 0, EZETH: 0, OSETH: 0 }
  const sectorPctChange: Record<LrtAsset, number> = { WEETH: 0, RSETH: 0, EZETH: 0, OSETH: 0 }
  for (const a of LRT_ASSETS) {
    sectorDelta[a] = sectorMay[a] - sectorApr[a]
    sectorPctChange[a] = sectorApr[a] > 0 ? sectorDelta[a] / sectorApr[a] : NaN
  }
  console.log("")

  // ─── Console summary ─────────────────────────────────────────────────
  console.log("── Sector-wide LRT collateral USD (actual prices, not constant) ───")
  console.log("  Asset    June 30          July 31           Δ (USD)         Δ %")
  for (const a of LRT_ASSETS) {
    console.log(
      `  ${a.padEnd(8)} ${fmtUsd(sectorApr[a]).padEnd(15)} ${fmtUsd(sectorMay[a]).padEnd(15)} ${fmtUsd(sectorDelta[a]).padEnd(14)} ${fmtPct(sectorPctChange[a])}`,
    )
  }
  const sectorAprTotal = Object.values(sectorApr).reduce((s, v) => s + v, 0)
  const sectorMayTotal = Object.values(sectorMay).reduce((s, v) => s + v, 0)
  const sectorTotalDelta = sectorMayTotal - sectorAprTotal
  console.log(`  ──────────────`)
  console.log(
    `  TOTAL    ${fmtUsd(sectorAprTotal).padEnd(15)} ${fmtUsd(sectorMayTotal).padEnd(15)} ${fmtUsd(sectorTotalDelta).padEnd(14)} ${fmtPct(sectorTotalDelta / sectorAprTotal)}`,
  )
  console.log("")

  console.log("── Per-protocol breakdown at July 31 (USD, dominant first) ──────")
  for (const e of protocols) {
    const has = Object.entries(e.july_31.by_lrt).filter(([, v]) => v > 0)
    if (has.length === 0) {
      console.log(`  ${e.protocol_name.padEnd(12)}  no LRT collateral`)
      continue
    }
    const parts = (has as Array<[LrtAsset, number]>)
      .sort(([, a], [, b]) => b - a)
      .map(([sym, usd]) => `${sym} ${fmtUsd(usd)}`)
      .join("  ")
    console.log(`  ${e.protocol_name.padEnd(12)}  ${parts}`)
  }
  console.log("")

  console.log("── Reconciliation against Sankey hypothesis ──────────────")
  console.log("  Sankey is CONSTANT-PRICE (depositor flow). DefiLlama is ACTUAL prices.")
  console.log("  Gap = DefiLlama delta minus Sankey hypothesis = the LRT price-decline effect.")
  console.log("")
  console.log("  Asset    Sankey hyp.    DL actual Δ    Gap (price effect)")
  for (const a of LRT_ASSETS) {
    const hyp = SANKEY_HYPOTHESIS_USD[a]
    const actual = sectorDelta[a]
    const gap = actual - hyp
    console.log(
      `  ${a.padEnd(8)} ${fmtUsd(hyp).padEnd(13)} ${fmtUsd(actual).padEnd(14)} ${fmtUsd(gap)}`,
    )
  }
  console.log("")

  // ─── Write JSON ──────────────────────────────────────────────────────
  const sankeyTotal = Object.values(SANKEY_HYPOTHESIS_USD).reduce((s, v) => s + v, 0)
  const actualTotal = Object.values(sectorDelta).reduce((s, v) => s + v, 0)
  const reconciliation = LRT_ASSETS.map((a) => ({
    asset: a,
    sankey_hypothesis_constant_price_delta_usd: SANKEY_HYPOTHESIS_USD[a],
    defillama_actual_price_delta_usd: sectorDelta[a],
    gap_usd: sectorDelta[a] - SANKEY_HYPOTHESIS_USD[a],
    gap_interpretation:
      Math.abs(sectorDelta[a] - SANKEY_HYPOTHESIS_USD[a]) < 50_000_000
        ? "Within $50M — constant-price flow methodology and actual-price methodology align; the June LRT bleed was primarily depositor exit, not price decline."
        : "Larger than $50M — meaningful divergence between flow methodology and actual-price methodology, indicating LRT price moved materially in June.",
  }))

  const out = {
    source: {
      script: "scripts/query-lrt-collateral.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      target_dates_utc: { june_30: JUNE_30_UTC, july_31: JULY_31_UTC },
      data_source: "DefiLlama /protocol/<slug> chainTvls.Ethereum.tokensInUsd per day",
      symbol_normalisation:
        "Symbols upper-cased and matched against LRT set {WEETH, RSETH, EZETH, OSETH}. Variants like weETH or weEth from DefiLlama collapse onto the same canonical symbol.",
      methodology:
        "USD supplied per (protocol, LRT-asset) at the day closest to and not after each target. Uses ACTUAL prices on each day, NOT constant prices. Differs from the Sankey methodology which holds quantities at latest-observed prices to isolate flows from drift.",
      note: "DefiLlama actual-price deltas will differ from Sankey constant-price deltas by the LRT price effect across May→June. The reconciliation block surfaces the gap per asset.",
    },
    sector: {
      june_30: {
        by_lrt: sectorApr,
        total_usd: sectorAprTotal,
      },
      july_31: {
        by_lrt: sectorMay,
        total_usd: sectorMayTotal,
      },
      delta_by_lrt_usd: sectorDelta,
      delta_total_usd: sectorTotalDelta,
      pct_change_by_lrt: sectorPctChange,
      pct_change_total: sectorAprTotal > 0 ? sectorTotalDelta / sectorAprTotal : NaN,
    },
    sankey_hypothesis_reconciliation: {
      hypothesis_total_usd: sankeyTotal,
      defillama_actual_total_usd: actualTotal,
      total_gap_usd: actualTotal - sankeyTotal,
      per_asset: reconciliation,
    },
    per_protocol: protocols,
  }

  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
