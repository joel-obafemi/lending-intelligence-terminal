/**
 * One-shot baseline seeder. Produces two SQL files in scripts/:
 *
 *   .seed-dispersion.sql    APY dispersion (rule: apy_dispersion_blowout)
 *   .seed-liquidity.sql     Available liquidity (rule: liquidity_normalization)
 *
 * Run:
 *   npx tsx scripts/seed-baselines.ts
 * Then:
 *   npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-dispersion.sql
 *   npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-liquidity.sql
 *
 * Safe to re-run: INSERTs use ON CONFLICT(metric_key, sample_at) DO UPDATE.
 *
 * Liquidity backfill caveat: DefiLlama /chart/{pool_id} returns tvlUsd per
 * day but not totalSupplyUsd / totalBorrowUsd. For Aave V3 and Spark pools
 * tvlUsd is unborrowed liquidity, which equals the live rule's
 * available_liquidity definition. For Fluid pools that show the quirk
 * (tvlUsd == totalSupplyUsd at the current snapshot), historical samples
 * cannot be reconstructed from /chart alone; those entries are skipped
 * and accumulate naturally over the next 30 days.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  DEFILLAMA_YIELDS_PROJECT,
  DISPERSION_BASELINE_WINDOW_DAYS,
  DISPERSION_PROTOCOLS,
  DISPERSION_STABLES,
  LIQUIDITY_BASELINE_WINDOW_DAYS,
  LIQUIDITY_METRIC_KEY_PREFIX,
  LIQUIDITY_WATCHLIST,
} from "../src/config";
import type { Protocol } from "../src/types";

const YIELDS_BASE = "https://yields.llama.fi";

interface PoolRow {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  totalSupplyUsd?: number | null;
  tvlUsd?: number;
  apyBase?: number | null;
}

interface ChartPoint {
  timestamp: string; // ISO
  apyBase: number | null;
  tvlUsd: number | null;
}

interface DayBucket {
  // Per protocol, the (TVL-weighted) supply APY for that day.
  [protocol: string]: { weightedSum: number; weightSum: number };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": "datumlabs-alerts-seed/0.1" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

function utcMidnight(tsMs: number): number {
  const d = new Date(tsMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function main() {
  const allProjects = new Set(Object.values(DEFILLAMA_YIELDS_PROJECT).flat());
  console.log(`Fetching DefiLlama /pools ...`);
  const poolsRes = await fetchJson<{ data: PoolRow[] }>(`${YIELDS_BASE}/pools`);
  const allEthPools = (poolsRes.data ?? []).filter(
    (p) => p.chain === "Ethereum" && allProjects.has(p.project),
  );
  console.log(`  ${allEthPools.length} matching Ethereum pools`);

  const nowMs = Date.now();
  const cutoffMs =
    utcMidnight(nowMs) - DISPERSION_BASELINE_WINDOW_DAYS * 24 * 3600 * 1000;
  const inserts: string[] = [];

  for (const stable of DISPERSION_STABLES) {
    // Per-day buckets keyed by UTC midnight ms.
    const days = new Map<number, DayBucket>();

    for (const protocol of DISPERSION_PROTOCOLS) {
      const projects = DEFILLAMA_YIELDS_PROJECT[protocol as Protocol];
      const matches = allEthPools
        .filter((p) => projects.includes(p.project) && p.symbol.toUpperCase() === stable)
        .sort(
          (a, b) =>
            (b.totalSupplyUsd ?? b.tvlUsd ?? 0) -
            (a.totalSupplyUsd ?? a.tvlUsd ?? 0),
        );
      if (matches.length === 0) {
        console.log(`  ${stable}/${protocol}: no pool found, skipping`);
        continue;
      }
      // Seed from the deepest pool. For multi-vault protocols (Morpho) a
      // proper backfill would blend across vault histories; this is the
      // operator-doc'd simplification.
      const deepest = matches[0]!;
      console.log(
        `  ${stable}/${protocol}: chart ${deepest.pool.slice(0, 8)} tvl=${(deepest.totalSupplyUsd ?? deepest.tvlUsd ?? 0).toLocaleString()}`,
      );
      let chart: { data: ChartPoint[] };
      try {
        chart = await fetchJson<{ data: ChartPoint[] }>(
          `${YIELDS_BASE}/chart/${deepest.pool}`,
        );
      } catch (err) {
        console.log(`    chart fetch failed: ${(err as Error).message}`);
        continue;
      }

      for (const pt of chart.data ?? []) {
        if (pt.apyBase == null || !Number.isFinite(pt.apyBase)) continue;
        const ts = new Date(pt.timestamp).getTime();
        if (!Number.isFinite(ts) || ts < cutoffMs) continue;
        const dayKey = utcMidnight(ts);
        const w = pt.tvlUsd ?? 0;
        if (w <= 0) continue;
        let bucket = days.get(dayKey);
        if (!bucket) {
          bucket = {};
          days.set(dayKey, bucket);
        }
        const slot = (bucket[protocol] ??= { weightedSum: 0, weightSum: 0 });
        slot.weightedSum += pt.apyBase * w;
        slot.weightSum += w;
      }
    }

    let stableSamples = 0;
    for (const [dayMs, bucket] of [...days.entries()].sort((a, b) => a[0] - b[0])) {
      const apys: number[] = [];
      for (const v of Object.values(bucket)) {
        if (v.weightSum > 0) apys.push(v.weightedSum / v.weightSum);
      }
      if (apys.length < 2) continue;
      const dispersionBps = (Math.max(...apys) - Math.min(...apys)) * 100;
      inserts.push(
        `INSERT INTO baseline_samples (metric_key, sample_at, value) VALUES ('dispersion:${stable}', ${dayMs}, ${dispersionBps.toFixed(6)}) ON CONFLICT(metric_key, sample_at) DO UPDATE SET value = excluded.value;`,
      );
      stableSamples++;
    }
    console.log(`  dispersion:${stable}: ${stableSamples} day-samples generated`);
  }

  const here = dirname(fileURLToPath(import.meta.url));

  if (inserts.length > 0) {
    const outPath = resolve(here, ".seed-dispersion.sql");
    // D1's --file mode disallows BEGIN TRANSACTION / COMMIT (it wraps the
    // batch automatically and rejects raw transaction control statements).
    const sql = [
      "-- Auto-generated by scripts/seed-baselines.ts. Safe to re-run.",
      ...inserts,
      "",
    ].join("\n");
    await writeFile(outPath, sql);
    console.log(`\nWrote ${inserts.length} dispersion INSERTs to ${outPath}`);
  } else {
    console.log("No dispersion samples generated.");
  }

  // ── Liquidity backfill (rule: liquidity_normalization). ──────────────
  console.log(`\nLiquidity backfill (${LIQUIDITY_BASELINE_WINDOW_DAYS} days) ...`);
  const liquidityInserts = await buildLiquidityInserts(allEthPools);
  if (liquidityInserts.length > 0) {
    const outPath = resolve(here, ".seed-liquidity.sql");
    const sql = [
      "-- Auto-generated by scripts/seed-baselines.ts. Safe to re-run.",
      ...liquidityInserts,
      "",
    ].join("\n");
    await writeFile(outPath, sql);
    console.log(`Wrote ${liquidityInserts.length} liquidity INSERTs to ${outPath}`);
  } else {
    console.log("No liquidity samples generated.");
  }

  console.log("\nApply to the live database:");
  console.log("  npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-dispersion.sql");
  console.log("  npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-liquidity.sql\n");
}

interface LiquidityChartPoint {
  timestamp: string;
  tvlUsd: number | null;
}

async function buildLiquidityInserts(allEthPools: PoolRow[]): Promise<string[]> {
  const out: string[] = [];
  const nowMs = Date.now();
  const cutoffMs =
    utcMidnight(nowMs) - LIQUIDITY_BASELINE_WINDOW_DAYS * 24 * 3600 * 1000;

  for (const entry of LIQUIDITY_WATCHLIST) {
    const projects = DEFILLAMA_YIELDS_PROJECT[entry.protocol as Protocol];
    const matches = allEthPools
      .filter(
        (p) =>
          projects.includes(p.project) && p.symbol.toUpperCase() === entry.asset,
      )
      .sort(
        (a, b) =>
          (b.totalSupplyUsd ?? b.tvlUsd ?? 0) -
          (a.totalSupplyUsd ?? a.tvlUsd ?? 0),
      );
    if (matches.length === 0) {
      console.log(`  ${entry.protocol}/${entry.asset}: no pool, skipping`);
      continue;
    }
    const deepest = matches[0]!;

    // Detect the Fluid quirk on the live snapshot: tvlUsd ≈ totalSupplyUsd
    // with non-zero borrow means /chart's historical tvlUsd is not
    // available-liquidity. Skip those rather than seed misleading data.
    const supply = deepest.totalSupplyUsd ?? 0;
    const borrow = (deepest as { totalBorrowUsd?: number | null }).totalBorrowUsd ?? 0;
    const tvl = deepest.tvlUsd ?? 0;
    const quirk =
      supply > 0 &&
      borrow > 0 &&
      Math.abs(supply - tvl) <= Math.max(1, tvl * 0.001);
    if (quirk) {
      console.log(
        `  ${entry.protocol}/${entry.asset}: Fluid-style tvl quirk, skipping (will accumulate live)`,
      );
      continue;
    }

    let chart: { data: LiquidityChartPoint[] };
    try {
      chart = await fetchJson<{ data: LiquidityChartPoint[] }>(
        `${YIELDS_BASE}/chart/${deepest.pool}`,
      );
    } catch (err) {
      console.log(
        `  ${entry.protocol}/${entry.asset}: chart fetch failed: ${(err as Error).message}`,
      );
      continue;
    }

    const metricKey = `${LIQUIDITY_METRIC_KEY_PREFIX}:${entry.protocol}:${entry.asset}`;
    let samples = 0;
    for (const pt of chart.data ?? []) {
      if (pt.tvlUsd == null || !Number.isFinite(pt.tvlUsd)) continue;
      // Drop incomplete / zero-tvl days. DefiLlama's chart endpoint
      // occasionally returns 0 for the most recent partial day; the
      // dashboard's trimIncompleteTail does the same in lib/defillama.ts.
      if (pt.tvlUsd <= 0) continue;
      const ts = new Date(pt.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      out.push(
        `INSERT INTO baseline_samples (metric_key, sample_at, value) VALUES ('${metricKey}', ${utcMidnight(ts)}, ${pt.tvlUsd.toFixed(2)}) ON CONFLICT(metric_key, sample_at) DO UPDATE SET value = excluded.value;`,
      );
      samples++;
    }
    console.log(`  ${metricKey}: ${samples} day-samples generated`);
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
