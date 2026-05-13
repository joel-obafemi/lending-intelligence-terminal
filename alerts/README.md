# datumlabs-alerts

Cloudflare Worker that evaluates lending-protocol alert rules against
DefiLlama and dispatches tweet-ready alerts to Telegram. Covers Aave V3,
Spark, Morpho, and Fluid on Ethereum mainnet. Companion to the
`lending-intelligence-terminal` Next.js dashboard.

The Worker lives in this directory and is deployed independently of the
dashboard. The full design rationale, voice rules, and the seven launch
rules are documented in `../BUILD_SPEC_alert_system.md`.

## Status

Phase 1 + Phase 2 live. Five rules running:

| Rule                          | Schedule | Cooldown | Severity                |
|-------------------------------|----------|----------|-------------------------|
| `liquidity_normalization`     | fast     | 6h       | NORMAL                  |
| `utilization_rate_kink`       | fast     | 4h       | WARNING / CRITICAL      |
| `net_flow_24h`                | hourly   | 12h      | NORMAL / CRITICAL       |
| `apy_dispersion_blowout`      | hourly   | 12h      | NORMAL                  |
| `real_yield_spread_regime`    | hourly   | 24h      | NORMAL / CRITICAL       |

Phase 3 (`morpho_curator_hhi`, `liquidation_cascade`, Resend daily
digest) is scoped in the spec but not implemented.

## Provisioned resources

Already created via `wrangler` and wired into `wrangler.toml`:

| Resource            | Name                              | ID                                         |
|---------------------|-----------------------------------|--------------------------------------------|
| D1 database         | `datumlabs-alerts`                | `d5f1570d-7d95-400c-b89c-0ceeb14c52f5`     |
| KV namespace        | `datumlabs-alerts-ALERTS_KV`      | `be6d7e2dd8aa43419b465132d316b8d3`         |
| Worker deployment   | `datumlabs-alerts.joelobafemii.workers.dev` | (cron-only, no public surface yet) |

## One-time setup (already done)

Recorded here so the steps can be re-run if the resources ever need to be
re-provisioned (e.g. account migration).

```powershell
# From this directory:
cd alerts

# Install dependencies
npm install

# Provision D1 + KV
npx wrangler d1 create datumlabs-alerts
npx wrangler kv:namespace create ALERTS_KV

# Paste the returned database_id and id into wrangler.toml.

# Apply the schema to the live D1 database.
npx wrangler d1 execute datumlabs-alerts --remote --file=./src/state/schema.sql
```

## Setting secrets

Telegram dispatch will not work until both secrets are set. The engine
records alerts to D1 either way; without secrets it just skips the
Telegram send and logs a warning.

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

Telegram setup:

1. DM `@BotFather` on Telegram and run `/newbot`. The token returned is
   `TELEGRAM_BOT_TOKEN`.
2. Start a chat with the bot from the operator account. Then visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` once a message has
   been sent to the bot. The `chat.id` in the response is
   `TELEGRAM_CHAT_ID`.
3. Re-run the two `wrangler secret put` commands above.

Phase 3 will also use `RESEND_API_KEY` and `FRED_API_KEY`. Set those
later, not now.

## Deploying

```powershell
npx wrangler deploy
```

The deploy registers all three cron triggers automatically from
`wrangler.toml`. There is no separate "publish triggers" step.

## Verifying after deploy

Smoke-test the Telegram dispatcher (requires secrets set):

```powershell
$url = "https://datumlabs-alerts.joelobafemii.workers.dev/test/telegram"
Invoke-RestMethod -Method Post -Uri $url
```

Trigger a rule evaluation on demand (any schedule, useful for a sanity
check after editing a rule file):

```powershell
# fast | hourly | daily
Invoke-RestMethod -Method Post -Uri "https://datumlabs-alerts.joelobafemii.workers.dev/run?schedule=fast"
```

Read recent fires from D1:

```powershell
Invoke-RestMethod "https://datumlabs-alerts.joelobafemii.workers.dev/alerts?limit=20"
```

Tail live logs:

```powershell
npx wrangler tail
```

## Local development

```powershell
# Watches src/ and runs the Worker with a local D1 + KV.
npx wrangler dev --test-scheduled

