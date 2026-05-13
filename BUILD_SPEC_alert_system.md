# BUILD SPEC: Lending Intelligence Alert System

**Purpose**: A real-time alert system that surfaces tweet-worthy events across Aave V3, Spark, Morpho, and Fluid on Ethereum mainnet. Alerts dispatch to Telegram (primary) and email digest (secondary), with each alert including pre-drafted tweet text so the operator can post within 60 seconds of receiving a notification.

**Status**: Spec for Claude Code to implement.
**Owner**: DatumLabs Research.
**Repo**: `lending-intelligence-terminal`.

---

## 1. Goals

1. **Awareness**: know what is happening across the four covered protocols before crypto Twitter does.
2. **Conversion**: every alert must include the data, the suggested handle to tag, and a copy-paste tweet draft so the operator can post within 60 seconds.
3. **Cost discipline**: run entirely on Cloudflare Workers paid plan ($5/month, already paid). No external infrastructure.
4. **Extensibility**: alert rules defined declaratively so new rules can be added in one file.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (TypeScript)               │
│                                                                │
│   Cron Triggers                                                │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  * /5  * * * *   →  poll fast metrics               │    │
│   │  0    */1 * * *  →  poll hourly metrics             │    │
│   │  0    0   * * *  →  daily digest dispatch           │    │
│   └─────────────────────────────────────────────────────┘    │
│                          │                                     │
│                          ▼                                     │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  AlertEngine                                         │    │
│   │  ├── Fetch data (DefiLlama, FRED, Morpho API)       │    │
│   │  ├── Evaluate rules (rules/*.ts)                    │    │
│   │  ├── Check cooldowns (D1)                           │    │
│   │  └── Dispatch (Telegram, Resend)                    │    │
│   └─────────────────────────────────────────────────────┘    │
│                          │                                     │
│                          ▼                                     │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  Persistence                                         │    │
│   │  ├── D1 (alert_history, rolling_baselines)          │    │
│   │  └── KV (latest_values, cooldowns)                  │    │
│   └─────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  Telegram Bot API     │  (instant alerts)
              │  Resend Email API     │  (daily digest)
              │  Public /pulse page   │  (optional, phase 4)
              └───────────────────────┘
```

**Stack**:
- **Runtime**: Cloudflare Workers (TypeScript)
- **Scheduler**: Cloudflare Cron Triggers
- **Database**: Cloudflare D1 (SQLite)
- **Cache / KV**: Cloudflare KV
- **Secrets**: Cloudflare Workers Secrets (`wrangler secret put`)
- **Build tool**: Wrangler CLI
- **Dispatch**: Telegram Bot API, Resend (email)
- **Optional UI**: Next.js `/pulse` page in the existing dashboard reads from D1 via a Workers Function

---

## 3. Repository structure

The alert system lives in a new top-level directory inside the existing repo:

```
lending-intelligence-terminal/
├── ... (existing dashboard files)
├── alerts/
│   ├── README.md                    # Quick start + ops guide
│   ├── wrangler.toml                # Cloudflare config (cron triggers, bindings)
│   ├── package.json                 # Worker dependencies
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                 # Worker entry point (cron handler)
│   │   ├── engine.ts                # AlertEngine class
│   │   ├── sources/
│   │   │   ├── defillama.ts         # DefiLlama API client
│   │   │   ├── fred.ts              # FRED API client (T-bill rate)
│   │   │   ├── morpho.ts            # Morpho API client
│   │   │   └── chain.ts             # Direct chain reads via Viem (phase 2)
│   │   ├── rules/
│   │   │   ├── index.ts             # Rule registry
│   │   │   ├── liquidity-normalization.ts
│   │   │   ├── utilization-rate-kink.ts
│   │   │   ├── apy-dispersion.ts
│   │   │   ├── net-flow-24h.ts
│   │   │   ├── real-yield-spread.ts
│   │   │   ├── morpho-curator-hhi.ts
│   │   │   └── liquidation-cascade.ts
│   │   ├── dispatchers/
│   │   │   ├── telegram.ts
│   │   │   ├── email.ts             # Resend integration
│   │   │   └── format.ts            # Shared message templating
│   │   ├── state/
│   │   │   ├── d1.ts                # D1 query helpers
│   │   │   ├── kv.ts                # KV helpers
│   │   │   └── schema.sql           # D1 schema
│   │   ├── types.ts                 # Shared TypeScript types
│   │   └── config.ts                # Watchlist, thresholds, constants
│   └── tests/
│       └── rules.test.ts            # Unit tests for rule evaluation
```

The dashboard's `/pulse` page (phase 4) lives in the existing Next.js app:

```
app/pulse/
├── page.tsx                         # Server component, reads from D1 via API route
├── components/
│   ├── AlertCard.tsx
│   ├── AlertFilters.tsx
│   └── PulseHeader.tsx
└── api/
    └── alerts/route.ts              # Returns recent alerts JSON
```

---

## 4. TypeScript types (canonical)

`alerts/src/types.ts`:

```typescript
export type Protocol = 'aave-v3' | 'spark' | 'morpho' | 'fluid';
export type Severity = 'INFO' | 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface AlertContext {
  // Injected into every rule evaluation
  env: Env;                          // Cloudflare bindings (D1, KV, secrets)
  now: Date;                          // Evaluation timestamp
  fetchedAt: Date;                    // When source data was fetched
}

export interface AlertRule {
  id: string;                         // Stable identifier, used for cooldown keys
  name: string;                       // Human-readable name
  description: string;
  schedule: 'fast' | 'hourly' | 'daily';
  cooldownHours: number;              // Min hours between fires for same (id, key)
  evaluate(ctx: AlertContext): Promise<AlertEvent[]>;
}

export interface AlertEvent {
  ruleId: string;
  key: string;                        // Disambiguates (e.g., "aave-v3:USDC" for protocol+asset)
  severity: Severity;
  headline: string;                   // One-line summary
  body: string;                       // Multi-line context
  suggestedTweet: string;             // Pre-drafted tweet, < 280 chars
  suggestedHandle?: string;           // Account to tag (e.g., "@aave")
  dashboardUrl?: string;              // Deep-link into dashboard
  data: Record<string, unknown>;      // Raw values for inspection / debugging
  firedAt: Date;
}

export interface Env {
  // Cloudflare bindings
  ALERTS_DB: D1Database;
  ALERTS_KV: KVNamespace;

  // Secrets
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  RESEND_API_KEY: string;
  FRED_API_KEY: string;

  // Optional
  PUBLIC_DASHBOARD_BASE_URL: string;  // e.g., "https://datumlabs.xyz/lending-terminal"
}
```

---

## 5. Alert rules (precise specs)

Each rule lives in `alerts/src/rules/<rule>.ts`. Below are the seven launch rules. Each spec is sufficient for Claude Code to implement directly.

### 5.1 `liquidity_normalization`

**Schedule**: `fast` (every 5 min)
**Cooldown**: 6 hours per `(protocol, asset)`
**Severity**: `NORMAL`

**Watchlist** (`config.ts`):
```typescript
LIQUIDITY_WATCHLIST = [
  { protocol: 'aave-v3', asset: 'WETH', market: 'core' },
  { protocol: 'aave-v3', asset: 'USDC', market: 'core' },
  { protocol: 'aave-v3', asset: 'USDT', market: 'core' },
  { protocol: 'spark',   asset: 'USDS', market: 'main' },
  { protocol: 'spark',   asset: 'WETH', market: 'main' },
  { protocol: 'fluid',   asset: 'WETH' },
  { protocol: 'fluid',   asset: 'USDC' },
];
```

**Trigger**:
1. For each watchlist entry, fetch `available_liquidity = totalSupply - totalBorrow`.
2. Read the trailing **30-day** mean and stddev of `available_liquidity` from D1 `rolling_baselines`. (Was 7-day in v1. The 7-day band collapsed during low-volatility stretches and produced 1-2% noise fires; the 30-day window absorbs that.)
3. Define the "normal band" as `[mean - 1.5*stddev, mean + 1.5*stddev]`.
4. **Magnitude floors.** Reject any fire candidate when either:
   - `|available - 30d_mean| / 30d_mean < 10%` (relative floor), or
   - `|available - previous_value| < max($50M, 2% × 30d_mean)` (absolute floor).
5. **Sustained out-of-band.** Maintain a streak counter per `(protocol, asset)` in KV alongside the current state.
   - **Stressed direction:** fire only after **12 consecutive 5-min samples** outside the band (~1 hour). Do not fire again within the same outside streak.
   - **Normalized direction:** fire only after **12 hours of continuous samples back inside the band** AND a prior stressed fire on the same `(protocol, asset)` within the previous 7 days. Do not fire again within the same re-entry.
6. Update the rolling baseline after evaluation.

**State shape** (KV `latest:liquidity_normalization:{protocol}:{asset}`):
```typescript
{
  value: number,
  status: "inside" | "outside-high" | "outside-low",
  consecutiveSamples: number,
  streakStartedAt: number,
  lastStressedFireAt: number | null,
  lastNormalizedFireAt: number | null,
  recordedAt: number,
}
```

**Metric-key namespace**: `liquidity30d:{protocol}:{asset}` in `baseline_samples`. The `liquidity:*` namespace from v1 (7-day) is orphaned by the upgrade; safe to drop after a 30-day window is established.

**Suggested tweet templates** (operator-tuned; lead with magnitude, not boundary crossing — see `alerts/src/rules/liquidity-normalization.ts` for canonical strings):

Stressed:
```
{asset} liquidity on {protocol} is {pct}% {above|below} its 30-day mean.

Available: ${available} ({above|below} the band)
30-day band: ${lo} to ${hi}

Watch the borrow side: utilization shifts often follow.

{dashboard_link}
```

Normalized:
```
{asset} liquidity on {protocol} is back at normal levels.

Available: ${available}
30-day band: ${lo} to ${hi}

Capital that left during the recent stress window is returning.

{dashboard_link}
```

**Data source**: DefiLlama Yields API (`/yields/poolsBorrow`) for combined supply/borrow + DefiLlama TVL endpoints.

---

### 5.2 `utilization_rate_kink`

**Schedule**: `fast` (every 5 min)
**Cooldown**: 4 hours per `(protocol, asset)`
**Severity**: `WARNING` at 90%, `CRITICAL` at 95%

**Watchlist**: stablecoin markets on Aave V3 and Spark (USDC, USDT, USDS).

**Trigger**:
1. Fetch utilization for each (protocol, asset).
2. Read previous utilization from KV.
3. Fire if utilization crosses 90% or 95% from below.

**Suggested tweet template**:
```
🚨 {asset} utilization on {protocol} just crossed {threshold}%.

Supply APY: {supplyApy}%
Borrow APY: {borrowApy}%

At this utilization, rate-kink risk is active. Watch for the supply APY spike that typically follows.

{dashboard_link}
```

**Data source**: DefiLlama Yields API for utilization figures.

---

### 5.3 `apy_dispersion_blowout`

**Schedule**: `hourly`
**Cooldown**: 12 hours per stablecoin
**Severity**: `NORMAL`

**Watchlist**: USDC, USDT, USDS, DAI.

**Trigger**:
1. For each stablecoin, fetch supply APY on each of the four protocols.
2. Compute `dispersion = max(apy) - min(apy)` in basis points.
3. Read 30-day rolling mean and stddev from `rolling_baselines`.
4. Fire if `dispersion > mean + 2*stddev`.

**Suggested tweet template**:
```
{stablecoin} supply APY dispersion across the four protocols just hit {dispersion} bps.

30-day average: {mean} bps.
{ratio}x baseline.

{ranked_list}

Same dollar of stablecoin, four pools, different rates. {interpretation}

{dashboard_link}
```

**Data source**: DefiLlama Yields API.

---

### 5.4 `net_flow_24h`

**Schedule**: `hourly`
**Cooldown**: 12 hours per protocol
**Severity**: `NORMAL` if `|delta| > $500M`, `CRITICAL` if `> $2B`

**Trigger**:
1. For each of the four protocols, fetch current TVL.
2. Read TVL from 24 hours ago from D1 `tvl_snapshots`.
3. Compute 24h net flow in USD.
4. Fire if absolute value exceeds threshold.
5. After evaluation, write current TVL to `tvl_snapshots`.

**Suggested tweet template**:
```
{protocol} just saw ${absDelta} in net {direction} over 24 hours.

TVL: ${prev}B → ${now}B
That's the {ranking} largest move in {window}.

{context_line}

{dashboard_link}
```

**Data source**: DefiLlama TVL endpoint (`/protocol/{slug}`).

---

### 5.5 `real_yield_spread_regime`

**Schedule**: `hourly`
**Cooldown**: 24 hours
**Severity**: `CRITICAL` on zero-crossing, `NORMAL` on rapid move

**Trigger**:
1. Compute blended stablecoin APY across the four protocols (TVL-weighted, USDC + USDT + USDS).
2. Fetch the 4-week T-bill rate from FRED (series `DTB4WK` if available, fallback to `DGS1MO`).
3. Compute `spread = blended_apy - tbill_rate` in basis points.
4. Read previous spread from KV.
5. Fire on:
   - Crossing zero in either direction (regime change).
   - 24-hour move > 25 bps.

**Suggested tweet template (regime change)**:
```
The Real Yield Spread just crossed {direction} parity for the first time since {inversion_start}.

Spread: {prev_spread} bps → {now_spread} bps
Blended stablecoin APY: {apy}%
4-week T-bill: {tbill}%

{interpretation_line}

{dashboard_link}
```

**Data source**: DefiLlama Yields + FRED API.

---

### 5.6 `morpho_curator_hhi`

**Schedule**: `daily`
**Cooldown**: 24 hours
**Severity**: `NORMAL` on standard move, `WARNING` on threshold crossing

**Trigger**:
1. Fetch all Morpho vault TVL grouped by curator.
2. Compute curator shares of total curated TVL.
3. Compute HHI = sum of squared shares (using percentages, so a curator with 38.8% contributes 1505.44).
4. Read previous HHI from KV.
5. Fire on:
   - HHI crosses 2,500 from below (entered "highly concentrated" zone).
   - HHI crosses 3,000 from below.
   - 7-day delta exceeds 100 points.
   - Top-3 share changes by more than 1 pp in 24 hours.

**Suggested tweet template**:
```
Morpho's curator HHI just {action} {threshold}.

HHI: {prev} → {now}
Top 3 curators: {names} ({combined_share}%)

{interpretation_line}

{dashboard_link}
```

**Data source**: Morpho API (`https://blue-api.morpho.org`).

---

### 5.7 `liquidation_cascade`

**Schedule**: `hourly`
**Cooldown**: 6 hours per protocol
**Severity**: `WARNING` at threshold, `CRITICAL` at 2x threshold

**Per-protocol thresholds (24h liquidation $)**:
- Aave V3: $100M
- Morpho: $50M
- Fluid: $30M
- Spark: $20M

**Trigger**:
1. Fetch 24-hour rolling liquidation volume per protocol from subgraphs.
2. Fire if volume exceeds protocol threshold.

**Suggested tweet template**:
```
🔥 {protocol} liquidation cascade in progress.

Last 24 hours: ${total}M
{count} liquidations
Largest single seizure: ${largest}M ({asset})

{interpretation_line}

{dashboard_link}
```

**Data source**: Aave subgraph (The Graph), Morpho API, protocol-specific endpoints.

---

## 6. D1 schema

`alerts/src/state/schema.sql`:

```sql
-- Persisted alert history (for /pulse page + audit trail)
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
  fired_at INTEGER NOT NULL  -- unix epoch ms
);
CREATE INDEX idx_alert_history_fired_at ON alert_history(fired_at DESC);
CREATE INDEX idx_alert_history_rule ON alert_history(rule_id, fired_at DESC);

-- Rolling baselines for dispersion / liquidity bands
CREATE TABLE IF NOT EXISTS rolling_baselines (
  metric_key TEXT NOT NULL,   -- e.g., "dispersion:USDC", "liquidity:aave-v3:WETH"
  window_days INTEGER NOT NULL,
  mean REAL NOT NULL,
  stddev REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (metric_key, window_days)
);

-- 24h TVL snapshots for net flow alerts
CREATE TABLE IF NOT EXISTS tvl_snapshots (
  protocol TEXT NOT NULL,
  snapshot_at INTEGER NOT NULL,  -- unix epoch ms, hourly granularity
  tvl_usd REAL NOT NULL,
  PRIMARY KEY (protocol, snapshot_at)
);
CREATE INDEX idx_tvl_snapshots_at ON tvl_snapshots(snapshot_at DESC);

-- Cooldown registry (could live in KV but D1 is queryable)
CREATE TABLE IF NOT EXISTS cooldowns (
  cooldown_key TEXT PRIMARY KEY,  -- e.g., "liquidity_normalization:aave-v3:WETH"
  last_fired_at INTEGER NOT NULL
);
```

---

## 7. KV usage

KV stores ephemeral state where atomic reads matter:

- `latest:{rule_id}:{key}` → JSON of last observed values (used for cross-evaluation comparison).
- `cooldown:{rule_id}:{key}` → epoch ms of last fire (mirror of D1 cooldowns table for fast lookups).
- `feature:{flag}` → bool toggles to disable rules without code changes.

All KV writes happen via `state/kv.ts` helpers.

---

## 8. Wrangler config

`alerts/wrangler.toml`:

```toml
name = "datumlabs-alerts"
main = "src/index.ts"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

# Cron triggers
[triggers]
crons = [
  "*/5 * * * *",    # fast rules every 5 min
  "0 */1 * * *",    # hourly rules
  "0 0 * * *"       # daily rules + email digest
]

