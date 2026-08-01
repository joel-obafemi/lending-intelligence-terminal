/**
 * Sector-wide oracle concentration at July 31, 2026 — for Issue 002 §08.
 *
 *   npm run query:oracle-concentration-july
 *
 * Issue 001 reported "Chainlink 94.0%, Redstone 4.5%, other ~1.5%" across
 * the four-protocol scope. This script produces the same figure for the
 * six-protocol scope at July 31, 2026.
 *
 * Methodology:
 *   1. For each of the six protocols, pull DefiLlama protocol history
 *      (per-asset USD supply on Ethereum) and find the day closest to
 *      2026-07-31.
 *   2. For each (protocol, asset) cell, look up the oracle vendor via
 *      lib/oracles.ts oracleFor(asset, protocolSlug). This is the
 *      curated map the dashboard's Risk page already uses, with
 *      per-protocol overrides (Spark prices USDS via Maker, etc.).
 *   3. Sum the USD-weighted exposure per (protocol, oracle vendor),
 *      then aggregate sector-wide.
 *   4. Surface top-1 and top-2 oracle concentration.
 *
 * Composite-feed convention: lib/oracles.ts attributes composite feeds to
 * their root price source. wstETH priced via Lido exchange rate × Chainlink
 * ETH/USD is Chainlink (the market-data dependency); USDS priced via Maker
 * PSM at $1 is Maker (no external market data). Surfaced in source.note.
 *
 * Output: content/snapshots/2026-07-oracle-concentration.json
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { PROTOCOLS } from "../lib/protocols"
import { fetchProtocolHistory } from "../lib/defillama"
import { ORACLE_MAP, oracleFor, type OracleVendor } from "../lib/oracles"

const TARGET_DAY_UTC = "2026-07-31"
const OUTPUT_PATH = "content/snapshots/2026-07-oracle-concentration.json"

function utcDayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

function dayKeyToTs(dayKey: string): number {
  return Math.floor(new Date(`${dayKey}T00:00:00Z`).getTime() / 1000)
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

function fmtPct(v: number, dp = 2): string {
  return `${(v * 100).toFixed(dp)}%`
}

interface AssetCell {
  symbol: string
  usd: number
  oracle: OracleVendor
  unknown_to_map: boolean
}

interface ProtocolBreakdown {
  protocol_slug: string
  protocol_name: string
  day_used_utc: string
  total_supplied_usd: number
  by_oracle: Record<OracleVendor, number>
  by_oracle_share: Record<OracleVendor, number>
  unknown_to_map_usd: number
  unknown_to_map_assets: string[]
  per_asset: AssetCell[]
}

async function main(): Promise<void> {
  const targetTs = dayKeyToTs(TARGET_DAY_UTC)
  console.log(`Oracle concentration across ${PROTOCOLS.length} protocols at ${TARGET_DAY_UTC}`)
  console.log("")

  console.log(`[1/3] Fetching DefiLlama protocol history for ${PROTOCOLS.length} protocols …`)
  const histories = await Promise.all(
    PROTOCOLS.map(async (p) => {
      const h = await fetchProtocolHistory(p.defillamaSlug)
      return { protocol: p, history: h }
    }),
  )
  console.log("")

  console.log(`[2/3] Picking snapshot closest to ${TARGET_DAY_UTC} per protocol + bucketing oracles …`)
  const ALL_VENDORS: OracleVendor[] = [
    "Chainlink",
    "Redstone",
    "Pyth",
    "Lido",
    "Maker",
    "Curve EMA",
    "Other",
  ]
  function emptyByOracle(): Record<OracleVendor, number> {
    return {
      Chainlink: 0,
      Redstone: 0,
      Pyth: 0,
      Lido: 0,
      Maker: 0,
      "Curve EMA": 0,
      Other: 0,
    }
  }

  const breakdowns: ProtocolBreakdown[] = []
  for (const { protocol, history } of histories) {
    const series = [...history.suppliedByAsset].sort((a, b) => a.timestamp - b.timestamp)
    if (series.length === 0) {
      console.warn(`  [warn] no suppliedByAsset history for ${protocol.slug} — skipping`)
      continue
    }
    // Pick the LAST point at or before targetTs.
    let pick = series[0]
    for (const pt of series) {
      if (pt.timestamp <= targetTs) pick = pt
      else break
    }
    const dayUsed = utcDayKey(pick.timestamp)
    const tokens = pick.tokens
    const perAsset: AssetCell[] = []
    const byOracle = emptyByOracle()
    let totalUsd = 0
    let unknownToMapUsd = 0
    const unknownAssets: string[] = []
    for (const [symRaw, usd] of Object.entries(tokens)) {
      if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) continue
      const symbol = symRaw.toUpperCase()
      const oracle = oracleFor(symbol, protocol.slug)
      const unknownToMap = !ORACLE_MAP[symbol]
      if (unknownToMap) {
        unknownToMapUsd += usd
        unknownAssets.push(symbol)
      }
      perAsset.push({ symbol, usd, oracle, unknown_to_map: unknownToMap })
      byOracle[oracle] += usd
      totalUsd += usd
    }
    const byOracleShare: Record<OracleVendor, number> = emptyByOracle()
    for (const v of ALL_VENDORS) {
      byOracleShare[v] = totalUsd > 0 ? byOracle[v] / totalUsd : 0
    }
    breakdowns.push({
      protocol_slug: protocol.slug,
      protocol_name: protocol.name,
      day_used_utc: dayUsed,
      total_supplied_usd: totalUsd,
      by_oracle: byOracle,
      by_oracle_share: byOracleShare,
      unknown_to_map_usd: unknownToMapUsd,
      unknown_to_map_assets: [...new Set(unknownAssets)].sort(),
      per_asset: perAsset.sort((a, b) => b.usd - a.usd),
    })
  }
  console.log("")

  console.log("[3/3] Aggregating to sector level …")
  const sectorByOracle = emptyByOracle()
  let sectorTotal = 0
  let sectorUnknown = 0
  for (const b of breakdowns) {
    for (const v of ALL_VENDORS) sectorByOracle[v] += b.by_oracle[v]
    sectorTotal += b.total_supplied_usd
    sectorUnknown += b.unknown_to_map_usd
  }
  const sectorByOracleShare: Record<OracleVendor, number> = emptyByOracle()
  for (const v of ALL_VENDORS) {
    sectorByOracleShare[v] = sectorTotal > 0 ? sectorByOracle[v] / sectorTotal : 0
  }
  // Top-1 and top-2 concentration.
  const ranked = ALL_VENDORS.map((v) => ({ vendor: v, share: sectorByOracleShare[v] }))
    .sort((a, b) => b.share - a.share)
  const top1 = ranked[0]
  const top2Share = (ranked[0]?.share ?? 0) + (ranked[1]?.share ?? 0)
  console.log("")

  // ─── Console summary ────────────────────────────────────────────────
  console.log("── Sector-wide oracle share at July 31, 2026 ───────────────")
  for (const v of ALL_VENDORS) {
    if (sectorByOracle[v] <= 0) continue
    console.log(
      `  ${v.padEnd(11)} ${fmtPct(sectorByOracleShare[v]).padStart(7)}  (${fmtUsd(sectorByOracle[v])})`,
    )
  }
  console.log("")
  console.log(`  Total supplied (sector): ${fmtUsd(sectorTotal)}`)
  console.log(`  Top-1 (${top1.vendor}): ${fmtPct(top1.share)}`)
  console.log(`  Top-2 combined: ${fmtPct(top2Share)}`)
  console.log("")

  console.log("── Per-protocol top oracle ────────────────────────────────")
  for (const b of breakdowns) {
    const protRanked = ALL_VENDORS.map((v) => ({
      vendor: v,
      share: b.by_oracle_share[v],
      usd: b.by_oracle[v],
    })).sort((a, b) => b.share - a.share)
    const top = protRanked[0]
    console.log(
      `  ${b.protocol_name.padEnd(12)} ${top.vendor.padEnd(10)} ${fmtPct(top.share).padStart(7)}  (total ${fmtUsd(b.total_supplied_usd)})`,
    )
  }
  console.log("")

  if (sectorUnknown > 0) {
    const pct = (sectorUnknown / sectorTotal) * 100
    console.log(
      `── Unknown-to-map exposure: ${fmtUsd(sectorUnknown)} (${pct.toFixed(2)}% of sector) ──`,
    )
    console.log(`  Assets not in ORACLE_MAP get bucketed as 'Other' for the headline.`)
    console.log("")
  }

  // ─── Write JSON ──────────────────────────────────────────────────────
  const out = {
    source: {
      script: "scripts/query-oracle-concentration-may.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      target_day_utc: TARGET_DAY_UTC,
      data_source:
        "DefiLlama /protocol/<slug> chainTvls.Ethereum.tokensInUsd at day closest to target",
      oracle_map_source: "lib/oracles.ts ORACLE_MAP (curated, includes per-protocol overrides)",
      methodology:
        "Per (protocol, asset) USD supply at the June 30 snapshot, attributed to the oracle vendor via oracleFor(asset, protocolSlug). Composite feeds attributed to root price source (e.g. wstETH composite → Chainlink). Assets not in ORACLE_MAP bucketed as 'Other' and counted in unknown_to_map_usd so the curator can audit.",
      note:
        sectorUnknown > 0
          ? `${(((sectorUnknown / sectorTotal) * 100) || 0).toFixed(2)}% of sector supply is in assets not present in ORACLE_MAP and is counted as 'Other'. See sector.unknown_to_map_assets for the list — extend lib/oracles.ts ORACLE_MAP to attribute these explicitly.`
          : "Every asset in sector supply was mapped to an oracle vendor; no fallthrough into 'Other'.",
    },
    sector: {
      total_supplied_usd: sectorTotal,
      by_oracle_usd: sectorByOracle,
      by_oracle_share: sectorByOracleShare,
      top_1_vendor: top1.vendor,
      top_1_share: top1.share,
      top_2_share: top2Share,
      unknown_to_map_usd: sectorUnknown,
      unknown_to_map_assets: [
        ...new Set(breakdowns.flatMap((b) => b.unknown_to_map_assets)),
      ].sort(),
    },
    per_protocol: breakdowns,
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
