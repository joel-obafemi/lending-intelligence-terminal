/**
 * Worker-friendly Neon HTTP client. Uses @neondatabase/serverless's `neon()`
 * function which routes queries through Neon's HTTPS proxy. No persistent
 * connection, no WebSockets — safe for Cloudflare Workers.
 *
 * The liquidator-economy DB is owned by the Liquidator Economy terminal;
 * the alerts Worker reads only. Connection string lives in the
 * LIQUIDATOR_DATABASE_URL secret (set via `wrangler secret put`).
 */

import { neon } from "@neondatabase/serverless";
import type { Env } from "../types";

type NeonSql = ReturnType<typeof neon>;

let cached: NeonSql | null = null;
let cachedConnString: string | null = null;

function getSql(env: Env): NeonSql {
  if (!env.LIQUIDATOR_DATABASE_URL) {
    throw new Error(
      "LIQUIDATOR_DATABASE_URL is not set. Run `wrangler secret put LIQUIDATOR_DATABASE_URL`.",
    );
  }
  // Strip channel_binding which the Neon HTTP proxy rejects (mirrors the
  // dashboard's lib/liquidator-db.ts handling).
  const url = env.LIQUIDATOR_DATABASE_URL.replace(/&?channel_binding=[^&]*/g, "");
  if (!cached || cachedConnString !== url) {
    cached = neon(url);
    cachedConnString = url;
  }
  return cached;
}

export function hasLiquidatorDb(env: Env): boolean {
  return Boolean(env.LIQUIDATOR_DATABASE_URL);
}

export interface ProtocolLiquidationVolumeRow {
  /** liquidator-economy slug, e.g. "aave_v3" / "morpho_blue". */
  protocol: string;
  count: number;
  volumeUsd: number;
}

/**
 * Sum of `debt_amount_usd` and event count per protocol over the trailing
 * 24h window. Mirrors the dashboard's loadLiquidations() rollup; bounded
 * to one row per protocol so the response is small.
 */
export async function fetch24hLiquidationsByProtocol(
  env: Env,
  nowMs: number,
): Promise<ProtocolLiquidationVolumeRow[]> {
  const sql = getSql(env);
  const periodStart = Math.floor(nowMs / 1000) - 24 * 3600;
  const rows = (await sql`
    SELECT
      protocol,
      COUNT(*)::bigint AS n,
      COALESCE(SUM(debt_amount_usd), 0) AS volume
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
    GROUP BY protocol
  `) as Array<{
    protocol: string;
    n: string | number;
    volume: number | string | null;
  }>;
  return rows.map((r) => ({
    protocol: r.protocol,
    count: Number(r.n ?? 0),
    volumeUsd: Number(r.volume ?? 0),
  }));
}

export interface LargestLiquidationRow {
  protocol: string;
  collateral_symbol: string | null;
  debt_amount_usd: number | null;
}

/**
 * Largest single liquidation per protocol in the trailing 24h. Used to
 * enrich the cascade alert with the asset name on the headline event.
 */
export async function fetch24hLargestPerProtocol(
  env: Env,
  nowMs: number,
): Promise<Map<string, LargestLiquidationRow>> {
  const sql = getSql(env);
  const periodStart = Math.floor(nowMs / 1000) - 24 * 3600;
  const rows = (await sql`
    SELECT DISTINCT ON (protocol)
      protocol, collateral_symbol, debt_amount_usd
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
    ORDER BY protocol, debt_amount_usd DESC NULLS LAST
  `) as LargestLiquidationRow[];
  const out = new Map<string, LargestLiquidationRow>();
  for (const r of rows) out.set(r.protocol, r);
  return out;
}
