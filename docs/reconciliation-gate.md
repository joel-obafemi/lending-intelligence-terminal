# Reconciliation Gate — Operator Guide

The reconciliation gate is a CI check that fails the publish workflow if any
cited figure in a report drifts from its independent source. It exists because
four Issue 002 errors had the same fingerprint: a bare number in a snapshot
JSON or outline that propagated to the published report without any independent
cross-check.

The errors:

- Aave V3 USDC market figures (9.62% supply APY / 10.95% / 97.6% utilization)
- Compound V3 “four Comets, three at scale” (wstETH and WBTC bases were missed)
- Morpho idle ratio 63.7% (the bare snapshot value, no derivation)
- Aave V3 LRT share 84% (the actual share was 88.37%)

Each of these sat in a place where a build-time check could have detected the
drift. The gate is that check.

## Components

```
content/snapshots/manifest.json           Registry of cited figures
content/snapshots/compound-comet-*.json   Authoritative deployment lists
content/snapshots/2026-05-*.json          Source snapshots (one per metric family)
scripts/reconciliation-gate.ts            The gate
scripts/derivation-trail-check.ts         Catches hand-typed numbers w/o manifest entry
scripts/lib/reconciliation-checks.ts      Shared cross-check executors
.github/workflows/reconciliation.yml      CI integration
docs/reconciliation-gate.md               You are here
```

## How the gate runs

1. **Loads the manifest** at `content/snapshots/manifest.json`.
2. **For each entry**, runs the configured `cross_check` method against an
   independent source. The supported methods are `derived_from_snapshot`,
   `http_json`, `graphql`, `onchain`, and `manual` (see “Supported methods”
   below).
3. **Computes divergence** as `|cross_check - cited| / |cited| × 100`.
4. **Fails (exit 1)** if any entry exceeds its `threshold_pct`. Some entries
   declare an `absolute_threshold` for near-zero readings — the gate uses that
   instead when relevant.
5. **Emits** a structured JSON report and a Markdown PR-comment block.

The exit codes:

- `0` — all checks passed
- `1` — one or more cross-check failures (the cited value drifted from reality)
- `2` — manifest read error or unrecoverable executor error

## Running locally

```bash
# Run the gate against the seed manifest
npm run gate                                  # or: npx tsx scripts/reconciliation-gate.ts

# Run quietly (only print failures + summary)
npm run gate -- --quiet

# Write a structured JSON report for downstream tooling
npm run gate -- --report-json /tmp/gate-report.json

# Also emit the Markdown PR-comment block
npm run gate -- --pr-comment

# Use a non-default manifest
npm run gate -- --manifest content/snapshots/manifest-issue-003.json

# Run with prose-side regression check (scans the MDX for historical_wrong_alarms)
npm run gate -- --prose content/reports/2026-05-may.mdx
```

### Prose-side regression check (`--prose`)

When `--prose <path>` is given, the gate also scans the report MDX for every
`historical_wrong_alarms` substring in every manifest entry. Any hit fails that
entry with `failure_reason: historical_wrong_value_detected`, regardless of
whether the cross-check itself passed. This catches the regression case where
someone copy-pastes an old, wrong figure back into the prose — e.g., the
Issue 002 "84% of LRT" figure that was post-published-then-corrected.

The alarms list is the audit trail of every value the entry has previously
been wrong about. As errors get caught and fixed, append their text to the
manifest entry's `historical_wrong_alarms`. The list grows monotonically.

## Running the derivation trail detector

This scans the published MDX for numerical citations and flags any that do not
have a manifest entry. By default it’s **warning-only** — uncovered citations
are listed but do not block merge. Flip
`global_config.derivation_trail_warnings_block_merge` to `true` in the manifest
to enforce coverage.

```bash
# Default — scans content/reports/2026-05-may.mdx
npx tsx scripts/derivation-trail-check.ts

# Strict — exits 1 on any uncovered citation
npx tsx scripts/derivation-trail-check.ts --strict

# Different report
npx tsx scripts/derivation-trail-check.ts --input content/reports/2026-06-june.mdx
```

The detector recognises three citation patterns:

- Percentages: `3.27%`, `88 percent`
- Basis points: `−0.3 bps`, `330 basis points`
- USD with magnitude: `$759M`, `$4.91 billion`, `$2.12B`

Bare integers (`six protocols`, `2026`, `§06.3`) are ignored to avoid false
positives on dates, anchors, and word-style counts.

## Adding a new manifest entry

Every time a body-section author cites a figure, they add a manifest entry.
That entry is the contract between the prose and the data.

```jsonc
{
  "id": "snake_case_unique_identifier",
  "issue": "003",
  "section_anchors": ["§01", "§06.4"],
  "cited_value": 12.34,
  "unit": "%",                        // "%", "bps", "USD", "absolute"
  "rounded_cited_in_prose": 12,       // optional — the rounded form authors typed
  "alt_forms_in_prose": [
    "12%",
    "12 percent",
    "twelve percent"
  ],
  "cross_check": {
    "method": "derived_from_snapshot",
    "snapshot": "content/snapshots/2026-06-X.json",
    "derive": "field",                // built-in deriver, see list below
    "params": { "field_path": "some.nested.value" }
  },
  "threshold_pct": 2.0,                // max acceptable divergence
  "absolute_threshold": null,          // optional — for near-zero metrics
  "last_verified_at": "2026-07-01T00:00:00Z",
  "notes": "Plain-English description. Required for future debugging."
}
```

