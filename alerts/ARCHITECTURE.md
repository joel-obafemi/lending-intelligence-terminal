# Alert System Architecture

A build handbook for extending this alert engine across every Datum Labs
dashboard.

This document is written for someone who has not touched the codebase and
needs to either (a) add rules for a new dashboard, or (b) rebuild something
more sophisticated on the same foundations. It covers the abstractions, the
storage model, the onboarding path for a new product, and, most importantly,
the tuning lessons that only showed up in production.

The companion docs are `README.md` (operating this specific Worker) and
`../BUILD_SPEC_alert_system.md` (the original design spec).

---

## 1. What the system does

It watches protocol data on a schedule, decides when something is worth a
human's attention, and drops a ready-to-post message into Telegram with a
suggested tweet. A daily digest email summarises the last 24h.

The deliberate boundary: **it never posts publicly by itself.** The editorial
judgement is the product. The engine's job is to get a correct, interesting,
copy-pasteable observation in front of the operator within a minute of the
event.

Two products run on it today:

| Product | Rules | Data source |
|---|---|---|
| Lending Intelligence Terminal (Aave V3, Spark, Morpho, Fluid) | 10 | DefiLlama, Morpho GraphQL, FRED, Neon |
| Moonwell dashboard | 15 | Moonwell Neon DB, DefiLlama |

That second product is the proof the engine generalises. Adding it required
no changes to the engine, only new rules, a new source client, and a second
`*_DATABASE_URL` binding.

---

## 2. System at a glance

```
Cloudflare Cron (*/5, hourly, daily, weekly)
        |
        v
  scheduled() in src/index.ts
        |  inferSchedule(event.cron) -> "fast" | "hourly" | "daily" | "weekly"
        v
  AlertEngine.run(schedule)            src/engine.ts
        |
        |-- for each rule matching that schedule:
        |     |-- KV feature flag check (rule disabled?)
        |     |-- rule.evaluate(ctx) -> AlertEvent[]
        |     |     (rules pull from src/sources/*)
        |     |-- for each event:
        |     |     |-- KV cooldown check (rule_id + event.key)
        |     |     |-- D1 recordAlert()          <- durable history
        |     |     |-- KV writeCooldown(TTL)
        |     |     +-- Telegram dispatch
        |     +-- catch -> D1 rule_errors (one bad rule never blocks others)
        |
        +-- if daily: compose 24h digest from D1, send via Resend
```

Everything is a Cloudflare Worker: no servers, no queue, no container. State
is D1 (durable history and time series) plus KV (hot-path cooldowns and
flags).

---

## 3. Core abstractions

Everything lives behind four types in `src/types.ts`. If you rebuild this,
keep these shapes; they are what let a second product slot in cleanly.

### AlertRule

```ts
export interface AlertRule {
  id: string;             // stable, snake_case, used as cooldown namespace
  name: string;
  description: string;
  schedule: Schedule;     // "fast" | "hourly" | "daily" | "weekly"
  cooldownHours: number;
  evaluate(ctx: AlertContext): Promise<AlertEvent[]>;
}
```

A rule is a pure-ish function from context to zero or more events. It does
not know about Telegram, cooldowns, or the database. It reads data, applies
thresholds, and returns what it found. That separation is why rules stay
short and testable.

### AlertEvent

```ts
export interface AlertEvent {
  ruleId: string;
  key: string;            // dedupe identity, see below
  severity: Severity;     // INFO | NORMAL | WARNING | CRITICAL
  headline: string;
  body: string;
  suggestedTweet: string;
  dashboardUrl?: string;
  data: Record<string, unknown>;   // raw numbers, kept for the audit trail
  firedAt: Date;
}
```

**`key` is the most important field in the system.** It is the dedupe
identity, and cooldowns are scoped to `rule_id + key`. Get it wrong and you
either spam (key too specific) or go silent (key too broad).

Rules of thumb:

- Include every dimension the reader would consider a separate event:
  `${chain}:${market}` for per-market rules.
- Include the threshold when a metric can cross several: the utilization
  rule uses `${market}:${threshold}` so a jump straight past 90% and 95%
  fires both, each with its own cooldown window.
- Do NOT include the value itself. A key like `usdc:15.3M` changes every
  tick, so the cooldown never bites.

### The engine loop