# Trigger the fast-schedule rules locally:
curl "http://localhost:8787/__scheduled?cron=*%2F5+*+*+*+*"
```

Tests:

```powershell
npm test            # one-shot
npm run test:watch  # vitest watch mode
```

Typecheck:

```powershell
npm run typecheck
```

## Operations

### Disabling a rule without a redeploy

Set the KV key `feature:disabled:<rule_id>` to `true`. The engine skips
the rule on the next evaluation. Re-enable by deleting the key.

```powershell
npx wrangler kv:key put --namespace-id=be6d7e2dd8aa43419b465132d316b8d3 "feature:disabled:net_flow_24h" "true"
npx wrangler kv:key delete --namespace-id=be6d7e2dd8aa43419b465132d316b8d3 "feature:disabled:net_flow_24h"
```

### Cooldowns

Cooldowns live in KV with a TTL equal to the rule's `cooldownHours`. To
force a fire on the next evaluation, delete the cooldown key:

```powershell
npx wrangler kv:key delete --namespace-id=be6d7e2dd8aa43419b465132d316b8d3 "cooldown:net_flow_24h:aave-v3"
```

### Inspecting D1

```powershell
# Recent fires.
npx wrangler d1 execute datumlabs-alerts --remote --command "SELECT rule_id, alert_key, severity, headline, fired_at FROM alert_history ORDER BY fired_at DESC LIMIT 20"

# Rule errors.
npx wrangler d1 execute datumlabs-alerts --remote --command "SELECT rule_id, error_message, occurred_at FROM rule_errors ORDER BY occurred_at DESC LIMIT 10"

# Baseline state for liquidity_normalization.
npx wrangler d1 execute datumlabs-alerts --remote --command "SELECT metric_key, mean, stddev, sample_count, updated_at FROM rolling_baselines"
```

### Re-applying the schema

`schema.sql` is idempotent (every `CREATE` uses `IF NOT EXISTS`). Re-run
it after adding a table or index:

```powershell
npx wrangler d1 execute datumlabs-alerts --remote --file=./src/state/schema.sql
```

## Notes on the rules

### `liquidity_normalization`

Fires when a watchlist (`config.ts → LIQUIDITY_WATCHLIST`) market's
available liquidity crosses out of, or back into, its trailing-7-day
mean ± 1.5σ band. Samples are recorded in `baseline_samples` every 5
minutes; mean and stddev are recomputed on every run. The rule needs
at least 24 samples (about 2 hours of accumulation) before it can fire.

### `net_flow_24h`

Fires when a covered protocol's Ethereum-chain TVL changes by more than
$500M (NORMAL) or $2B (CRITICAL) over a 24-hour window. The Worker
snapshots TVL to `tvl_snapshots` on every hourly run and looks back 24h
± 2h for the prior point. First run per protocol just seeds the
baseline; the first fire-eligible evaluation happens at hour 24 of
uptime.

### `utilization_rate_kink`

Fires when a stablecoin market on Aave V3 or Spark crosses 90% or 95%
utilization from below. Stateless aside from the previous-value lookup
in KV. The rule key includes the threshold (`aave-v3:USDC:90`) so a jump
from 89 to 96 fires both the 90 and 95 events on separate keys, each on
its own 4-hour cooldown.

### `apy_dispersion_blowout`

Fires when the cross-protocol supply-APY spread for a stablecoin exceeds
the trailing-30-day mean by 2 stddev. Uses TVL-weighted blended apyBase
per (protocol, stable) across all matching pools, then computes
`max - min` in basis points. Requires 72 samples (3 days of hourly
runs) before it can fire. Seed initial 30-day history with:

```powershell
npm run seed:baselines
npx wrangler d1 execute datumlabs-alerts --remote --file=./scripts/.seed-dispersion.sql
```

Morpho is excluded from the cross-section because DefiLlama's
`morpho-blue` pool rows do not expose meaningful `apyBase` for
stablecoins (vault rates live in the Morpho GraphQL API; the dashboard
queries that separately). Rule operates on Aave V3, Spark, and Fluid.

### `real_yield_spread_regime`

Fires on a zero-crossing (CRITICAL) or a 24-hour move > 25 bps (NORMAL)
in `blended_stablecoin_APY - TB4WK`. Blend is TVL-weighted across USDC,
USDT, USDS on Aave V3 / Spark / Fluid (same Morpho caveat as above).
FRED's CSV endpoint is keyless; falls back from `TB4WK` to `DGS1MO` if
TB4WK is unavailable. State lives under `latest:real_yield_spread_regime:global`
in KV.

## Voice rules for any user-facing copy

Suggested tweets, Telegram message text, and operator-facing strings all
follow two rules from the project owner:

- No em-dashes anywhere. Use commas, colons, semicolons, or periods.
- No first-person plural ("we", "our"). The publication is sole-author.

These rules apply because the suggested-tweet field gets copy-pasted
directly to X. New rules must respect them in their template strings,
or the published voice drifts off-brand.

## Roadmap

- Phase 3: `morpho_curator_hhi`, `liquidation_cascade`, Resend daily
  digest email at 00:00 UTC. Adding Morpho stablecoin APY via the
  `blue-api.morpho.org` GraphQL API would re-enable the fourth protocol
  on dispersion and real-yield blends.
- Phase 4: public `/pulse` page in the dashboard, Beehiiv subscriber
  signup, alert filters.

The full plan is in `../BUILD_SPEC_alert_system.md`.
