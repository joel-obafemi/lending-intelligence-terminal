import type { AlertEvent, Env } from "../types";

export async function recordAlert(env: Env, event: AlertEvent): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO alert_history
       (rule_id, alert_key, severity, headline, body, suggested_tweet,
        dashboard_url, data_json, fired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      event.ruleId,
      event.key,
      event.severity,
      event.headline,
      event.body,
      event.suggestedTweet,
      event.dashboardUrl ?? null,
      JSON.stringify(event.data),
      event.firedAt.getTime(),
    )
    .run();
}

export async function recordRuleError(
  env: Env,
  ruleId: string,
  err: unknown,
  occurredAtMs: number,
): Promise<void> {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  await env.ALERTS_DB.prepare(
    `INSERT INTO rule_errors (rule_id, error_message, occurred_at) VALUES (?, ?, ?)`,
  )
    .bind(ruleId, message.slice(0, 4000), occurredAtMs)
    .run();
}

// 24h TVL snapshot helpers used by net_flow_24h.

export async function recordTvlSnapshot(
  env: Env,
  protocol: string,
  snapshotAtMs: number,
  tvlUsd: number,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO tvl_snapshots (protocol, snapshot_at, tvl_usd)
     VALUES (?, ?, ?)
     ON CONFLICT(protocol, snapshot_at) DO UPDATE SET tvl_usd = excluded.tvl_usd`,
  )
    .bind(protocol, snapshotAtMs, tvlUsd)
    .run();
}

export interface TvlSnapshotRow {
  protocol: string;
  snapshot_at: number;
  tvl_usd: number;
}

export async function findTvlAtOrBefore(
  env: Env,
  protocol: string,
  cutoffMs: number,
): Promise<TvlSnapshotRow | null> {
  const row = await env.ALERTS_DB.prepare(
    `SELECT protocol, snapshot_at, tvl_usd
       FROM tvl_snapshots
      WHERE protocol = ? AND snapshot_at <= ?
      ORDER BY snapshot_at DESC
      LIMIT 1`,
  )
    .bind(protocol, cutoffMs)
    .first<TvlSnapshotRow>();
  return row ?? null;
}

// Baseline samples + computed mean/stddev for liquidity_normalization.

export async function recordBaselineSample(
  env: Env,
  metricKey: string,
  sampleAtMs: number,
  value: number,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO baseline_samples (metric_key, sample_at, value)
     VALUES (?, ?, ?)
     ON CONFLICT(metric_key, sample_at) DO UPDATE SET value = excluded.value`,
  )
    .bind(metricKey, sampleAtMs, value)
    .run();
}

export async function pruneBaselineSamples(
  env: Env,
  metricKey: string,
  cutoffMs: number,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `DELETE FROM baseline_samples WHERE metric_key = ? AND sample_at < ?`,
  )
    .bind(metricKey, cutoffMs)
    .run();
}

export interface BaselineStats {
  mean: number;
  stddev: number;
  sampleCount: number;
}

export async function computeBaselineStats(
  env: Env,
  metricKey: string,
  sinceMs: number,
): Promise<BaselineStats | null> {
  const rows = await env.ALERTS_DB.prepare(
    `SELECT value FROM baseline_samples WHERE metric_key = ? AND sample_at >= ?`,
  )
    .bind(metricKey, sinceMs)
    .all<{ value: number }>();

  const values = (rows.results ?? []).map((r) => r.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.length > 1
      ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1)
      : 0;
  return { mean, stddev: Math.sqrt(variance), sampleCount: values.length };
}

export async function upsertRollingBaseline(
  env: Env,
  metricKey: string,
  windowDays: number,
  stats: BaselineStats,
  updatedAtMs: number,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO rolling_baselines
       (metric_key, window_days, mean, stddev, sample_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(metric_key, window_days) DO UPDATE SET
       mean = excluded.mean,
       stddev = excluded.stddev,
       sample_count = excluded.sample_count,
       updated_at = excluded.updated_at`,
  )
    .bind(metricKey, windowDays, stats.mean, stats.stddev, stats.sampleCount, updatedAtMs)
    .run();
}
