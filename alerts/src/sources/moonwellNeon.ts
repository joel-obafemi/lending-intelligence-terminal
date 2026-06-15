/**
 * Worker-friendly Neon HTTP client for the moonwell-dashboard's Postgres.
 * Separate from sources/neon.ts (which targets the liquidator-economy DB);
 * each product has its own DATABASE_URL secret and connection cache.
 *
 * Read-only. The alerts Worker never writes to the moonwell-dashboard DB.
 * Connection string lives in MOONWELL_DATABASE_URL (wrangler secret).
 *
 * Schema reference (from moonwell-dashboard/lib/schema.sql):
 *   - oev_events (chain, wrapper_address, wrapper_label, wrapper_deprecated,
 *                 protocol_fee_usd, liquidator_fee_usd, repay_amount_usd,
 *                 block_timestamp, ...)
 *   - liquidation_events (tx_hash, block_number, timestamp, debt_symbol,
 *                         collateral_symbol, liquidator, borrower,
 *                         debt_repaid_usd, collateral_seized_usd, ...)
 *
 * Capture-rate calc mirrors worker-api/src/routes/oev.ts:186 — the
 * dashboard's headline filters `wrapper_deprecated = false` and uses
 * GREATEST(liquidator_fee_usd - repay_amount_usd, 0) as the liquidator-
 * bonus numerator (so principal reimbursement doesn't dilute capture).
 */

import { neon } from "@neondatabase/serverless";
import type { Env } from "../types";

type NeonSql = ReturnType<typeof neon>;

let cached: NeonSql | null = null;
let cachedConnString: string | null = null;

function getSql(env: Env): NeonSql {
  if (!env.MOONWELL_DATABASE_URL) {
    throw new Error(
      "MOONWELL_DATABASE_URL is not set. Run `wrangler secret put MOONWELL_DATABASE_URL`.",
    );
  }
  const url = env.MOONWELL_DATABASE_URL.replace(/&?channel_binding=[^&]*/g, "");
  if (!cached || cachedConnString !== url) {
    cached = neon(url);
    cachedConnString = url;
  }
  return cached;
}

export function hasMoonwellDb(env: Env): boolean {
  return Boolean(env.MOONWELL_DATABASE_URL);
}

/* ── OEV ───────────────────────────────────────────────────────────── */

/**
 * Cumulative V2 (post-MIP-X56) OEV protocol revenue + liquidator-bonus
 * since the active wrappers started emitting. `wrapper_deprecated = false`
 * filter matches the dashboard's capture-rate definition.
 */
export interface OevCumulativeRow {
  protocolRevenueUsd: number;
  liquidatorBonusUsd: number;
  liquidations: number;
  /** GREATEST(0, sum) / (sum + bonus) — same as dashboard. Returns null when no events yet. */
  captureRatePct: number | null;
}

export async function fetchOevCumulativeV2(env: Env): Promise<OevCumulativeRow> {
  const sql = getSql(env);
  const rows = (await sql`
    SELECT
      COALESCE(SUM(protocol_fee_usd), 0)                                   AS protocol_usd,
      COALESCE(SUM(GREATEST(liquidator_fee_usd - COALESCE(repay_amount_usd, 0), 0)), 0)
                                                                            AS bonus_usd,
      COUNT(*)::bigint                                                     AS n
    FROM oev_events
    WHERE wrapper_deprecated = false
  `) as Array<{ protocol_usd: number; bonus_usd: number; n: string | number }>;
  const row = rows[0];
  const protocolUsd = Number(row?.protocol_usd ?? 0);
  const bonusUsd = Number(row?.bonus_usd ?? 0);
  const denom = protocolUsd + bonusUsd;
  const captureRatePct = denom > 0 ? (protocolUsd / denom) * 100 : null;
  return {
    protocolRevenueUsd: protocolUsd,
    liquidatorBonusUsd: bonusUsd,
    liquidations: Number(row?.n ?? 0),
    captureRatePct,
  };
}

/**
 * Per-wrapper capture rate, V2 only. Used by the "first time ≥70%" rule.
 * Returns one row per wrapper address with current cumulative numbers.
 */
export interface WrapperCaptureRow {
  wrapper_address: string;
  wrapper_label: string;
  chain: string;
  liquidations: number;
  protocolUsd: number;
  bonusUsd: number;
  captureRatePct: number | null;
}

