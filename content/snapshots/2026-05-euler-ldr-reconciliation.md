# Euler V2 LDR Reconciliation — May 31, 2026

**Date:** 2026-06-09
**Trigger:** Issue 002 §06.4 Fluid deep dive fix flagged a possible 18pp gap between the dashboard's Euler V2 LDR reading (67.27%) and the snapshot reading (85.23%). Before any prose update, the canonical value had to be determined.

## Three independent on-chain readings, all ~85%

| Source | Methodology | tvl | borrowed | supplied | LDR |
|---|---|---|---|---|---|
| `2026-05-ldr-per-protocol.json` (current snapshot) | `lib/euler-onchain.ts` — Σ totalAssets / Σ totalBorrows across active EVK vaults, prices via DefiLlama `/coins/prices/current` | $74.23M | $428.29M | $502.52M | **85.23%** |
| `2026-04-30-euler-onchain.json` → `may_31_corrected_reference` | `scripts/query-euler-apr30-onchain.ts` — independent re-audit on a different day, same on-chain enumeration shape | $70M | $399M | $469M | 85.07% |
| `lib/euler-onchain.ts` runtime override | Applied to `loadOverview()` row card at `lib/overview.ts:425-427` | (same as snapshot) | (same as snapshot) | (same as snapshot) | 85.23% |

The three readings sit within 0.2pp of each other — rounding noise between two on-chain captures at slightly different block heights, plus a third reading from the same code path the snapshot used. **Canonical Euler V2 LDR at May 31, 2026: 85.23%.**

## Why the dashboard's LDR chart shows ~67%

The dashboard's `components/overview/ldr-chart.tsx` is fed by `loadOverview()`'s `utilizationSeries`, `supplySeries`, and `borrowedSeries`. The on-chain override in `lib/overview.ts:420-428` is applied **only to the latest-period row card** (the "current value" composition strip / per-protocol card). The historical timeseries that feeds the chart is built from `h.tvl` and `h.borrowed` (raw DefiLlama `chainTvls.Ethereum.tokensInUsd`) at `lib/overview.ts:455-464`. That path **doesn't get the override**.

DefiLlama over-counts Euler V2's TVL because its adapter prices several EVK collateral assets off-market — the same class of bug the Compound V3 card-fix work documented in `content/snapshots/2026-06-compound-card-fix.md`. For Compound V3 the gap was ~$340M at May 31 / ~$180M today; for Euler V2 the audit flags it at ~$70M.

The math at May 31:
- On-chain: tvl $74.23M + borrowed $428.29M = supplied $502.52M → LDR 85.23%
- DefiLlama-fed timeseries: a depressed-borrow + inflated-tvl combination that lands the chart's point at ~67%. The exact day's DefiLlama-computed reading depends on which day the timeseries fetch was done; bucketed May-average will sit lower than month-end.

## Decision

**Canonical Euler V2 LDR for Issue 002 §06.4 prose: 85.23%.**

This is the value the report and the rest of the deep-dive infrastructure are already keyed to (the snapshot, the §06.6 Euler deep dive, and the reconciliation gate manifest will be aligned to it).

## Follow-up — dashboard timeseries fix

File a separate task to extend the on-chain override in `lib/overview.ts` to apply across the entire historical timeseries for Euler V2 (and re-validate for Compound V3 — the comment block at `lib/overview.ts:414-419` covers the card override but not the chart override). The LDR chart at `/lending-terminal` will read the depressed DefiLlama value until that lands.

**Suggested approach:** for the override-eligible slugs (Compound V3, Euler V2), substitute the latest day's tvl/borrowed in `tvlByDay` and `borrowedByDay` after the merge loop (lines 455-464). Then propagate the substitution back through some number of historical days using a scaled adjustment, or accept that only the latest day matches on-chain and the earlier history remains DefiLlama-truth. The simpler fix is to label the chart "DefiLlama-truth historical, on-chain latest" in a methodology tooltip until a fully on-chain historical pipeline exists.

This work doesn't block Issue 002's §06.4 prose fix — the canonical value (85.23%) is the same one already in the published prose; only the FRAMING around it needs to change.

## Resolution — Path B chosen during Issue 003 pre-capture audit (2026-06-30)

Three paths from the audit brief:

  - **Path A** (apply override to historical points). Constant-ratio
    correction is mathematically wrong because the over-count scales
    with protocol size, not as a fixed percentage (Compound: $180M
    today, $340M at May 31 — same protocol, very different ratios).
    The "real" Path A — per-day archive RPC reads — requires
    infrastructure we don't have wired and adds significant compute
    cost per page render.
  - **Path B** (latest-only override, methodology tooltip).
  - **Path C** (document and defer).

**Picked Path B.** Path A's shortcut is wrong, the long version is
heavy, and Path C lets the framing drift compound across Issues 002 →
003 → … . Path B is honest about the data-source gap.

**What changed:**

  - `lib/methodology.ts` — `sector-ldr` tooltip now states that the
    historical line uses DefiLlama (over-counts Compound V3 + Euler V2
    by ~10-15%) and only the current-row card carries the on-chain
    substitution. Source line restated to match.
  - No code change to `lib/overview.ts` — the asymmetry between
    latest-row and historical-timeseries is now documented behavior
    rather than an undocumented gap.

**What didn't change:**

  - The reconciliation gate manifest's `euler_v2_ldr` entry still
    references the 85.23% canonical snapshot — that's the on-chain
    truth, used in prose and the gate. Unaffected by this framing
    change.
  - The /lending-terminal Overview's LDR card (composition-strip)
    continues to show the on-chain-substituted current value.
  - The published §06.4 prose still anchors on 85.23%.

**Issue 003 implication:** when §06.4 (or its successor section) is
written, reference the on-chain anchor for the canonical reading and
treat the dashboard chart's depressed historical line as the
DefiLlama-consistent comparator. The methodology tooltip now spells
this out for any reader who clicks through.
