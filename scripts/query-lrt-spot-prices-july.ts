/**
 * Historical per-unit spot prices for WEETH, RSETH, EZETH, OSETH plus ETH
 * at June 30, 2026 23:59 UTC and July 31, 2026 23:59 UTC — for §05 / §06.1.
 *
 *   npm run query:lrt-spot-prices-july
 *
 * Why: §05 and §06.1 claim LRT collateral concentration was unchanged
 * from May but the dollar value shifted via per-unit price decline.
 * This script pulls the actual spot prices on both dates so the prose
 * can cite per-unit MoM moves, and the reader can sanity-check the
 * implied $336M-ish LRT price-decline component the report documents
 * against per-unit reality.
 *
 * Source ladder per token:
 *   1. DefiLlama /coins/prices/historical/{ts}/ethereum:<addr>.
 *      Primary path; same source the on-chain audits and LDR overrides
 *      already use, so prices reconcile to those numbers.
 *   2. CoinGecko /coins/{id}/history?date=DD-MM-YYYY.
 *      Fallback when DefiLlama returns no price for a given token at the
 *      requested timestamp (rare for the canonical LRTs but kept as a
 *      defensive layer).
 *
 * Output: content/snapshots/2026-07-lrt-spot-prices.json.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"

const JUNE_30_UTC = "2026-06-30T23:59:00Z"
const JULY_31_UTC = "2026-07-31T23:59:00Z"
const JUNE_30_TS = Math.floor(new Date(JUNE_30_UTC).getTime() / 1000)
const JULY_31_TS = Math.floor(new Date(JULY_31_UTC).getTime() / 1000)
const OUTPUT_PATH = "content/snapshots/2026-07-lrt-spot-prices.json"

// Asset registry: canonical symbol + Ethereum mainnet address (for
// DefiLlama) + CoinGecko id (for the fallback path).
interface AssetMeta {
  symbol: string
  /** Editorial label used in §05 / §06.1 output. */
  displayName: string
  /** Ethereum mainnet ERC20 address — DefiLlama uses `ethereum:<addr>`. */
  address: string
  /** CoinGecko id used by /coins/{id}/history. */
  coingeckoId: string
  /** Category for the JSON output. */
  category: "lrt" | "reference"
}

