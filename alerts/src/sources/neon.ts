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
// ─── whale_liquidation queries ──────────────────────────────────

export interface WhaleLiquidationRow {
  tx_hash: string;
  protocol: string;
  collateral_symbol: string;
  debt_symbol: string;
  collateral_amount_usd: number;
  debt_amount_usd: number;
  gross_profit_usd: number;
  liquidator: string;
  borrower: string;
  block_timestamp: number;
}

/**
 * Fetch individual liquidation events with collateral > threshold since a
 * given timestamp. Used by the whale_liquidation fast rule.
 */
export async function fetchWhaleEvents(
  env: Env,
  sinceSec: number,
  minCollateralUsd: number,
): Promise<WhaleLiquidationRow[]> {
  const sql = getSql(env);
  const rows = (await sql`
    SELECT
      tx_hash, protocol, collateral_symbol, debt_symbol,
      collateral_amount_usd, debt_amount_usd, gross_profit_usd,
      liquidator, borrower, block_timestamp
    FROM liquidation_events
    WHERE block_timestamp >= ${sinceSec}
      AND collateral_amount_usd >= ${minCollateralUsd}
    ORDER BY collateral_amount_usd DESC
    LIMIT 20
  `) as WhaleLiquidationRow[];
  return rows.map((r) => ({
    ...r,
    collateral_amount_usd: Number(r.collateral_amount_usd),
    debt_amount_usd: Number(r.debt_amount_usd),
    gross_profit_usd: Number(r.gross_profit_usd),
    block_timestamp: Number(r.block_timestamp),
  }));
}

// ─── cascade_burst queries ──────────────────────────────────────

export interface BlockBurstRow {
  block_number: number;
  block_timestamp: number;
  event_count: number;
  total_collateral_usd: number;
  protocols: string;
}

/**
 * Find blocks with >= minEvents liquidation events in the trailing window.
 */
export async function fetchBlockBursts(
  env: Env,
  sinceSec: number,
  minEvents: number,
): Promise<BlockBurstRow[]> {
  const sql = getSql(env);
  const rows = (await sql`
    SELECT
      block_number,
      MIN(block_timestamp) as block_timestamp,
      COUNT(*)::int as event_count,
      COALESCE(SUM(collateral_amount_usd), 0) as total_collateral_usd,
      string_agg(DISTINCT protocol, ',') as protocols
    FROM liquidation_events
    WHERE block_timestamp >= ${sinceSec}
    GROUP BY block_number
    HAVING COUNT(*) >= ${minEvents}
    ORDER BY event_count DESC
    LIMIT 10
  `) as BlockBurstRow[];
  return rows.map((r) => ({
    block_number: Number(r.block_number),
    block_timestamp: Number(r.block_timestamp),
    event_count: Number(r.event_count),
    total_collateral_usd: Number(r.total_collateral_usd),
    protocols: String(r.protocols),
  }));
}

/**
 * Count total events in a 1-hour window ending at nowSec.
 */
export async function fetchHourlyEventCount(
  env: Env,
  nowSec: number,
): Promise<{ count: number; volumeUsd: number }> {
  const sql = getSql(env);
  const oneHourAgo = nowSec - 3600;
  const rows = (await sql`
    SELECT COUNT(*)::int as cnt, COALESCE(SUM(collateral_amount_usd), 0) as vol
    FROM liquidation_events
    WHERE block_timestamp >= ${oneHourAgo} AND block_timestamp <= ${nowSec}
  `) as Array<{ cnt: number; vol: number }>;
  return { count: Number(rows[0]?.cnt ?? 0), volumeUsd: Number(rows[0]?.vol ?? 0) };
}

// ─── daily_volume_spike queries ─────────────────────────────────

export interface DailyVolumeRow {
  protocol: string;
  volume24h: number;
  count24h: number;
  volume30dDaily: number;
  count30dDaily: number;
}

/**
 * Compare 24h rolling volume vs 30-day daily average per protocol.
 */
export async function fetchVolumeVsBaseline(
  env: Env,
  nowSec: number,
): Promise<DailyVolumeRow[]> {
  const sql = getSql(env);
  const oneDayAgo = nowSec - 86400;
  const thirtyDaysAgo = nowSec - 30 * 86400;
  const rows = (await sql`
    WITH last24h AS (
      SELECT protocol, COUNT(*)::int as cnt, COALESCE(SUM(collateral_amount_usd), 0) as vol
      FROM liquidation_events
      WHERE block_timestamp >= ${oneDayAgo}
      GROUP BY protocol
    ),
    last30d AS (
      SELECT protocol, COUNT(*)::int as cnt, COALESCE(SUM(collateral_amount_usd), 0) as vol
      FROM liquidation_events
      WHERE block_timestamp >= ${thirtyDaysAgo} AND block_timestamp < ${oneDayAgo}
      GROUP BY protocol
    )
    SELECT
      COALESCE(a.protocol, b.protocol) as protocol,
      COALESCE(a.vol, 0) as volume24h,
      COALESCE(a.cnt, 0) as count24h,
      COALESCE(b.vol / 29.0, 0) as volume30d_daily,
      COALESCE(b.cnt / 29.0, 0) as count30d_daily
    FROM last24h a
    FULL OUTER JOIN last30d b ON a.protocol = b.protocol
    WHERE COALESCE(a.vol, 0) > 0 OR COALESCE(b.vol, 0) > 0
  `) as Array<{
    protocol: string;
    volume24h: number;
    count24h: number;
    volume30d_daily: number;
    count30d_daily: number;
  }>;
  return rows.map((r) => ({
    protocol: r.protocol,
    volume24h: Number(r.volume24h),
    count24h: Number(r.count24h),
    volume30dDaily: Number(r.volume30d_daily),
    count30dDaily: Number(r.count30d_daily),
  }));
}

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
