# Issue 002 Morpho Curator HHI — Erratum

## Filed: 2026-07-02
## Section affected: content/reports/2026-05-may.mdx §06.3

## What Issue 002 reported

Issue 002's Morpho curator HHI reading of 3,103 at May 31, 2026 described the
concentration of curated total value locked across Morpho vaults as though
the reading covered Morpho's full curator surface. The prose framed the top-
three curator share of 93.9 percent (Sentora 38.6, Steakhouse Financial 34.1,
Gauntlet 21.2) as a protocol-level concentration reading.

## The methodological gap

The `snapshot-curator-hhi.ts` script as run for Issue 002 queried Morpho V1
vaults only, via the `vaults()` GraphQL endpoint on `blue-api.morpho.org`. It
did not query Morpho V2 vaults, which live under a separate GraphQL type
(`vaultV2s()`). Morpho V1 and Morpho V2 are separate contract systems with
separate curator registries.

At the May 31 anchor date, Morpho V2 was already operational and carried
material curator activity. Sentora, in particular, had deployed the Sentora
RLUSD Main vault on 2026-03-04 and would deploy Sentora PRIME Main on
2026-05-08, both under the V2 contract system. Those two positions alone
carried roughly $343 million of total assets at the time of Issue 002's
May 31 capture, none of it visible to a V1-only query.

Issue 002's HHI figure is accurate as a V1-only reading. It does not answer
the protocol-layer concentration question the prose framed it as answering.

## The corrected picture

When both V1 and V2 vault contract systems are queried and aggregated, the
Morpho curator picture at June 30, 2026 shows:

- HHI: 2,095 (below the U.S. Federal Trade Commission's "highly concentrated"
  threshold of 2,500; materially below Issue 002's V1-only May 31 reading of
  3,103)
- Top-three combined share: 74.6 percent (versus Issue 002's V1-only May 31
  reading of 93.9 percent)
- Sentora ranks first at 31.2 percent of combined curated TVL, $661.76 million
  across three flagship Vault V2 positions (Sentora RLUSD Main at $234M,
  Sentora PRIME Main at $109M, and a PayPal-branded PYUSD vault Sentora
  curates on the same infrastructure)
- Steakhouse Financial ranks second at 29.2 percent, roughly evenly split
  between V1 ($316M) and V2 ($302M)
- Gauntlet ranks third at 14.2 percent

See Issue 003 §06.2 and `content/snapshots/2026-06-30-curator-hhi.json` for
the full combined-view breakdown.

## What this means for Issue 002's prose

The Morpho HHI reading of 3,103 itself remains accurate for the V1 vault set
that was measured. What was inaccurate was the framing of the reading as
protocol-layer rather than V1-specific. Issue 002 as published stands, with
this erratum flagging the scope gap for future readers who might otherwise
misread the V1-only figure as a protocol-level concentration measure.

The specific §06.3 prose that this erratum modifies the reading of includes:

- "Morpho's curator HHI rose for the third consecutive month, from 3,026 at
  the April close to 3,103 at the May close, deepening past the antitrust
  threshold for highly concentrated markets."
- The framing of Sentora as "the largest of the three curators occupying
  that concentration."
- The July HHI forward call: "the June 30 capture lands above or below
  3,300, and whether Sentora's share of curated Morpho TVL crosses 45
  percent."

All three statements remain accurate as V1-only readings. They do not
translate to protocol-layer statements.

## Fix landed in

- `scripts/snapshot-curator-hhi.ts` now queries both V1 (`vaults()`) and V2
  (`vaultV2s()`) in parallel and aggregates them together. The output JSON
  preserves the V1/V2 split per curator so any downstream reader can
  reconstruct either sub-view or the combined view as needed. The schema
  version bumped from 1 to 2.
- All future issues will use the V1+V2 combined view by default. Issue 003
  §06.2 is the first issue drafted on the corrected methodology.
- The historical time series persisted in Neon's `morpho_curator_hhi_history`
  table remains a V1-only series through the May and June V1-only captures.
  The V1+V2 combined series begins on 2026-07-02. Consumers of the table
  need a methodology-break flag before comparing across the two eras.

## Discovery path

The gap was surfaced during Issue 003 Pass 3 review when Joel filtered the
Morpho vault dashboard by curator and observed five Sentora-curated V2
vaults totaling roughly $669 million. The initial Pass 2 draft had cited
Sentora as functionally exited, based on the V1-only query returning three
dust vaults totaling $170.88. The frontend filter surfaced the V2 population
the query did not query. Direct schema introspection against
`blue-api.morpho.org` confirmed V1 and V2 as separate types requiring
separate queries. Full triangulation in
`content/snapshots/2026-06-sentora-curator-triangulation.md`.

## No retroactive prose edit

This erratum is a reconciliation artifact for future readers. Issue 002's
published prose is not being retroactively rewritten. The reading as
published was accurate for what was measured; the framing gap this erratum
documents is a scope caveat, not a factual correction to the V1-only
number.
