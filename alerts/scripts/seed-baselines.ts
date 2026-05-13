/**
 * One-shot baseline seeder for apy_dispersion_blowout. Pulls 30 days of
 * DefiLlama Yields history per (protocol, stablecoin), day-buckets the
 * supply APY, computes per-day cross-protocol dispersion in bps, and
 * writes the samples as a SQL file the operator runs via wrangler.
 *
 * Run:
 *   npx tsx scripts/seed-baselines.ts
 * Then:
 *   npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-dispersion.sql
 *
 * Safe to re-run: INSERTs use ON CONFLICT(metric_key, sample_at) DO UPDATE.
 * Spec 14 / 15 calls this out as a one-time operator action before
 * enabling rules that depend on baselines.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  DEFILLAMA_YIELDS_PROJECT,
  DISPERSION_BASELINE_WINDOW_DAYS,
  DISPERSION_PROTOCOLS,
  DISPERSION_STABLES,
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

  if (inserts.length === 0) {
    console.log("No samples generated. Nothing to write.");
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(here, ".seed-dispersion.sql");
  // D1's --file mode disallows BEGIN TRANSACTION / COMMIT (it wraps the
  // batch automatically and rejects raw transaction control statements).
  const sql = [
    "-- Auto-generated by scripts/seed-baselines.ts. Safe to re-run.",
    ...inserts,
    "",
  ].join("\n");
  await writeFile(outPath, sql);
  console.log(`\nWrote ${inserts.length} INSERTs to ${outPath}`);
  console.log("\nApply to the live database:");
  console.log("  npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-dispersion.sql\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