# D1 binding
[[d1_databases]]
binding = "ALERTS_DB"
database_name = "datumlabs-alerts"
database_id = "<set after wrangler d1 create>"

# KV binding
[[kv_namespaces]]
binding = "ALERTS_KV"
id = "<set after wrangler kv:namespace create>"

# Environment vars (non-secret)
[vars]
PUBLIC_DASHBOARD_BASE_URL = "https://datumlabs.xyz/lending-terminal"
```

Secrets to set via `wrangler secret put`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `RESEND_API_KEY`
- `FRED_API_KEY`

---

## 9. Worker entry point

`alerts/src/index.ts`:

```typescript
import { AlertEngine } from './engine';
import { Env } from './types';

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const engine = new AlertEngine(env);
    const schedule = inferSchedule(event.cron);

    ctx.waitUntil(engine.run(schedule));
  },

  // Optional HTTP entry for /pulse JSON feed
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/alerts') {
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const rows = await env.ALERTS_DB.prepare(
        'SELECT * FROM alert_history ORDER BY fired_at DESC LIMIT ?'
      ).bind(limit).all();
      return Response.json(rows.results);
    }
    return new Response('Not found', { status: 404 });
  },
};

function inferSchedule(cron: string): 'fast' | 'hourly' | 'daily' {
  if (cron.startsWith('*/5')) return 'fast';
  if (cron.startsWith('0 */1')) return 'hourly';
  return 'daily';
}
```

`alerts/src/engine.ts` orchestrates: gather rules matching the schedule, fetch their data, evaluate, check cooldowns, dispatch fired alerts, write to history.

---

## 10. Telegram message format

`alerts/src/dispatchers/telegram.ts` posts to:
```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
```

Message template (Markdown V2):
```
*{severity_emoji} {headline}*

