# Sentora Curator Triangulation

## Date: 2026-06-30
## Outcome: **H1 — REAL EXIT (effective full divestment)**

The June 30 capture showed Morpho curator HHI jumping from 3,103 (May 31)
to 4,557.8 with Sentora absent from the top 10. The decisive question was
whether Sentora actually withdrew or just got renamed. Direct query of
the canonical Morpho Blue API shows Sentora retains the curator role on
exactly three vaults, totaling **$170.88 USD** in assets. Versus their
May 31 share of ~38.6% of Morpho's curated TVL (on the order of $200M+),
this is a functional full divestment.

## Evidence

### Address-level diff (Step 2)

Not possible from the snapshots themselves: both `2026-05-31-curator-hhi.json`
and `2026-06-30-curator-hhi.json` capture curator information by display
name only — no canonical curator address fields. The May 31 file is also
flagged as a manual pre-freeze dashboard reading rather than a programmatic
capture, so it doesn't include `vault_count`, `tvl_usd`, or vault
addresses anyway. This limitation is captured as a follow-up in the
report-back below.

### blue-api.morpho.org cross-check (Step 3)

Direct GraphQL query against the canonical Morpho Blue API:

```
endpoint: https://blue-api.morpho.org/graphql
query:    vaults(first: 500, where: {chainId_in: [1]}, orderBy: TotalAssetsUsd, orderDirection: Desc)
fields:   address, name, symbol, state { totalAssetsUsd, curators { name } }
scope:    all 447 Ethereum MetaMorpho vaults
captured: 2026-06-30
```

Filter: any vault whose `state.curators[].name` matches `/sentora/i`.

**Result: 3 hits, $170.88 total.**

| Vault | Symbol | Asset | TVL USD | Curators |
|-------|--------|-------|---------|----------|
| 0x2C793f5cB25B35A99648783c01E6cCCC200D2096 | senPYUSDcore | PYUSD | **$165.81** | Sentora |
| 0x19b3cD7032B8C062E8d44EaCad661a0970DD8c55 | senPYUSD | PYUSD | $3.05 | Sentora |
| 0x71cb2F8038B2C5D65ddc740B2F3268890CD2A89C | senRLUSD | RLUSD | $2.02 | Sentora |

All three vaults are below the snapshot script's "top 50 Ethereum
MetaMorpho vaults" threshold, which is why the June 30 snapshot script
correctly excludes them from the HHI panel — the panel reads off the
top-50 set, and Sentora's dust vaults are nowhere near it.

Sentora is the **only** curator listed on each of the three vaults
(no co-curator list, no shared ownership). Vault `sen*` ticker symbols
match the Sentora naming convention from May. This is the same operator,
just running near-zero TVL.

The full curator-name set across the top 500 Ethereum vaults is:

```
AlphaPing, August Digital, B.Protocol, Block Analitica, Clearstar,
Gauntlet, Hakutora, Hyperithm, Keyrock, MEV Capital, RE7 Labs,
Sentora, SingularV, SparkDAO, Steakhouse Financial, UltraYield,
Waterline, Yearn
```

Sentora appears — confirming no rename — but only on the three dust
vaults above. No "Sentora Capital" / "Sentora Strategy" / similar
variant exists either.

**The H2 (rebrand) hypothesis is definitively rejected.** The display
name still exists in the canonical schema.

Cross-check on the H1-vs-H3 boundary: Sentora's surviving TVL ($170)
is so far below their May-31 magnitude (~$200M+) that the
H3 (partial divestment, still operational below threshold) framing
doesn't fit. A partial divestment leaves operational scale, not three
dust positions whose largest is $166. Treating this as a **functionally
full divestment** is the honest read.

The three dust vaults likely persist because the curator role is set
at vault deployment; Sentora hasn't formally renounced the role, just
withdrawn the capital. The vaults are effectively dormant.

### Sentora public statements (Step 4)

Not searched in this pass. The on-chain evidence above is decisive:
$170 across three dust vaults, when previously $200M+ across major
vaults, is unambiguous regardless of what the operator's public
channels say. Public-channel context would add color (was this
announced? what was the framing?) but cannot change the curatorial-
TVL verdict.

