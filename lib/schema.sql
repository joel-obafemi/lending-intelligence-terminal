-- Lending Intelligence Terminal — base schema
-- Covers Aave V3, Spark, Morpho Blue, Fluid on Ethereum.
-- Apply with: npm run db:init

-- ─── Protocol registry ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS protocols (
  slug TEXT PRIMARY KEY,                -- 'aave-v3', 'spark', 'morpho-blue', 'fluid'
  name TEXT NOT NULL,                   -- 'Aave V3'
  chain TEXT NOT NULL DEFAULT 'ethereum',
  architecture TEXT NOT NULL,           -- 'pool' | 'isolated' | 'vault'
  deploy_block BIGINT,
  defillama_slug TEXT,                  -- DefiLlama protocol slug for TVL/fees
  pool_address TEXT,                    -- Aave V3 / Spark pool; Morpho singleton; Fluid factory
  oracle_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Markets (individual reserves / isolated markets / vaults) ─────────────
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,                  -- <protocol_slug>:<market_identifier>
  protocol_slug TEXT NOT NULL REFERENCES protocols(slug),
  market_identifier TEXT NOT NULL,      -- reserve address for Aave/Spark, marketId for Morpho, vault address for Fluid
  loan_asset TEXT,                      -- token address (lowercase)
  loan_symbol TEXT,
  loan_decimals INT,
  collateral_asset TEXT,                -- only for isolated markets / vaults (null for pool-based reserves)
  collateral_symbol TEXT,
  collateral_decimals INT,
  ltv_bps INT,                          -- loan-to-value in basis points (e.g. 7500 = 75%)
  liquidation_threshold_bps INT,
  liquidation_bonus_bps INT,
  reserve_factor_bps INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS markets_protocol_idx ON markets(protocol_slug);
CREATE INDEX IF NOT EXISTS markets_loan_asset_idx ON markets(loan_asset);

-- ─── Historical daily prices (DefiLlama backfill + on-chain oracle snapshots) ─
CREATE TABLE IF NOT EXISTS daily_prices (
  token_address TEXT NOT NULL,          -- lowercase
  day DATE NOT NULL,
  price_usd DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL DEFAULT 'defillama',
  PRIMARY KEY (token_address, day)
);
CREATE INDEX IF NOT EXISTS daily_prices_day_idx ON daily_prices(day);

-- ─── Historical reserve factor changes ─────────────────────────────────────
-- Revenue = interest × reserve_factor at block. Parameters change via governance,
-- so we store each change and look up by block range.
CREATE TABLE IF NOT EXISTS reserve_factor_history (
  protocol_slug TEXT NOT NULL REFERENCES protocols(slug),
  market_identifier TEXT NOT NULL,
  effective_from_block BIGINT NOT NULL,
  reserve_factor_bps INT NOT NULL,
  source TEXT,                          -- governance proposal link or note
  PRIMARY KEY (protocol_slug, market_identifier, effective_from_block)
);

-- ─── Scanner cursor state ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_state (
  scanner_name TEXT PRIMARY KEY,        -- 'aave_v3_markets', 'morpho_markets', 'fluid_vaults_discovery', etc.
  last_scanned_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Daily per-protocol aggregate metrics (Page 1 source) ──────────────────
-- Populated from DefiLlama and on-chain snapshots. Phase 1 uses DefiLlama only.
CREATE TABLE IF NOT EXISTS daily_protocol_metrics (
  protocol_slug TEXT NOT NULL REFERENCES protocols(slug),
  day DATE NOT NULL,
  tvl_usd DOUBLE PRECISION,
  borrowed_usd DOUBLE PRECISION,
  supplied_usd DOUBLE PRECISION,        -- supplied = tvl + borrowed (for pool-based protocols)
  fees_usd DOUBLE PRECISION,            -- 24h fees from DefiLlama
  revenue_usd DOUBLE PRECISION,         -- 24h revenue (fees × reserve factor aggregate)
  active_markets INT,
  source TEXT NOT NULL DEFAULT 'defillama',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (protocol_slug, day)
);
CREATE INDEX IF NOT EXISTS daily_protocol_metrics_day_idx ON daily_protocol_metrics(day);

-- ─── Daily rate snapshots (supply + borrow APY + utilization) ──────────────
-- Populated by `scripts/snapshot-rates.ts` (run daily via cron). Backfills
-- borrow-APY history that DefiLlama's free API doesn't provide. Each row is
-- one (protocol, asset, day) observation; UPSERT idempotently so re-runs
-- don't double-count.
CREATE TABLE IF NOT EXISTS rate_snapshots (
  protocol_slug TEXT NOT NULL REFERENCES protocols(slug),
  symbol TEXT NOT NULL,                 -- uppercase (WETH, USDC, ...)
  day DATE NOT NULL,
  supply_apy DOUBLE PRECISION,          -- base supply APY %, null if missing
  borrow_apy DOUBLE PRECISION,          -- base borrow APY %
  utilization_pct DOUBLE PRECISION,
  supply_usd DOUBLE PRECISION,
  borrow_usd DOUBLE PRECISION,
  pool_id TEXT,                         -- DefiLlama Yields pool UUID
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (protocol_slug, symbol, day)
);
CREATE INDEX IF NOT EXISTS rate_snapshots_day_idx ON rate_snapshots(day);
CREATE INDEX IF NOT EXISTS rate_snapshots_symbol_idx ON rate_snapshots(symbol);

-- ─── Daily per-market metrics (Page 2 source) ──────────────────────────────
-- Populated from on-chain scanners once those land in Phase 1.5.
CREATE TABLE IF NOT EXISTS daily_market_metrics (
  market_id TEXT NOT NULL REFERENCES markets(id),
  day DATE NOT NULL,
  tvl_usd DOUBLE PRECISION,
  borrowed_usd DOUBLE PRECISION,
  utilization_pct DOUBLE PRECISION,
  supply_apy_pct DOUBLE PRECISION,
  borrow_apy_pct DOUBLE PRECISION,
  PRIMARY KEY (market_id, day)
);

-- ─── Seed the four protocols we're launching with ──────────────────────────
INSERT INTO protocols (slug, name, architecture, defillama_slug, pool_address, oracle_address, deploy_block)
VALUES
  ('aave-v3',     'Aave V3',     'pool',     'aave-v3',     '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', '0x54586be62e3c3580375ae3723c145253060ca0c2', 16291127),
  ('spark',       'Spark',       'pool',     'sparklend',   '0xc13e21b648a5ee794902342038ff3adab66be987', NULL,                                         16848000),
  ('morpho-blue', 'Morpho Blue', 'isolated', 'morpho-blue', '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb', NULL,                                         18883124),
  ('fluid',       'Fluid',       'vault',    'fluid',       '0x741c2bf99a56246b57f12f53be73ef0abedc7c98', NULL,                                         19575000)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  architecture = EXCLUDED.architecture,
  defillama_slug = EXCLUDED.defillama_slug,
  pool_address = EXCLUDED.pool_address,
  oracle_address = EXCLUDED.oracle_address,
  deploy_block = EXCLUDED.deploy_block;