`src/engine.ts` is under 200 lines and does five things: feature-flag check,
evaluate, cooldown check, persist, dispatch. Read it first. Note that a rule
throwing is caught, recorded to `rule_errors`, and the loop continues. One
broken rule must never take down the run.

---

## 4. Storage model

Two stores, chosen deliberately.

**KV** holds cooldowns and feature flags. Cooldown entries are written with
`expirationTtl = cooldownHours`, so they self-expire and no cleanup job is
needed. KV is the right call for a hot-path "have we fired recently?" lookup.

**D1** holds everything durable: `alert_history`, rolling baselines and raw
`baseline_samples`, per-product time series, `rule_errors`, `digest_runs`.

Notable tables (see `src/state/schema.sql`, safe to re-apply):

| Table | Purpose |
|---|---|
| `alert_history` | every fire, with the raw `data_json`. The digest and any future `/pulse` page read from here |
| `baseline_samples` | raw samples; rolling mean and stddev are recomputed each run rather than maintained incrementally |
| `rule_errors` | per-rule failures, so a silently broken rule is visible |
| `moonwell_market_snapshots` | per-market supply and borrow in **token units**, not USD |
| `moonwell_revenue_ath` | all-time-high tracker for "new record" rules |

Two design choices worth copying:

1. **Recompute baselines from raw samples every run.** Incremental
   maintenance is a correctness trap under restarts and clock skew. The
   query is cheap.
2. **Store token units, not USD, for anything measuring flow.** See the
   price-vs-units lesson in section 7. This one decision prevents an entire
   class of false alert.

---

## 5. Data sources

`src/sources/` holds one client per upstream: `defillama.ts`, `fred.ts`,
`morpho.ts` (GraphQL), `moonwell.ts`, `neon.ts`, `moonwellNeon.ts`.

The discipline that matters is **request-scoped clients**. `buildRuleRegistry()`
constructs one client per source and hands the same instance to every rule
that needs it, so a Worker invocation makes at most one `/pools` call, one
`/protocol/{slug}` per protocol, one FRED CSV per series, and one paged
Morpho query, no matter how many rules consume that data. Without this you
multiply upstream calls by rule count and get rate-limited.

Two source patterns are in use:

- **Public API** (DefiLlama, FRED, Morpho GraphQL): keyless, cache within
  the run, tolerate failure.
- **Your own Neon Postgres** (`@neondatabase/serverless` HTTP driver): reads
  the dashboard's own scanner tables. This is the higher-signal path, because
  it queries data you already trust and reconcile.

Prefer your own database when the dashboard already stores what the rule
needs. Rules that read your Neon tables produced the most interesting alerts.

---

## 6. Onboarding a new dashboard

The full path for adding, say, the Euler or Fluid dashboard. Roughly a day
of work, most of it in step 4.

**Step 1. Decide the data source.** If the dashboard already writes scanner
tables to Neon, use those. Add the connection string as a new optional env
var (`EULER_DATABASE_URL`) in `src/types.ts` and set it with
`wrangler secret put`. Make the rule self-skip when the var is absent, the
way `liquidation_cascade` does. That keeps deploys safe before the secret
exists.

**Step 2. Write the source client.** One file in `src/sources/`, exporting
typed query functions. Keep SQL in the source client, not in rules. Copy
`moonwellNeon.ts` as the reference: it is the cleanest example of the shape.

**Step 3. Add a dashboard base URL.** Every product needs its own
`*_DASHBOARD_BASE_URL` var for tweet deep links. Distinct product means
distinct base URL.

**Step 4. Write the rules.** One file per rule in `src/rules/`, each
exporting a `createXxxRule(deps)` factory. Register it in
`src/rules/index.ts`. Section 7 is the part to read before writing
thresholds.

**Step 5. Add any tables.** Append to `src/state/schema.sql` (it is
idempotent), then run
`npx wrangler d1 execute datumlabs-alerts --remote --file=./src/state/schema.sql`.

**Step 6. Test, then deploy.** `npm test` for the rule logic against fakes,
then `POST /run` with a schedule to force a live evaluation before trusting
cron.

Nothing in the engine, dispatchers, or state layer needs to change. If you
find yourself editing `engine.ts` to onboard a product, that is a signal the
rule abstraction is leaking.

---

## 7. Rule design: the lessons that cost us

This section is the real value of the handbook. Every item below is a
production false positive we had to diagnose after the fact.