{body}

*Suggested tweet:*
```
{suggested_tweet}
```

[View on dashboard]({dashboard_url})
```

Severity emojis:
- INFO: ℹ️
- NORMAL: 📊
- WARNING: ⚠️
- CRITICAL: 🚨

---

## 11. Email digest format

Resend HTML email sent daily at 00:00 UTC. Contains the previous 24 hours of fired alerts grouped by severity. Each entry shows headline + suggested tweet. Sent to a single recipient initially (the operator). Phase 4: open up to subscribers via a signup form on `/pulse`.

---

## 12. Deployment steps

```bash
# From repo root
cd alerts/

# Install dependencies
npm install

# Create D1 database
wrangler d1 create datumlabs-alerts
# (Copy returned database_id into wrangler.toml)

# Create KV namespace
wrangler kv:namespace create ALERTS_KV
# (Copy returned id into wrangler.toml)

# Apply schema
wrangler d1 execute datumlabs-alerts --file=./src/state/schema.sql

# Set secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put RESEND_API_KEY
wrangler secret put FRED_API_KEY

# Deploy
wrangler deploy

# Optional: trigger a manual run for testing
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

---

## 13. Phasing

### Phase 1 (week 1): MVP

- [ ] Wrangler project scaffolded with TypeScript.
- [ ] D1 + KV bindings configured.
- [ ] Schema applied.
- [ ] Telegram dispatcher working (verify with a manual test message).
- [ ] Two rules implemented and live:
  - [ ] `liquidity_normalization`
  - [ ] `net_flow_24h`
