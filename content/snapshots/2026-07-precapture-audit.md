# Issue 004 pre-capture audit — July 2026

**Snapshot cutoff:** 2026-07-31 23:59 UTC
**Audit date:** 2026-08-01
**Prior issue reference:** Issue 003 (June 2026), published 2026-07-31
**Audit lead:** Joel Obafemi

Purpose: freeze the July capture surface before running any queries. Verify upstream endpoint health, confirm every June cut has a July equivalent planned, and carry forward every methodology correction landed in Issue 003 so we don't re-open closed alarms.

---

## 1. Upstream health check

Run before capture:

```bash
npm run check:upstream
```

Expected: all critical checks pass (Morpho state.curators, Morpho vaultV2s, DefiLlama /pools with Fluid multi-slug + all six protocol projects, DefiLlama /protocol series through 2026-07-31, DefiLlama /summary/fees, FRED TB4WK, FRED DFF).

Record output at the bottom of this file under "Endpoint health log".

If DefiLlama /chart is still WARN (paywalled), that is expected. Per-pool history charts remain degraded until an alt source is wired.

Additional cross-check specific to the July cycle:

- Confirm blue-api.morpho.org `vaultV2s` returns a `creationTimestamp` cutoff filter that works for 2026-07-31 (methodology carry-forward from Issue 003's V1+V2 combined HHI fix).
- Confirm DefiLlama `fluid-lending` still splits from `fluid-dex`, `fluid-lite`, `fluid` (the multi-slug aggregation guard in query-gho-flow-cross-venue.ts assumes four sub-slugs).
- Confirm Compound V3 base list still returns cWETHv3 with ETH-denominated pricing (Issue 003 cWETHv3 bug fix — ETH_DENOMINATED_BASES set + Chainlink ETH/USD multiplier — must remain in effect).

## 2. Neon table coverage through July 31

Run:

```bash
npm run scan
```

Verify each of these tables has non-null rows dated 2026-07-31:

- `sector_snapshots_daily` — sector aggregates
- `per_protocol_daily` — protocol-level TVL/borrowed/utilization
- `per_asset_daily` — per-asset holdings on Aave V3 (used for constant-price flow decomposition)
- `liquidation_events` — sector-wide liquidation feed (drives the July liquidation-day identification)
- `curator_holdings_daily` — Morpho V1+V2 curator TVL (feeds HHI)
- `rate_matrix_daily` — per-(asset, protocol) supply/borrow APY snapshot

If any table shows the last date < 2026-07-31, run the corresponding snapshot script before capture.

## 3. July capture worklist

Every June snapshot listed here needs a July equivalent. Filenames follow the pattern `2026-07-<slug>.<ext>`. Scripts with a `-june` suffix need a `-july` sibling (see §5 for the code-side worklist).

### Per-protocol daily flow CSVs (6)

- `2026-07-aave-daily-flows.csv`
- `2026-07-spark-daily-flows.csv`
- `2026-07-morpho-daily-flows.csv`
- `2026-07-fluid-daily-flows.csv`
- `2026-07-compound-v3-daily-flows.csv`
- `2026-07-euler-v2-daily-flows.csv`

### Sector-level cuts (5)

- `2026-07-ldr-per-protocol.json` — LDR ranking with Compound V3 and Euler V2 on-chain overrides
- `2026-07-liquidations-daily.json` — daily liquidation series with month-max event analysis
- `2026-07-rys-historical.json` — Real Yield Spread trajectory with July 31 anchor
- `2026-07-rate-dispersion.json` — per-(asset, protocol) supply/borrow APY at July 31
- `2026-07-oracle-concentration.json` — sector oracle-provider concentration reading

### Aave V3 detail cuts (3)

- `2026-07-aave-v3-per-asset-flow.json` — per-asset constant-price flow decomposition (essential for the June-style USDC-vs-collateral read)
- `2026-07-aave-outflow-days-by-asset.json` — day-level outflow attribution
- `2026-07-aave-weeth-by-market.json` — weETH per-market breakdown for LRT reprice guard

### Morpho curator cut (1)

- `2026-07-31-curator-hhi.json` — V1 + V2 combined HHI with per-curator share table

Methodology: must use the V1+V2 combined query established in Issue 003 (vaultV2s with orderBy TotalAssetsUsd Desc, top-50 each side, `creationTimestamp <= 2026-07-31 UTC`).

### GHO cross-venue cut (1)

- `2026-07-gho-cross-venue-flow.json` — Aave V3 mint-facilitator vs Fluid multi-slug aggregation

### LRT / collateral cuts (2)

- `2026-07-lrt-collateral.json` — LRT holdings across all covered protocols
- `2026-07-lrt-spot-prices.json` — end-of-month LRT/ETH spot prices for the mark-to-market wedge

### Euler V2 cuts (3)

- `2026-07-euler-vault-apys.json`
- `2026-07-euler-vault-curators.json`
- `2026-07-euler-vault-flows.json`

### Compound V3 cut (1)

- `2026-07-compound-comet-markets.json` — Comet enumeration with cWETHv3 ETH-denominated pricing intact

**Total: 22 core snapshot cuts.** Additional `.md` notes for any July-specific corrections or methodology decisions get added ad hoc.

## 4. Methodology carry-forwards from Issue 003

Every fix from Issue 003 must remain in force. Any July reading that regresses one of these fires the reconciliation gate.

**Sentora / Morpho HHI (V1 + V2 combined).** The V1-only HHI reading is dead. Curator concentration is always the V1+V2 combined view. Sentora's flagship V2 vaults are the majority of its curated TVL; V1-only reads will drop it to near-zero and fabricate a "walked away" story that never happened.

**Aave V3 asset-composition decomposition.** Net protocol flow is never treated as USDC-driven without checking the per-asset script output. June's +$845M was collateral inflow with USDC net -$162M. July's number needs the same decomposition before any thesis is written.

**Constant-price is the canonical flow methodology.** Nominal net-deposits-30d is a dashboard card, not a report figure. All flow prose uses constant-price. When both are cited, label explicitly.

**cWETHv3 ETH/USD oracle.** Compound V3 base pricing must apply ETH_DENOMINATED_BASES + Chainlink ETH/USD multiplier. Any regression back to the WETH/ETH peg feed gives cWETHv3 as ~$50K instead of ~$83M and blows out sector supply.

**LRT reprice separation.** Depositor-token deltas vs USD deltas are separated per-asset. The June weETH read had 14,000-token depositor addition masked by $419M mark-to-market decline. July needs the same explicit split for any LRT reading.

**Sector RYS uses blended stablecoin APY minus FRED TB4WK.** No shortcut readings from a single-protocol USDC rate. Blend across the sector's top four stables by TVL.

**Fluid multi-slug on /pools, single-slug on /protocol.** The query-gho-flow-cross-venue.ts aggregation pattern must remain: four sub-slugs summed for /pools reads, fluid-lending only for /protocol history reads.

## 5. Code-side worklist (scripts needing July variants)

Scripts with a `-june` suffix need a `-july` sibling. The mechanical action is copy-file, s/june/july/g, adjust cutoff constant, add npm script entry.

- `query-aave-june-daily-flows.ts` → `query-aave-july-daily-flows.ts`
- `query-aave-outflow-days-by-asset-june.ts` → `-july.ts`
- `query-aave-v3-per-asset-flow-june.ts` → `-july.ts`
- `query-aave-weeth-by-market-june.ts` → `-july.ts`
- `query-compound-v3-june-daily-flows.ts` → `query-compound-v3-july-daily-flows.ts`
- `query-euler-v2-june-daily-flows.ts` → `-july.ts`
- `query-euler-vault-apys-june.ts` → `-july.ts`
- `query-euler-vault-curators-june.ts` → `-july.ts`
- `query-euler-vault-flows-june.ts` → `-july.ts`
- `query-fluid-june-daily-flows.ts` → `-july.ts`
- `query-liquidations-june-daily.ts` → `query-liquidations-july-daily.ts`
- `query-lrt-collateral-june.ts` → `-july.ts`
- `query-lrt-spot-prices-june.ts` → `-july.ts`
- `query-morpho-june-daily-flows.ts` → `-july.ts`
- `query-oracle-concentration-june.ts` → `-july.ts`
- `query-rate-dispersion-june.ts` → `-july.ts`
- `query-rys-historical-june.ts` → `-july.ts`
- `query-spark-june-daily-flows.ts` → `-july.ts`

Scripts that already parameterise by month and just need re-running against 2026-07-31:

- `snapshot-curator-hhi.ts` (make sure it takes a cutoff arg or overwrite the current file)
- `query-compound-comet-markets.ts`
- `query-ldr-monthly.ts`
- `query-gho-flow-cross-venue.ts`

Also update `package.json` script entries for every new -july variant.

## 6. Reconciliation gate — new July manifest entries

`content/snapshots/manifest.json` needs Issue 004 entries mirroring the Issue 003 shape. Draft the placeholder set at capture time, once we know the actual July figures. Structural template per entry:

- `id`: `<metric>_july_31` (e.g. `rys_july_31`, `curator_hhi_v1_v2_july_31`)
- `issue`: `"004"`
- `section_anchors`: to be filled during drafting
- `cited_value`: filled after capture
- `cross_check.snapshot`: `content/snapshots/2026-07-<slug>.json`
- `historical_wrong_alarms`: carry forward June's alarms (V1-only HHI, USDC-driven Aave growth, -$503M nominal May reading, "second-deepest inversion" arithmetic error, etc.)

## 7. July events to flag during capture

Flag these known movements for special treatment. Add more as discovered during capture.

- **Aave V3 GHO facilitator changes** — check the mint-facilitator side for any July changes (module cap increases, new integrations).
- **Morpho V2 curator TVL migration** — is Sentora, Steakhouse, or Gauntlet moving TVL from V1 to V2 vaults? This is a live trend from Issue 003 and any acceleration matters for the concentration story.
- **Fluid USDC rate leadership** — June's +281 bps positive spread over T-bill (6.41% vs 3.19% Aave V3) is the standing anchor. Did the lead widen, narrow, or invert in July?
- **Post-June-5 liquidation environment** — did July have another concentrated-liquidation day (>$50M sector, >3x trailing median)? If yes, run the same day-level decomposition Issue 003 used.
- **LRT price cycle continuation** — the ETH-family collateral mark-to-market wedge shaped Issue 003's Aave V3 collateral read. Check whether the July LRT/ETH ratios continued their trajectory or reversed.
- **Compound V3 wstETH / WBTC Comet activity** — the two newer bases were undersized in Issue 003. If July shows meaningful growth in either, it changes the "Comet count grew but usage concentrated" framing.

## 8. Blocked / open questions

- Are there any July governance events (protocol upgrades, DAO votes, market listings) that need dedicated coverage? If yes, list here so capture can carry the relevant data. **Awaiting Joel's input.**
- Is there a specific narrative angle already forming from July's Twitter / on-chain reads that should shape which cuts get depth? If yes, we can prioritise. **Awaiting Joel's input.**

## 9. Endpoint health log

Output of `npm run check:upstream` (run 2026-08-01):

```
Checking upstream data sources…

[PASS] Morpho vaultByAddress — state + allocation present (TVL $77.0M)
[PASS] Morpho state.curators — 37/50 top vaults carry a curator (of 450 total)
[PASS] DefiLlama /chart — 200 — chart endpoint is accessible again (history charts can be restored)
[PASS] FRED TB4WK — 300 observations
[PASS] FRED DFF — 26328 observations
[PASS] DefiLlama /pools shape — 15819 pools, shape intact
[PASS] DefiLlama Fluid project "fluid-lending" — 58 Ethereum pools
[PASS] DefiLlama Fluid project "fluid-dex" — 30 Ethereum pools
[PASS] DefiLlama /protocol — chainTvls.Ethereum.tvl present
[PASS] DefiLlama /summary/fees — totalDataChartBreakdown present

── Summary ──
  9/9 critical checks passed
  0 warning(s)

✓ All critical upstream checks passed.
```

Note: DefiLlama `/chart` returned PASS (200), not the WARN the audit anticipated —
the chart endpoint is accessible again, so per-pool history charts can be restored.

Output of `npm run scan` (attempted 2026-08-01): **COMMAND FAILED — not fabricated.**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  'scripts/scan.ts' imported from lending-intelligence-terminal/
```

The `"scan"` entry in `package.json` points at `scripts/scan.ts`, which does not
exist and has never been committed to this repo (`git log -- scripts/scan.ts`
returns nothing).

The Neon table coverage could not be verified because there is no scan script to
run. Separately, §2 of this audit names six tables that do not match the repo's
actual schema. Tables actually referenced in `scripts/` and `lib/`:

- `liquidation_events`   (matches §2 verbatim)
- `sector_snapshots`     (§2 says `sector_snapshots_daily`)
- `rate_snapshots`       (§2 says `rate_matrix_daily`)
- `morpho_curator_hhi_history` (§2 says `curator_holdings_daily`)
- `protocols`, `token_metadata`
- No `per_protocol_daily` / `per_asset_daily` found under those names.

`DATABASE_URL` is present locally, so a scan can connect once a script exists.

**ACTION REQUIRED (Joel), pick one before capture:**
1. Point to / restore the real scan script if it lives elsewhere.
2. Approve building `scripts/scan.ts` against the actual table names above.
3. Revise §2's table list to match the real schema, then (1) or (2).

Scaffolding (Parts B-E) proceeded regardless, since it is independent of the scan
and the upstream gate passed 9/9.

## 10. Sign-off checklist

Before starting §01 draft:

- [ ] All critical upstream checks pass
- [ ] Neon tables covered through 2026-07-31
- [ ] All 22 July snapshot cuts captured
- [ ] All -july script variants created and added to package.json
- [ ] Reconciliation gate runs clean (`npm run gate:full`)
- [ ] Draft July manifest entries added (values filled after capture)
- [ ] Issue 003 methodology carry-forwards verified against fresh reads
- [ ] Any flagged July events have supporting captures ready