### 7.1 A percentage move is not a signal

The alert that started this: `VELO1 supply on Optimism up +17% in 7d`, with a
prior value of $0 and a current value of $0. A market holding nothing moved
by a rounding artifact and generated a suggested tweet reading
`0.00 -> 0.00 USD`.

**Always gate on absolute size before relative change.** A percentage on a
tiny base is noise by construction. Two floors, both required:

- A minimum current value (skip anything under, say, $50K).
- A non-zero prior and current, so an empty market can never fire.

The same run produced alerts for a $235 to $271 market and a $9 to $10
market. All technically correct, all unpostable.

### 7.2 Price moves are not deposits

On the same day, alerts fired for `VIRTUAL supply +14%`, `MORPHO +27%`, and
`cbXRP +40%`. All three were essentially pure price appreciation. VIRTUAL's
token units actually **shrank** that week.

The protocol's USD book grew $16.3M over 7 days. Decomposed:

- $15.0M was the market rally repricing tokens already deposited.
- $1.3M was genuine net deposits.

If you alert on USD, you alert on the market, not on the protocol. Two fixes,
use both:

1. **Store token units** in your snapshot table and compute the delta on
   units. `moonwell_market_snapshots` does this.
2. **Where you only have USD, decompose it.** If the snapshot carries
   `price_usd`, then `units = usd / price`, and a constant-price flow is
   `(units_now - units_prior) x price_now`. Suppress the alert when the unit
   change is under a couple of percent even though the USD change is large.

Stablecoin markets are the exception that proves it: USDC's price does not
move, so a USDC supply change is always a real deposit. That is why Base USDC
+$1.1M was the one number worth tweeting out of thirteen alerts that morning.

### 7.3 Tight statistical bands fire on quiet markets

`liquidity_normalization` originally used a 7-day rolling mean with a 1.5
sigma band. In low-volatility stretches the band collapsed and a 1% to 2%
wobble cleared it. Two real fires on a $331M and a $240M market, neither
meaningful.

The fix was three additional gates on top of the statistical one:

- **Magnitude floors:** relative move >= 10% of the mean AND absolute move
  >= max($50M, 2% of mean).
- **Stress sustain:** 12 consecutive samples outside the band (about 1h)
  before firing.
- **Normalize sustain:** 12h back inside the band, and a prior stress event
  within 7 days, before firing the recovery.

Also raise the minimum sample count before a rule may fire at all
(`MIN_BASELINE_SAMPLES` is 288, or 24h at 5-minute cadence). A statistical
rule on 3 samples is a random number generator.

**`apy_dispersion_blowout` still has this bug.** It fires above mean + 2
sigma over 30 days with no magnitude floor, so during a quiet stretch
(mean 5 bps, sd 0.5) a jump to 8 bps clears the band and means nothing.
Recommended fix, not yet implemented: require `dispersion_bps >= 30` AND
`>= 1.5x mean30d`.

### 7.4 Seed baselines, or wait days for the first signal

A rolling-baseline rule is dead until it has history. `scripts/seed-baselines.ts`
backfills `baseline_samples` from DefiLlama's `/chart/{pool_id}` endpoint so
rules go live immediately instead of after 30 days of uptime. Budget for a
seed script whenever you add a statistical rule.

### 7.5 Alert on your own pipeline, not just the market

`moonwell_dashboard_audit_fail` is the highest-value rule in the system and
the one most people would not think to write. A separate audit Worker
recounts trailing-7-day on-chain events and compares them to what the
dashboard's database holds, then writes a pass or fail row. This rule tails
that table.

It is how we learned that Tenderly had silently capped its public Base
`eth_getLogs` endpoint at 1,000 blocks, which had broken three data-coverage
checks. The dashboard would have quietly under-reported until someone noticed
by eye.

**Build the self-audit rule early.** A dashboard that is confidently wrong is
worse than one that is visibly broken.

### 7.6 Retiring a check leaves a ghost

The audit rule reads the latest row per `check_name` within a 36h lookback
and alerts on any failure. When a check is retired (we removed the Moonbeam
checks after that chain sunset), its last failing rows sit in the table and
keep re-alerting for the length of the lookback window, long after the check
stopped existing.

If you retire a check, purge its rows or the operator gets paged for a thing
that no longer runs. More generally: any rule that reads "latest row per key"
needs a story for keys that stop being written.

