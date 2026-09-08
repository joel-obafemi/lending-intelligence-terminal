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

/* ── Dashboard self-audit ────────────────────────────────────────────
 * The moonwell-dashboard-audit worker (cron 0 2 UTC daily) writes one
 * row per coverage check to `dashboard_audits`. We read the last run's
 * rows and surface any fail/error so the digest catches scanner rot the
 * way the Moonwell team's Jun-15-21 gap report would have, but earlier.
 */
export interface DashboardAuditFailure {
  checkName: string;
  surface: string;
  chain: string;
  status: "fail" | "error";
  deltaPct: number | null;
  onChainCount: number | null;
  dbCount: number | null;
  notes: string | null;
  runAt: string;
}

/* ── Per-market daily snapshots (for supply/borrow Δ alerts) ──────────
 * Reads from moonwell-dashboard's `daily_chain_snapshots` table, which the
 * worker-scanner-fin cron populates every 30 min via lib/snapshots-cache.ts
 * snapshotAllChains(). Each row: (chain, market_symbol, date, supply_usd,
 * borrow_usd, ...). One row per market per UTC day, latest-write-wins.
 *
 * Used by the market-supply/borrow-Δ alert rules. Pre-2026-06-29 they
 * wrote their own D1 snapshots sourced from DefiLlama's yields API —
 * but that API stopped exposing per-pool totalBorrowUsd, so borrow
 * alerts could never fire. The dashboard's Neon snapshot has both
 * supply and borrow because it reads on-chain mToken state directly.
 */
export interface MarketDeltaRow {
  chain: string;
  market_symbol: string;
  current_supply_usd: number;
  current_borrow_usd: number;
  prior_supply_usd: number;
  prior_borrow_usd: number;
  current_date: string;       // ISO date 'YYYY-MM-DD'
  prior_date: string;
}

/**
 * For each (chain, market), return the latest snapshot + the snapshot
 * closest to `daysBack` days ago. Used to compute 7-day Δ. Markets with
 * no usable prior get filtered out.
 */
export async function fetchMarketDeltaPairs(
  env: Env,
  daysBack = 7,
  toleranceDays = 2,
): Promise<MarketDeltaRow[]> {
  const sql = getSql(env);
  // The ::int casts on every interpolated parameter are LOAD-BEARING.
  // The Neon HTTP driver sends parameters untyped, and Postgres refuses
  // to plan `$1 + $2` between two unknowns ("operator is not unique:
  // unknown + unknown"). Pre-fix (until 2026-07-14) this query threw on
  // EVERY invocation, the delta rules silently fell back to the legacy
  // DefiLlama path, and the alerts fired with DefiLlama's tvlUsd
  // (= available liquidity, not supply) under DefiLlama's symbol names
  // ("ETH supply on Base down -42%" was really Base WETH *liquidity*).
  // Same param-binding gotcha previously hit the Morpho dashboard's
  // /assets and /curators routes.
  const rows = (await sql`
    WITH latest AS (
      SELECT DISTINCT ON (chain, market_symbol)
        chain, market_symbol, date, total_supply_usd AS supply, total_borrow_usd AS borrow
      FROM daily_chain_snapshots
      ORDER BY chain, market_symbol, date DESC
    ),
    prior AS (
      SELECT DISTINCT ON (chain, market_symbol)
        chain, market_symbol, date, total_supply_usd AS supply, total_borrow_usd AS borrow
      FROM daily_chain_snapshots
      WHERE date BETWEEN
            (CURRENT_DATE - (${daysBack}::int + ${toleranceDays}::int))::date
        AND (CURRENT_DATE - (${daysBack}::int - ${toleranceDays}::int))::date
      ORDER BY chain, market_symbol, ABS(date - (CURRENT_DATE - ${daysBack}::int)::date)
    )
    SELECT
      l.chain, l.market_symbol,
      l.supply AS current_supply_usd,
      l.borrow AS current_borrow_usd,
      p.supply AS prior_supply_usd,
      p.borrow AS prior_borrow_usd,
      l.date::text AS current_date,
      p.date::text AS prior_date
    FROM latest l
    JOIN prior p ON p.chain = l.chain AND p.market_symbol = l.market_symbol
  `) as Array<{
    chain: string; market_symbol: string;
    current_supply_usd: number | string | null;
    current_borrow_usd: number | string | null;
    prior_supply_usd: number | string | null;
    prior_borrow_usd: number | string | null;
    current_date: string; prior_date: string;
  }>;
  return rows.map((r) => ({
    chain: r.chain,
    market_symbol: r.market_symbol,
    current_supply_usd: Number(r.current_supply_usd ?? 0),
    current_borrow_usd: Number(r.current_borrow_usd ?? 0),
    prior_supply_usd: Number(r.prior_supply_usd ?? 0),
    prior_borrow_usd: Number(r.prior_borrow_usd ?? 0),
    current_date: r.current_date,
    prior_date: r.prior_date,
  }));
}

export async function fetchDashboardAuditFailures(
  env: Env,
  lookbackHours = 36,
): Promise<DashboardAuditFailure[]> {
  const sql = getSql(env);
  // One row per (check_name) — the latest run in the lookback window.
  // If a check has been failing for 3 daily runs in a row we still only
  // alert once per cooldown period; the rule's `key` enforces that.
  const rows = (await sql`
    WITH ranked AS (
      SELECT check_name, surface, chain, status,
             delta_pct, on_chain_count, db_count, notes,
             run_at,
             ROW_NUMBER() OVER (PARTITION BY check_name ORDER BY run_at DESC) AS rn
      FROM dashboard_audits
      WHERE run_at > now() - (${lookbackHours} || ' hours')::interval
    )
    SELECT check_name, surface, chain, status, delta_pct,
           on_chain_count, db_count, notes, run_at::text AS run_at
    FROM ranked
    WHERE rn = 1 AND status IN ('fail', 'error')
    ORDER BY chain, surface
  `) as Array<{
    check_name: string; surface: string; chain: string; status: string;
    delta_pct: number | null; on_chain_count: number | null; db_count: number | null;
    notes: string | null; run_at: string;
  }>;
  return rows.map((r) => ({
    checkName: r.check_name,
    surface: r.surface,
    chain: r.chain,
    status: r.status as "fail" | "error",
    deltaPct: r.delta_pct,
    onChainCount: r.on_chain_count,
    dbCount: r.db_count,
    notes: r.notes,
    runAt: r.run_at,
  }));
}