- [ ] First alert-driven tweet posted from a real fire.

### Phase 2 (week 2): Extend coverage

- [ ] Three more rules:
  - [ ] `utilization_rate_kink`
  - [ ] `apy_dispersion_blowout`
  - [ ] `real_yield_spread_regime`
- [ ] Rolling baseline computation working (the dispersion rule needs 30 days of history; seed manually from existing dashboard data if no history exists yet).

### Phase 3 (week 3-4): Final rules + email

- [ ] Two final rules:
  - [ ] `morpho_curator_hhi`
  - [ ] `liquidation_cascade`
- [ ] Resend email dispatcher implemented.
- [ ] Daily digest email working.
- [ ] Alert history queryable via `/alerts` HTTP endpoint.

### Phase 4 (month 2): Public surface

- [ ] `/pulse` page in the dashboard, reads from D1 via Workers fetch handler.
- [ ] Alert filters by protocol, severity, rule type.
- [ ] Open subscriber signup form (Beehiiv or Substack integration) for the email digest.
- [ ] Document the rule taxonomy publicly so subscribers know what they will receive.

---

## 14. Acceptance criteria

A rule is considered complete when:

1. **Implementation**: rule file exports a default `AlertRule` matching the type contract.
2. **Test coverage**: unit test in `tests/rules.test.ts` covering at least: trigger fires when condition met, no fire when below threshold, cooldown respected on repeat evaluation.
3. **Backfill**: rolling baselines (where applicable) seeded from at least 30 days of historical DefiLlama data.
4. **Live verification**: rule has fired at least one alert in production within 14 days of deployment, OR a deliberately constructed trigger has been used to verify dispatch.
5. **Tweet quality**: the `suggestedTweet` field, when posted unedited, reads as something a human would write, under 280 characters, with the correct handle suggested.

