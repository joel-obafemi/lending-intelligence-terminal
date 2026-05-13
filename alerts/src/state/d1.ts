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

// Morpho HHI snapshot helpers.

export interface HhiSnapshotRow {
  snapshot_at: number;
  hhi: number;
  total_assets_usd: number;
  top1_share_pct: number;
  top2_share_pct: number;
  top3_share_pct: number;
  top3_combined_pct: number;
}

export async function recordHhiSnapshot(
  env: Env,
  row: HhiSnapshotRow,
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO hhi_snapshots
       (snapshot_at, hhi, total_assets_usd,
        top1_share_pct, top2_share_pct, top3_share_pct, top3_combined_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(snapshot_at) DO UPDATE SET
       hhi = excluded.hhi,
       total_assets_usd = excluded.total_assets_usd,
       top1_share_pct = excluded.top1_share_pct,
       top2_share_pct = excluded.top2_share_pct,
       top3_share_pct = excluded.top3_share_pct,
       top3_combined_pct = excluded.top3_combined_pct`,
  )
    .bind(
      row.snapshot_at,
      row.hhi,
      row.total_assets_usd,
      row.top1_share_pct,
      row.top2_share_pct,
      row.top3_share_pct,
      row.top3_combined_pct,
    )
    .run();
}

export async function findHhiSnapshotAtOrBefore(
  env: Env,
  cutoffMs: number,
): Promise<HhiSnapshotRow | null> {
  const row = await env.ALERTS_DB.prepare(
    `SELECT snapshot_at, hhi, total_assets_usd,
            top1_share_pct, top2_share_pct, top3_share_pct, top3_combined_pct
       FROM hhi_snapshots
      WHERE snapshot_at <= ?
      ORDER BY snapshot_at DESC
      LIMIT 1`,
  )
    .bind(cutoffMs)
    .first<HhiSnapshotRow>();
  return row ?? null;
}

// Daily digest helpers.

export async function recentAlertsSince(
  env: Env,
  sinceMs: number,
  limit = 200,
): Promise<
  Array<{
    rule_id: string;
    alert_key: string;
    severity: string;
    headline: string;
    body: string;
    suggested_tweet: string;
    dashboard_url: string | null;
    fired_at: number;
  }>
> {
  const rows = await env.ALERTS_DB.prepare(
    `SELECT rule_id, alert_key, severity, headline, body, suggested_tweet,
            dashboard_url, fired_at
       FROM alert_history
      WHERE fired_at >= ?
      ORDER BY fired_at DESC
      LIMIT ?`,
  )
    .bind(sinceMs, limit)
    .all<{
      rule_id: string;
      alert_key: string;
      severity: string;
      headline: string;
      body: string;
      suggested_tweet: string;
      dashboard_url: string | null;
      fired_at: number;
    }>();
  return rows.results ?? [];
}

export async function recordDigestRun(
  env: Env,
  row: {
    ran_at: number;
    alerts_count: number;
    recipients: string;
    status: "sent" | "skipped-empty" | "failed";
    error_message?: string;
  },
): Promise<void> {
  await env.ALERTS_DB.prepare(
    `INSERT INTO digest_runs
       (ran_at, alerts_count, recipients, status, error_message)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      row.ran_at,
      row.alerts_count,
      row.recipients,
      row.status,
      row.error_message ?? null,
    )
    .run();
}
