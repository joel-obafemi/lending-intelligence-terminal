-- DatumLabs alert system D1 schema. Safe to re-apply.

CREATE TABLE IF NOT EXISTS alert_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  suggested_tweet TEXT NOT NULL,
  dashboard_url TEXT,
  data_json TEXT,
  fired_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_history_fired_at ON alert_history(fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id, fired_at DESC);

CREATE TABLE IF NOT EXISTS rolling_baselines (
  metric_key TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  mean REAL NOT NULL,
  stddev REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (metric_key, window_days)
);

CREATE TABLE IF NOT EXISTS baseline_samples (
  metric_key TEXT NOT NULL,
  sample_at INTEGER NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (metric_key, sample_at)
);
CREATE INDEX IF NOT EXISTS idx_baseline_samples_metric_time ON baseline_samples(metric_key, sample_at DESC);

CREATE TABLE IF NOT EXISTS tvl_snapshots (
  protocol TEXT NOT NULL,
  snapshot_at INTEGER NOT NULL,
  tvl_usd REAL NOT NULL,
  PRIMARY KEY (protocol, snapshot_at)
);
CREATE INDEX IF NOT EXISTS idx_tvl_snapshots_at ON tvl_snapshots(snapshot_at DESC);

CREATE TABLE IF NOT EXISTS cooldowns (
  cooldown_key TEXT PRIMARY KEY,
  last_fired_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  error_message TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rule_errors_at ON rule_errors(occurred_at DESC);