const ASSETS: AssetMeta[] = [
  // LRTs in scope per §05 / §06.1
  { symbol: "WEETH", displayName: "weETH (ether.fi)",  address: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee", coingeckoId: "wrapped-eeth",        category: "lrt" },
  { symbol: "RSETH", displayName: "rsETH (Kelp)",      address: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7", coingeckoId: "kelp-dao-restaked-eth", category: "lrt" },
  { symbol: "EZETH", displayName: "ezETH (Renzo)",     address: "0xbf5495efe5db9ce00f80364c8b423567e58d2110", coingeckoId: "renzo-restaked-eth",   category: "lrt" },
  { symbol: "OSETH", displayName: "osETH (StakeWise)", address: "0xf1c9acdc66974dfb6decb12aa385b9cd01190e38", coingeckoId: "stakewise-v3-oseth",   category: "lrt" },
  // ETH-correlated reference benchmark
  { symbol: "ETH",   displayName: "ETH",               address: "0x0000000000000000000000000000000000000000", coingeckoId: "ethereum",              category: "reference" },
]

// ─── DefiLlama historical price ─────────────────────────────────────────
async function fetchDefiLlamaPrice(
  address: string,
  timestampSec: number,
): Promise<{ price: number | null; source: "defillama" | null; raw_age_sec?: number }> {
  try {
    const url = `https://coins.llama.fi/prices/historical/${timestampSec}/ethereum:${address}`
    const r = await fetch(url)
    if (!r.ok) return { price: null, source: null }
    const json = (await r.json()) as {
      coins?: Record<string, { price?: number; timestamp?: number }>
    }
    const coin = json.coins?.[`ethereum:${address}`]
    if (coin?.price != null && Number.isFinite(coin.price)) {
      return {
        price: coin.price,
        source: "defillama",
        raw_age_sec: coin.timestamp != null ? timestampSec - coin.timestamp : undefined,
      }
    }
    return { price: null, source: null }
  } catch {
    return { price: null, source: null }
  }
}

// ─── CoinGecko fallback ─────────────────────────────────────────────────
async function fetchCoinGeckoPrice(
  coinId: string,
  timestampSec: number,
): Promise<{ price: number | null; source: "coingecko" | null }> {
  // /coins/{id}/history?date=DD-MM-YYYY (UTC-anchored).
  const d = new Date(timestampSec * 1000)
  const ddmmyyyy =
    `${String(d.getUTCDate()).padStart(2, "0")}-` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${d.getUTCFullYear()}`
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${ddmmyyyy}`
    const r = await fetch(url)
    if (!r.ok) return { price: null, source: null }
    const json = (await r.json()) as {
      market_data?: { current_price?: Record<string, number> }
    }
    const price = json.market_data?.current_price?.usd
    if (price != null && Number.isFinite(price)) {
      return { price, source: "coingecko" }
    }
    return { price: null, source: null }
  } catch {
    return { price: null, source: null }
  }
}

async function fetchPrice(
  asset: AssetMeta,
  timestampSec: number,
): Promise<{ price: number | null; source: "defillama" | "coingecko" | null; raw_age_sec?: number }> {
  const dl = await fetchDefiLlamaPrice(asset.address, timestampSec)
  if (dl.price != null) return dl
  const cg = await fetchCoinGeckoPrice(asset.coingeckoId, timestampSec)
  return cg
}

interface AssetReading {
  symbol: string
  display_name: string
  category: "lrt" | "reference"
  address: string
  coingecko_id: string
  june_30_price_usd: number | null
  june_30_source: "defillama" | "coingecko" | null
  june_30_raw_age_sec?: number
  july_31_price_usd: number | null
  july_31_source: "defillama" | "coingecko" | null
  july_31_raw_age_sec?: number
  per_unit_change_pct: number | null
}

function pct(curr: number, base: number): number {
  return ((curr - base) / base) * 100
}

async function main(): Promise<void> {
  console.log(`LRT spot prices · June 30, 2026 vs July 31, 2026`)
  console.log("")

  const readings: AssetReading[] = []
  for (const asset of ASSETS) {
    const [apr, may] = await Promise.all([
      fetchPrice(asset, JUNE_30_TS),
      fetchPrice(asset, JULY_31_TS),
    ])
    const mayPrice = apr.price
    const junePrice = may.price
    const r: AssetReading = {
      symbol: asset.symbol,
      display_name: asset.displayName,
      category: asset.category,
      address: asset.address,
      coingecko_id: asset.coingeckoId,
      june_30_price_usd: mayPrice,
      june_30_source: apr.source,
      june_30_raw_age_sec: apr.raw_age_sec,
      july_31_price_usd: junePrice,
      july_31_source: may.source,
      july_31_raw_age_sec: may.raw_age_sec,
      per_unit_change_pct:
        mayPrice != null && junePrice != null && mayPrice > 0 ? pct(junePrice, mayPrice) : null,
    }
    readings.push(r)
    const mayStr = mayPrice != null ? `$${mayPrice.toFixed(2)}` : "—"
    const juneStr = junePrice != null ? `$${junePrice.toFixed(2)}` : "—"
    const chgStr =
      r.per_unit_change_pct != null
        ? `${r.per_unit_change_pct >= 0 ? "+" : ""}${r.per_unit_change_pct.toFixed(2)}%`
        : "—"
    console.log(
      `  ${asset.displayName.padEnd(24)} June 30 ${mayStr.padStart(10)}  |  July 31 ${juneStr.padStart(10)}  |  Δ ${chgStr.padStart(8)}`,
    )
  }
  console.log("")

  // ─── Sanity check the §05 narrative ──────────────────────────────────
  // WEETH at May 31 supply ≈ $3.66B per content/snapshots/2026-07-lrt-collateral.json.
  // Implied price effect for WEETH = (1 - new/old) × $3.66B. The script
  // surfaces this as a derived field so the prose can cite the math.
  const weethReading = readings.find((r) => r.symbol === "WEETH")
  // Issue 004: prior-month-end weETH supply intentionally unset (0). This
  // reconciliation carries forward from Issue 003's specific weETH
  // depositor-addition finding; the July script surfaces its own per-unit
  // move from the data. Fill from the July lrt-collateral capture (weETH
  // supply at June 30) during drafting if a comparable finding emerges.
  // June used $3.66B.
  const JUNE30_WEETH_SUPPLY_USD = 0
  let weethImpliedPriceEffectUsd: number | null = null
  if (
    JUNE30_WEETH_SUPPLY_USD > 0 &&
    weethReading?.per_unit_change_pct != null &&
    weethReading.per_unit_change_pct < 0
  ) {
    weethImpliedPriceEffectUsd =
      (weethReading.per_unit_change_pct / 100) * JUNE30_WEETH_SUPPLY_USD
    console.log(
      `WEETH per-unit move ${weethReading.per_unit_change_pct.toFixed(2)}% × prior-month-end supply $${(JUNE30_WEETH_SUPPLY_USD / 1e9).toFixed(2)}B = ` +
        `${weethImpliedPriceEffectUsd >= 0 ? "+" : ""}$${(weethImpliedPriceEffectUsd / 1e6).toFixed(2)}M implied price effect.`,
    )
  } else if (weethReading?.per_unit_change_pct != null) {
    console.log(
      `WEETH per-unit move ${weethReading.per_unit_change_pct >= 0 ? "+" : ""}${weethReading.per_unit_change_pct.toFixed(2)}%. ` +
        `Prior-month-end weETH supply not set for Issue 004 — skipping implied-price-effect reconciliation (fill during drafting).`,
    )
  } else {
    console.log("WEETH price unavailable for one or both dates — skipping reconciliation block.")
  }
  console.log("")

  // ─── Write JSON ──────────────────────────────────────────────────────
  const out = {
    source: {
      script: "scripts/query-lrt-spot-prices.ts",
      generated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      primary_endpoint: "DefiLlama /coins/prices/historical/{ts}/ethereum:<address>",
      fallback_endpoint: "CoinGecko /coins/{id}/history?date=DD-MM-YYYY",
      notes:
        "DefiLlama prices may be aged by a few minutes from the requested timestamp (the raw_age_sec field surfaces the gap). CoinGecko's historical endpoint is UTC-day-anchored so its returned price is the day's open or close depending on token coverage.",
    },
    timestamps: {
      june_30_utc: JUNE_30_UTC,
      june_30_unix: JUNE_30_TS,
      july_31_utc: JULY_31_UTC,
      july_31_unix: JULY_31_TS,
    },
    per_asset: readings,
    section_05_reconciliation: {
      weeth_june_30_supply_usd_used: JUNE30_WEETH_SUPPLY_USD,
      weeth_per_unit_change_pct: weethReading?.per_unit_change_pct ?? null,
      weeth_implied_price_effect_usd: weethImpliedPriceEffectUsd,
      documented_lrt_price_decline_usd_total: -443_000_000,
      documented_lrt_price_decline_usd_weeth_share_approx: -336_000_000,
      reconciliation_note:
        "The implied price-effect figure is point-in-time (May 31 supply × per-unit move). The §05 documented number is the time-averaged effect across June. The two will not match exactly but should land within roughly $50M for the narrative to hold.",
    },
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