### 7.7 Cooldowns are per key, and per threshold

Covered in section 3, worth repeating because it is the most common bug.
`utilization_rate_kink` uses `${market}:${threshold}` precisely so that
crossing 90% and 95% in the same tick yields two alerts on two independent
cooldown timers, rather than the 95% event being swallowed by the 90% one.

### 7.8 Voice rules for suggested tweets

Alert copy gets pasted straight to X, so drift in a template is drift in
published voice. The house rules:

- No em-dashes or en-dashes anywhere. Commas, colons, semicolons, periods.
- No first-person plural. The publication is sole-author; use the passive or
  third person.
- Sub-$1M figures in K notation ($470K, never $0.5M). $X.XM and $X.XB above.
- Write "%" rather than the word.

---

## 8. Operations

**Deploy:** `cd alerts && npx wrangler deploy`. The Worker is independent of
the dashboard; redeploying one does not touch the other.

**Secrets** (`npx wrangler secret put NAME`): `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, plus a `*_DATABASE_URL` per product.
Every rule that needs a secret self-skips when it is absent, so a partial
deploy degrades rather than crashes.

**Endpoints** (all on the Worker's URL):

| Route | Purpose |
|---|---|
| `GET /alerts` | recent fires from `alert_history` |
| `POST /run?schedule=fast` | force an evaluation (also hourly, daily, weekly) |
| `POST /test/telegram` | smoke-test dispatch after setting secrets |
| `GET /digest/preview?format=html` | render the digest without sending (also text, json) |
| `POST /digest/send` | force a digest send |

**Kill switch:** a rule can be disabled at runtime by writing a KV feature
flag, no deploy needed. Use it when a rule starts spamming at 3am.

**Cron to schedule mapping** lives in `inferSchedule()` in `src/index.ts`.
Note that adding a second weekly cron requires teaching that function to tell
them apart; right now it matches the one explicit weekly slot.

---

## 9. Where to take it next

Honest assessment of the gaps, in the order worth fixing:

1. **Shared noise gates.** Sections 7.1 and 7.2 are currently re-implemented
   per rule. They should be a shared helper every delta rule calls:
   `passesNoiseGates({ priorUsd, nowUsd, priorUnits, nowUnits, minUsd })`.
   This is the single highest-value refactor.
2. **Fix `apy_dispersion_blowout`** with the floors in 7.3.
3. **Per-product routing.** Today every alert goes to one Telegram channel.
   With five dashboards it needs a channel or topic per product, and probably
   severity-based routing so CRITICAL goes somewhere noisier than INFO.
4. **A rule manifest.** `buildRuleRegistry()` is a hand-maintained list.
   At 25+ rules across 5 products, a declarative manifest with per-rule
   config (thresholds, enabled, channel) beats a code list, and lets
   thresholds be tuned without a deploy.
5. **Backtesting.** There is no way today to ask "how often would this rule
   have fired last quarter?" Given the history in D1 and the dashboards' own
   Neon tables, a replay harness would make threshold-setting empirical
   rather than guesswork. This is what separates a sophisticated system from
   this one.
6. **The public `/pulse` page** (Phase 4 in the original spec): render
   `alert_history` publicly as a live protocol feed.

---

## 10. File map

```
alerts/
  src/
    index.ts              Worker entry: cron routing + operator HTTP routes
    engine.ts             evaluate -> cooldown -> persist -> dispatch
    types.ts              AlertRule, AlertEvent, Env, Severity, Schedule
    config.ts             watchlists and thresholds
    rules/
      index.ts            registry; shared source clients built here
      <product>-<rule>.ts one file per rule, exports a create*Rule factory
    sources/              one client per upstream API or database
    dispatchers/
      telegram.ts         alert dispatch
      email.ts            daily digest composition + Resend send
      format.ts           shared formatting
    state/
      d1.ts               durable history and time series
      kv.ts               cooldowns and feature flags
      schema.sql          idempotent DDL
  scripts/
    seed-baselines.ts     backfill baseline_samples so rules go live at once
  tests/                  vitest against in-memory D1 and KV fakes
```

Start with `types.ts`, then `engine.ts`, then one simple rule
(`moonwell-tvl-threshold.ts`) and one hard one
(`liquidity-normalization.ts`).