### Available `derive` functions

These live in `scripts/lib/reconciliation-checks.ts` under `DERIVERS`:

- `field` — read a scalar at `params.field_path` (dot notation)
- `aave_v3_lrt_share_pct` — sum Aave V3 LRT totals from the lrt-collateral snapshot
- `per_asset_per_protocol_apy` — pull a (asset, protocol) APY from rate-dispersion
- `take_rate_formula` — apply `fees × (365/30) ÷ liquidity × 100`

Add new derivers as you need them — keep them small, pure, and named for the
metric they compute, not the snapshot they read.

## Supported cross-check methods

| Method | Use when | Network? | Determinism |
|---|---|---|---|
| `derived_from_snapshot` | A snapshot JSON in the repo has the raw inputs | No | Full |
| `http_json` | An HTTP API returns JSON with the value | Yes | Cache-dependent |
| `graphql` | Source is a GraphQL endpoint (Morpho, The Graph) | Yes | Cache-dependent |
| `onchain` | Source is an Ethereum RPC contract read | Yes | Per-block |
| `manual` | No automation possible; reviewer attests | No | Reviewer |

Prefer `derived_from_snapshot` whenever a script can produce a snapshot. It’s
the only method that survives upstream API outages and gives you a reproducible
gate.

## Threshold guidance

- **`0.0`** — Exact-match required. Use for counts (`compound_v3_comet_count`).
- **`1.0` – `2.0`** — Tight. Use for static metrics from snapshots that
  shouldn’t drift (Aave V3 LRT share derived from a freeze).
- **`3.0` – `5.0`** — Loose. Use for live-fetched series subject to intraday
  noise (DefiLlama APY at month-end).
- **`absolute_threshold`** — Use for near-zero metrics where relative
  divergence balloons (Real Yield Spread at parity).

## Overriding a failed check

The override workflow exists for the rare case where the cross-check itself is
wrong (a snapshot is stale, an API changed shape, the deriver has a bug).
**Never use override to silence a real divergence.** Fix the cited value or the
cross-check.

To override:

1. Add the label `reconciliation-override` to the PR.
2. Post an attestation comment in the PR thread explaining:
   - Which entry is being overridden
   - Why the cross-check is wrong (not why the prose is right)
   - What the follow-up is to fix the underlying cross-check
3. The CI job will surface the override label as a notice and unblock merge.

The override label triggers a notification in the CI logs and is recorded in
the PR comment artifact. Override usage should be visible in retrospectives.

## CI workflow design

The CI job at `.github/workflows/reconciliation.yml` enforces one critical
constraint: **it loads the manifest from the merge target, not the PR branch.**

This means a PR cannot silence the gate by editing the manifest in the same PR.
The gate compares the PR’s prose against the manifest as it sits on `main`. If
the PR wants to relax a threshold or add an alt-form, it must ship that change
in a separate, pre-publish PR (or rely on the override label, which requires
attestation).

The job:

1. Checks out the PR branch (prose under review)
2. Checks out the base branch’s manifest into a separate path
3. Copies the base-branch manifest over the PR-branch manifest
4. Runs `reconciliation-gate.ts` and `derivation-trail-check.ts`
5. Posts a sticky PR comment with the structured report
6. Inspects the PR labels for `reconciliation-override`
7. Fails the job unless the gate passed or the override label is present

Structured reports are uploaded as workflow artifacts for 30 days.

## Issue 002 errors the gate would have caught

The seed manifest is calibrated against the four known Issue 002 errors. If you
roll back to the pre-fact-check commit of `2026-05-may.mdx` and run the gate,
the manifest (which carries the verified May 31 values) will diverge from the
prose’s pre-correction values:

- `aave_v3_lrt_share`: prose says 84%, manifest cross-check produces 88.37% →
  divergence ~5%, threshold 1% → **FAIL**
- `morpho_idle_ratio`: prose says 63.7%, manifest cross-check produces 10.01% →
  divergence ~84%, threshold 2% → **FAIL**
- `compound_v3_comet_count`: prose says 4, manifest cross-check produces 6 →
  divergence 33%, threshold 0% → **FAIL**
- `aave_v3_usdc_supply_apy`: prose says 9.62%, manifest cross-check produces
  3.27% → divergence ~66%, threshold 3% → **FAIL**

That is the gate doing its job: catching, at build-time, the errors that the
editorial process caught manually post-publish.

## Future work

- **Per-issue manifests.** Each issue ships its own
  `manifest-issue-<n>.json`. The current single `manifest.json` is the
  rolling “latest issue” manifest.
- **Cross-issue drift detection.** A metric the gate has tracked across issues
  should expose its MoM/QoQ trajectory; sudden discontinuities trigger a
  separate alert.
- **More derivers.** As the report set grows, new families of cross-check will
  emerge. Add them in `reconciliation-checks.ts` and document each in the
  “derivers” section above.
- **Replace `onchain` placeholder.** The seed only stubs `onchain`. Plumb viem
  + an RPC env var when the first manifest entry needs it.
- **Article + clip pack coverage.** The detector currently scans only the
  published MDX. Extend it to scan the docx body text once the docx pipeline
  emits a deterministic plain-text export.