The full system is considered complete when:

1. All seven launch rules are implemented and meeting per-rule acceptance.
2. Telegram dispatch is reliable (zero failures in a 30-day window).
3. Email digest sends daily without manual intervention.
4. `/pulse` page renders correctly and updates within 5 minutes of new alerts.
5. The operator has posted at least 10 alert-driven tweets in the first 30 days of operation.

---

## 15. Operations notes

- **Logging**: emit `console.log` for every rule evaluation. Cloudflare logs are queryable via the dashboard for debugging.
- **Error handling**: a single rule failure must not crash the engine. Wrap each rule in a try/catch and log the failure to a `rule_errors` D1 table.
- **Rate limits**: DefiLlama API has no documented hard limit but be courteous: 1 request per protocol per evaluation, not per asset. Cache responses across rules in the same run via a request-scoped fetcher.
- **Backfilling baselines**: write a one-time script (`alerts/scripts/seed-baselines.ts`) that pulls 30 days of historical data and computes initial mean/stddev for each metric. Run it once before enabling rules that depend on baselines.
- **Disabling a rule**: set the KV key `feature:disabled:{rule_id}` to `true`. The engine respects this without redeployment.

---

## 16. Out of scope (do not build now)

- Twitter posting automation. Suggested tweets are intentionally manual: the operator's voice and timing decisions are the value-add. Automating posting kills the editorial layer.
- Multi-chain expansion beyond Ethereum. Cross-chain is a phase 5 question.
- ML / anomaly detection. Threshold rules are deterministic and auditable; that matters more than precision at this stage.
- Paid subscriber billing. Phase 4 starts with a free list; monetization is a later question.

---

## 17. Open questions for the operator

1. Confirm Telegram channel preference: private one-person channel, or a small private group that includes early collaborators?
2. Confirm email digest send time: 00:00 UTC, or local morning (08:00 UTC for Lagos / Africa)?
3. Confirm dashboard base URL for deep links (`PUBLIC_DASHBOARD_BASE_URL`).
4. Confirm whether to surface alert history publicly on `/pulse` from day one, or keep private until subscriber funnel is ready.
