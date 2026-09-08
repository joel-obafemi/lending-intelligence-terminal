/**
 * D1 helpers specific to the Moonwell rules. Kept in a separate file from
 * d1.ts so the lending-terminal helpers and Moonwell helpers don't grow
 * tangled — each product has its own state surface.
 */

import type { Env } from "../types";

/* ── Market snapshots (supply/borrow Δ-7d) ─────────────────────────── */

export interface MarketSnapshotRow {
  chain: string;
  market_symbol: string;
  snapshot_at: number;
  total_supply: number;
  total_borrow: number;
  supply_usd: number;
  borrow_usd: number;
}

export async function recordMarketSnapshot(
  env: Env,
  row: MarketSnapshotRow,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO moonwell_market_snapshots
       (chain, market_symbol, snapshot_at, total_supply, total_borrow, supply_usd, borrow_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chain, market_symbol, snapshot_at) DO UPDATE
       SET total_supply = excluded.total_supply,
           total_borrow = excluded.total_borrow,
           supply_usd = excluded.supply_usd,
           borrow_usd = excluded.borrow_usd`,
  )
    .bind(
      row.chain,
      row.market_symbol,
      row.snapshot_at,
      row.total_supply,
      row.total_borrow,
      row.supply_usd,
      row.borrow_usd,
    )
    .run();
}

/**
 * Returns the snapshot for (chain, market) at or before `cutoffMs`.
 * Used by the 7-day Δ rules — pass `now - 7d`. Returns null when no row
 * yet exists (rule then seeds and skips firing).
 */
export async function findMarketSnapshotAtOrBefore(
  env: Env,
  chain: string,
  marketSymbol: string,
  cutoffMs: number,
): Promise<MarketSnapshotRow | null> {
  return (
    (await env.ALERTS_DB.prepare(
      `SELECT chain, market_symbol, snapshot_at, total_supply, total_borrow, supply_usd, borrow_usd
         FROM moonwell_market_snapshots
        WHERE chain = ? AND market_symbol = ? AND snapshot_at <= ?
        ORDER BY snapshot_at DESC
        LIMIT 1`,
    )
      .bind(chain, marketSymbol, cutoffMs)
      .first<MarketSnapshotRow>()) ?? null
  );
}

/* ── Revenue ATH ───────────────────────────────────────────────────── */

export interface RevenueAthRow {
  metric_key: string;
  peak_value: number;
  peak_date: string;
  updated_at: number;
}

export async function getRevenueAth(
  env: Env,
  metricKey: string,
): Promise<RevenueAthRow | null> {
  return (
    (await env.ALERTS_DB.prepare(
      `SELECT metric_key, peak_value, peak_date, updated_at
         FROM moonwell_revenue_ath WHERE metric_key = ?`,
    )
      .bind(metricKey)
      .first<RevenueAthRow>()) ?? null
  );
}

export async function setRevenueAth(
  env: Env,
  row: RevenueAthRow,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO moonwell_revenue_ath (metric_key, peak_value, peak_date, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(metric_key) DO UPDATE
       SET peak_value = excluded.peak_value,
           peak_date = excluded.peak_date,
           updated_at = excluded.updated_at`,
  )
    .bind(row.metric_key, row.peak_value, row.peak_date, row.updated_at)
    .run();
}

/* ── Liquidation daily counts (spike-rule baseline) ────────────────── */

export interface LiquidationDailyRow {
  chain: string;
  day: string;
  count: number;
  volume_usd: number;
  largest_usd: number;
}

export async function recordLiquidationDay(
  env: Env,
  row: LiquidationDailyRow,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO moonwell_liquidation_daily_count (chain, day, count, volume_usd, largest_usd)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chain, day) DO UPDATE
       SET count = excluded.count,
           volume_usd = excluded.volume_usd,
           largest_usd = excluded.largest_usd`,
  )
    .bind(row.chain, row.day, row.count, row.volume_usd, row.largest_usd)
    .run();
}

export async function listLiquidationDays(
  env: Env,
  chain: string,
  fromDay: string,
  toDay: string,
): Promise<LiquidationDailyRow[]> {
  const res = await env.ALERTS_DB.prepare(
    `SELECT chain, day, count, volume_usd, largest_usd
       FROM moonwell_liquidation_daily_count
      WHERE chain = ? AND day >= ? AND day <= ?
      ORDER BY day ASC`,
  )
    .bind(chain, fromDay, toDay)
    .all<LiquidationDailyRow>();
  return res.results ?? [];
}

/* ── OEV wrapper one-shot ──────────────────────────────────────────── */

export interface WrapperCaptureFireRow {
  wrapper_address: string;
  wrapper_label: string;
  chain: string;
  capture_rate_pct: number;
  fired_at: number;
}

export async function hasWrapperCaptureFired(
  env: Env,
  wrapperAddress: string,
): Promise<boolean> {
  const row = await env.ALERTS_DB.prepare(
    `SELECT 1 FROM moonwell_oev_wrapper_capture_fires WHERE wrapper_address = ? LIMIT 1`,
  )
    .bind(wrapperAddress)
    .first();
  return row !== null;
}

export async function recordWrapperCaptureFire(
  env: Env,
  row: WrapperCaptureFireRow,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO moonwell_oev_wrapper_capture_fires
       (wrapper_address, wrapper_label, chain, capture_rate_pct, fired_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(wrapper_address) DO NOTHING`,
  )
    .bind(
      row.wrapper_address,
      row.wrapper_label,
      row.chain,
      row.capture_rate_pct,
      row.fired_at,
    )
    .run();
}