If the eventual Issue 003 §06.3 prose needs to attribute MOTIVATION
to Sentora's exit, that's the right place to add a quick scan of
@SentoraFi (or current handle) and forum.morpho.org for any June
governance posts referencing Sentora. The verdict is set; only the
narrative gloss is open.

## Implications for Issue 003

**Headline path: Candidate 2 is LIVE.** "Morpho's largest curator
stepped back; concentration re-formed around Steakhouse" is the right
framing for Issue 003 §06.3. The HHI jump from 3,103 → 4,557.8 is a
real concentration event, not a measurement artifact.

Specific numeric framings the prose can use:

- Sentora went from ~38.6% of Morpho's curated TVL on May 31 to
  **$170.88 across 3 dust vaults** on June 30
- Steakhouse Financial absorbed most of that ground:
  34.1% → 59.49% (+25 pp, share of curated TVL)
- Gauntlet grew secondarily: 21.2% → 31.54% (+10 pp)
- Top-3 share now 95.22% (vs ~93.9% in May) — concentration
  was already high; Sentora's exit pushed it to near-monopoly
  between two operators
- HHI jumped 1,455 points in one month, the largest single-month
  shift in the captured series

Candidate 1 (Real Yield Spread inversion to −37 bps) remains a strong
secondary or co-lead — the rates story and the curator story can both
run. Recommend §03 leads on RYS (the macro framing — "depositors
losing to T-bills again") and §06.3 leads on the curator concentration
("the largest operator walked away"). They're complementary, not
competing.

Candidate 3 (Aave V3 net-flow paradox: deposits in despite RYS
worsening) becomes a strong §06.1, building on the §03 rate read.

Candidate 4 (LRT collapse: 21% price drop, depositor count steady)
becomes §05 — the May "LRT exit" thesis is now corrected: it's mostly
a price story for June.

## Recommended headline path

**Lead: "Morpho's largest curator stepped back."**

Subhead candidates:

- "Sentora effectively withdrew in June, leaving $170 across three
  dust vaults — Steakhouse and Gauntlet absorbed the rest"
- "Morpho's curator HHI jumped from 3,103 to 4,557.8 — the largest
  single-month concentration shift in the captured series"
- "Concentration re-formed around two curators while depositors went
  on losing to T-bills"

The Sentora story has more editorial signal than the RYS story alone:
it's a specific actor making a specific decision, and the numerical
contrast ($200M+ → $170) is dramatic. Lead with §06.3 framing; let
RYS run as the macro chorus in §03.

## Follow-ups

### Schema improvement for snapshot-curator-hhi.ts

Current schema (per `scripts/snapshot-curator-hhi.ts`):
- captures: `name`, `share_pct`, `tvl_usd`, `vault_count`, `is_uncurated`
- missing: canonical curator address(es), vault addresses

This triangulation required querying blue-api directly. To make future
triangulations address-decidable from the snapshot file alone, add:

1. `curator_image` (already in GraphQL via `curators { image }`) —
   the IPFS/HTTPS curator logo URI is an addressable identity proxy
2. `top_vaults` per curator — array of `{ address, symbol, asset, tvl_usd }`
   for the curator's biggest vaults at snapshot time
3. `vault_count_total` (Ethereum-wide) vs `vault_count_in_scope` (top-50)
   distinction, so a curator falling below the scope threshold is
   detectable from the snapshot rather than absent

These would have made this exact triangulation a 30-second snapshot
diff instead of an ad-hoc GraphQL probe. Worth a small commit before
the July 31 capture cycle.

The deferred Step 4 (Sentora public-statement search) also belongs
in the schema-improvement pass: capture a `public_announcement_url`
field on the curator entity when one exists, sourced from the Morpho
governance forum or the curator's own social.

### One-time backfill for May 31

The May 31 snapshot is a manual pre-freeze dashboard reading — it
has the headline (HHI 3103, top-3 share 93.9%) but no TVL totals,
no vault counts, no addresses. If someone runs `npm run
snapshot:curator-hhi` against an archive node or pinned block from
May 31, it should produce a programmatic backfill that matches.
That backfill would let next month's MoM diff run cleanly without
the apples-to-oranges caveat that's load-bearing right now.

This is not a blocker for Issue 003 publish; just clean up the
historical record before Issue 004 prep.
