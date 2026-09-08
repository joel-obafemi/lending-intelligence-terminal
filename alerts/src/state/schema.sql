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

-- Morpho curator HHI daily history. Daily rule needs (a) most recent prior
-- value for threshold-cross detection, and (b) value from 7 days ago for
-- the 7-day delta check. KV holds the most recent reading; D1 keeps the
-- rolling history so the 7-day comparison survives KV evictions.
CREATE TABLE IF NOT EXISTS hhi_snapshots (
  snapshot_at INTEGER PRIMARY KEY,  -- unix epoch ms at UTC midnight
  hhi REAL NOT NULL,
  total_assets_usd REAL NOT NULL,
  top1_share_pct REAL NOT NULL,
  top2_share_pct REAL NOT NULL,
  top3_share_pct REAL NOT NULL,
  top3_combined_pct REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hhi_snapshots_at ON hhi_snapshots(snapshot_at DESC);

-- Daily digest run record. Used by /digest/preview and to gate retries if
-- a single day's send fails partway.
CREATE TABLE IF NOT EXISTS digest_runs (
  ran_at INTEGER PRIMARY KEY,        -- unix epoch ms
  alerts_count INTEGER NOT NULL,
  recipients TEXT NOT NULL,
  status TEXT NOT NULL,              -- "sent" | "skipped-empty" | "failed"
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_digest_runs_at ON digest_runs(ran_at DESC);

-- ─── Moonwell additions ────────────────────────────────────────────────

-- Per-market supply/borrow snapshots for the 7-day Δ rules. Stored in
-- token units (not USD) so price moves don't muddy the signal. Each row
-- is (chain, market_symbol, snapshot_at). Self-seeds on first run; the
-- rule needs ≥7 days of accumulated rows before it can compare.
CREATE TABLE IF NOT EXISTS moonwell_market_snapshots (
  chain TEXT NOT NULL,
  market_symbol TEXT NOT NULL,
  snapshot_at INTEGER NOT NULL,     -- unix epoch ms
  total_supply REAL NOT NULL,       -- underlying-token units
  total_borrow REAL NOT NULL,
  supply_usd REAL NOT NULL,         -- for display in fired alerts
  borrow_usd REAL NOT NULL,
  PRIMARY KEY (chain, market_symbol, snapshot_at)
);
CREATE INDEX IF NOT EXISTS idx_mw_market_snap_at
  ON moonwell_market_snapshots(snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_mw_market_snap_lookup
  ON moonwell_market_snapshots(chain, market_symbol, snapshot_at DESC);

-- All-time-high tracker for daily protocol revenue. One row per metric_key
-- (currently just "daily_protocol_revenue_usd"). The rule reads + updates
-- atomically per evaluation.
CREATE TABLE IF NOT EXISTS moonwell_revenue_ath (
  metric_key TEXT PRIMARY KEY,      -- "daily_protocol_revenue_usd"
  peak_value REAL NOT NULL,
  peak_date TEXT NOT NULL,          -- ISO YYYY-MM-DD
  updated_at INTEGER NOT NULL
);

-- Daily liquidation count history. Drives the spike rule's 30d rolling
-- mean + stddev. One row per UTC day per chain.
CREATE TABLE IF NOT EXISTS moonwell_liquidation_daily_count (
  chain TEXT NOT NULL,
  day TEXT NOT NULL,                -- ISO YYYY-MM-DD UTC
  count INTEGER NOT NULL,
  volume_usd REAL NOT NULL,
  largest_usd REAL NOT NULL,
  PRIMARY KEY (chain, day)
);
CREATE INDEX IF NOT EXISTS idx_mw_liq_count_day
  ON moonwell_liquidation_daily_count(day DESC);

-- Wrapper-specific "first time hitting 70%" tracker so the rule never
-- double-fires for the same wrapper. Cleared only by truncate.
CREATE TABLE IF NOT EXISTS moonwell_oev_wrapper_capture_fires (
  wrapper_address TEXT PRIMARY KEY,
  wrapper_label TEXT NOT NULL,
  chain TEXT NOT NULL,
  capture_rate_pct REAL NOT NULL,
  fired_at INTEGER NOT NULL
);