export async function fetchPerWrapperCaptureV2(env: Env): Promise<WrapperCaptureRow[]> {
  const sql = getSql(env);
  const rows = (await sql`
    SELECT
      wrapper_address,
      wrapper_label,
      chain,
      COUNT(*)::bigint                                                     AS n,
      COALESCE(SUM(protocol_fee_usd), 0)                                   AS protocol_usd,
      COALESCE(SUM(GREATEST(liquidator_fee_usd - COALESCE(repay_amount_usd, 0), 0)), 0)
                                                                            AS bonus_usd
    FROM oev_events
    WHERE wrapper_deprecated = false
    GROUP BY wrapper_address, wrapper_label, chain
  `) as Array<{
    wrapper_address: string;
    wrapper_label: string;
    chain: string;
    n: string | number;
    protocol_usd: number;
    bonus_usd: number;
  }>;
  return rows.map((r) => {
    const protocolUsd = Number(r.protocol_usd ?? 0);
    const bonusUsd = Number(r.bonus_usd ?? 0);
    const denom = protocolUsd + bonusUsd;
    return {
      wrapper_address: r.wrapper_address,
      wrapper_label: r.wrapper_label,
      chain: r.chain,
      liquidations: Number(r.n ?? 0),
      protocolUsd,
      bonusUsd,
      captureRatePct: denom > 0 ? (protocolUsd / denom) * 100 : null,
    };
  });
}

/** Weekly OEV slice for the Monday recap. V2-only. */
export async function fetchOevTrailing7d(env: Env, nowSeconds: number) {
  const sql = getSql(env);
  const since = nowSeconds - 7 * 24 * 3600;
  const rows = (await sql`
    SELECT
      COUNT(*)::bigint                                                     AS n,
      COALESCE(SUM(protocol_fee_usd), 0)                                   AS protocol_usd,
      COALESCE(SUM(GREATEST(liquidator_fee_usd - COALESCE(repay_amount_usd, 0), 0)), 0)
                                                                            AS bonus_usd
    FROM oev_events
    WHERE wrapper_deprecated = false AND block_timestamp >= ${since}
  `) as Array<{ n: string | number; protocol_usd: number; bonus_usd: number }>;
  const row = rows[0];
  const protocolUsd = Number(row?.protocol_usd ?? 0);
  const bonusUsd = Number(row?.bonus_usd ?? 0);
  const denom = protocolUsd + bonusUsd;
  return {
    liquidations: Number(row?.n ?? 0),
    protocolUsd,
    bonusUsd,
    captureRatePct: denom > 0 ? (protocolUsd / denom) * 100 : null,
  };
}

/* ── Liquidations ──────────────────────────────────────────────────── */

export interface LiquidationEventRow {
  tx_hash: string;
  block_number: number;
  timestamp: number;
  debt_symbol: string;
  collateral_symbol: string;
  liquidator: string;
  borrower: string;
  debt_repaid_usd: number;
  collateral_seized_usd: number;
  /** moonwell-dashboard liquidation_events may not have a chain column
      depending on schema migration state — falls back to "base" if NULL. */
  chain: string;
}

/**
 * Single-event whale liquidations within the lookback window.
 *
 * Note: moonwell-dashboard `liquidation_events` schema has no `chain` column
 * yet (Base-only at the time of writing). Hardcode 'base' so the rule
 * output is well-formed; if a chain column lands in a future migration we
 * can lift this to a real SELECT.
 */
export async function fetchRecentLargeLiquidations(
  env: Env,
  nowSeconds: number,
  lookbackSeconds: number,
  minSeizedUsd: number,
): Promise<LiquidationEventRow[]> {
  const sql = getSql(env);
  const since = nowSeconds - lookbackSeconds;
  const rows = (await sql`
    SELECT
      tx_hash, block_number, timestamp,
      debt_symbol, collateral_symbol, liquidator, borrower,
      debt_repaid_usd, collateral_seized_usd
    FROM liquidation_events
    WHERE timestamp >= ${since}
      AND collateral_seized_usd >= ${minSeizedUsd}
    ORDER BY collateral_seized_usd DESC
    LIMIT 50
  `) as Array<Omit<LiquidationEventRow, "chain">>;
  return rows.map((r) => ({ ...r, chain: "base" }));
}

/** Daily liquidation counts per chain over the trailing N days. */
export interface DailyLiquidationRollupRow {
  chain: string;
  day: string;
  count: number;
  volume_usd: number;
  largest_usd: number;
}

export async function fetchDailyLiquidationRollup(
  env: Env,
  nowSeconds: number,
  windowDays: number,
): Promise<DailyLiquidationRollupRow[]> {
  const sql = getSql(env);
  const since = nowSeconds - windowDays * 24 * 3600;
  const rows = (await sql`
    SELECT
      to_char(to_timestamp(timestamp) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS n,
      COALESCE(SUM(collateral_seized_usd), 0) AS volume,
      COALESCE(MAX(collateral_seized_usd), 0) AS largest
    FROM liquidation_events
    WHERE timestamp >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `) as Array<{
    day: string;
    n: string | number;
    volume: number | string | null;
    largest: number | string | null;
  }>;
  return rows.map((r) => ({
    chain: "base",
    day: r.day,
    count: Number(r.n ?? 0),
    volume_usd: Number(r.volume ?? 0),
    largest_usd: Number(r.largest ?? 0),
  }));
}
