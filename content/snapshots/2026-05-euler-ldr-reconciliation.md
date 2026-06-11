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
