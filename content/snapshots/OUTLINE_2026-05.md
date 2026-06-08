> **SUPERSEDED 2026-06-07** — Aave V3 USDC market figures of 9.62% supply APY,
> 10.95% borrow APY, 97.6% utilization were not backed by captured data and
> were corrected at publication. Real Aave V3 USDC supply APY on 2026-05-31
> was 3.27% per `content/snapshots/2026-05-rate-dispersion.json`. See
> Issue 002 §03 in `content/reports/2026-05-may.mdx` for the corrected
> sector-wide mechanism framing.

# Issue 002 — State of DeFi Lending on Ethereum (May 2026)

**Status:** Outline draft. Living document until pipeline data is in.
**Snapshot date:** May 31, 2026, 23:59 UTC
**MoM baseline:** Apr 30, 2026 (six-protocol).
**Coverage:** Aave V3, Spark, Morpho, Fluid, **Compound (new)**, **Euler (new)**.

## Proposed title and theme

**Title options (revised after the Sentora finding):**

- **"The Loop Unwinds"** — original pick. Clean, three-word, signals the LRT story. Still works for §05 but undersells §06.6 + §07.
- **"The Curator Moves"** — foregrounds the Sentora cross-protocol finding. Possibly the most editorially distinctive title of any month.
- **"Two Protocols, One Decision"** — names the cross-protocol mechanism directly.
- **"Capital Stays, Loops Leave"** — sharper contrast on the LRT side.

My pick after the Sentora finding: **"The Curator Moves"**. The LRT loop unwind is the biggest dollar story of the month ($1.17B in LRT outflows) but it's a continuation of April's narrative. The Sentora finding is the first time the curator-as-cross-protocol-actor pattern shows up empirically in our data. That's the more distinctive editorial frame, and the data supports it cleanly. "The Loop Unwinds" can become a section header for §05 instead.

**One-line thesis:** May was the month a single curator named on the page moved $128M out of one lending protocol and $94M into another, and the data showed that this — not the LRT loop unwind, not the Real Yield Spread turning positive — is the structural story of where on-chain credit allocation now lives.

## Structural changes from Issue 001

Three changes worth flagging up front, because they affect how the data tables read:

**Six protocols, not four.** Compound and Euler are now in the sector aggregate. The MoM baseline cannot be lifted directly from Issue 001 — the Apr 30 figures there were four-protocol. The six-protocol Apr 30 baseline is now captured in `content/snapshots/2026-04-30-baseline.json` (backfilled via DefiLlama for Compound and Euler, since they weren't in the original Neon snapshot row for Apr 30).

**Morpho curator HHI graduates to the cheat sheet.** Issue 001 buried HHI in the Morpho deep dive. Three consecutive months past 2,500 (2,700 → 3,026 → 3,103), plus the structural risk it captures, earns it a first-class slot in §01.

**Compound and Euler need narrative framing.** Issue 001 readers won't know why these two appeared. A short paragraph in §02 explaining the expansion and what each protocol contributes to the picture. Euler in particular is no longer a "framing" section — see §06.6 for the actual story.

## The reconciliation finding (worth surfacing in §02)

The 4-protocol view of May would say sector grew +1.33% MoM. The honest 6-protocol view shows the sector contracted by 4.6 to 6.3% depending on which series you cite. Issue 002 has to reconcile this in §02 or §04, because anyone comparing Issue 001's $32.26B published April baseline to May's $33.06B headline will reach the wrong conclusion.

Two reference figures, both correct from their own source:

- **Dashboard / Neon-implied 6-protocol Apr 30:** $34.64B. (Derived from May 31 sector $33.06B + dashboard's published MoM delta of $1.58B. This is the figure to cite in the body, since the rest of the report sources from Neon.)
- **DefiLlama-reconstructed 6-protocol Apr 30:** $35.01B. (Sum of per-protocol DefiLlama supply at Apr 30 close. ~$370M, or ~1%, above the Neon-implied figure. Worth a footnote acknowledging the reconciliation gap.)

Both point in the same direction: the sector shrank in May. The narrative is "the rotation continued and the dollar base contracted," not "the sector grew."

---

## Outline by section

### §00 How to Read This Report

Same conventions as Issue 001 (bps, pp, Real Yield Spread). Add one new entry:

- **HHI (Herfindahl-Hirschman Index)** — the metric used in §01 and §07 to measure curator concentration on Morpho. One number that captures how concentrated a market is. Above 2,500 = highly concentrated by antitrust convention.

### §01 The Cheat Sheet

Same four-table structure as Issue 001, with these adjustments:

**Table 1 — Sector aggregate:** Add Morpho Curator HHI as a new row. Six metrics now (Total Supply, Active Borrows, Available Liquidity, Sector Utilization, Real Yield Spread, Sector Take Rate, Morpho Curator HHI).

> **DATA NEEDED — Six-protocol Apr 30 baseline.** The May 31 column is filled from the freeze JSON. The Apr 30 column needs the six-protocol values from `sector_snapshots`. (Issue 001 published a four-protocol baseline. We need the six-protocol baseline that the dashboard internally uses for MoM deltas.)

**Table 2 — Net flows by protocol, May 2026:** Six rows now. Sector total plus per-protocol.

| Protocol | Net deposits 30d | May 31 supply | MoM change |
|---|---|---|---|
| Aave V3 | −$503M | $18.61B | _need 6-protocol Apr 30 figure_ |
| Spark | +$751.6M | $5.38B | _need 6-protocol Apr 30 figure_ |
| Morpho | +$758.7M | $5.96B | _need 6-protocol Apr 30 figure_ |
| Fluid | −$53.7M | $963M | _need 6-protocol Apr 30 figure_ |
| Compound | −$31.9M | $1.61B | _need 6-protocol Apr 30 figure_ |
| Euler | −$338.5M | $539M | _need 6-protocol Apr 30 figure_ |

**Table 3 — Ethereum-only fees, calendar month:** This comes from the `eom-report:may` script output. Six rows (one per protocol) plus sector. Apr vs May plus MoM.

> **DATA NEEDED — `eom-report:may` output.** Run on Windows tonight, redirect to `content/snapshots/2026-05-eom-report.txt`, then I'll lift the table into the cheat sheet.

**Table 4 — Risk indicators, May 31 close:**

| Indicator | Reading |
|---|---|
| Stablecoin debt share | 59.3% (USDC 26.2 + USDT 22.8 + PYUSD 3.2 + USDS 2.9 + DAI 2.2 + USDTB 2.0) |
| Oracle concentration | _DATA NEEDED — fresh oracle concentration pull_ |
| Liquidation intensity 90D | _DATA NEEDED — liquidator_db query, all 6 protocols_ |
| Liquidation efficiency | _DATA NEEDED — same as above_ |
| Morpho curator HHI | 3,103 (highly concentrated; up from 3,026 in April) |
| Morpho top 3 share | 93.9% (Sentora 38.6, Steakhouse 34.1, Gauntlet 21.2) |
| Morpho idle ratio | ~10% verified May 31 (was 63.7 unverified in this outline — see 2026-05-morpho-idle-ratio.json; thesis dropped from Issue 002) |
| Aave V3 USDC market | 97.6% utilization, 9.62% supply APY (borrow squeeze) |

### §02 Executive Summary

**Opening lead:** "May was the month the LRT loops finished unwinding what April started."

Paragraphs to land in this section:

1. **The LRT collateral base continued to drain across the sector.** ~$1.17B in net LRT outflows in May (WEETH $844M Sankey / $681M constant-price on Aave V3, RSETH $221M, EZETH $64M, OSETH $46M). The May 14 rsETH unpause and May 17 WETH LTV restoration were the procedurally-flagged events, but the daily flow data shows WEETH outflows were actually larger pre-unpause than post-unpause on Aave V3. The procedural timeline didn't gate the exit at the WEETH level; the LRT contraction was continuous throughout the month.

2. **Capital rotated within the sector, it did not leave.** Spark gained $751M, Morpho gained $759M. Aave V3 at nominal prices lost $1.96B of supply, but at constant prices the protocol gained $352M of supply — the nominal loss was almost entirely a price-decline artifact on LRT and ETH-family collateral. The rotation story holds; the "Aave V3 collapsed" framing does not, once you separate price effect from flow effect.

3. **The Real Yield Spread turned positive.** From −26 bps at April close to +154 bps at May close. The first positive reading in months. The driver this month is the same one that pushed it from −127 bps to −26 bps in April: stable APYs lifting because of borrow-side pressure, not T-bill yields falling. Aave V3 USDC at 97.6% utilization and 9.62% supply APY is the loudest version of that, and USDC's cross-protocol dispersion remains 33% above its 12-month baseline as a result.

4. **One curator named, two protocols moved.** May's biggest structural finding is a curator-level story rather than a protocol-level one. Sentora — Morpho's #1 curator at 38.6% share — simultaneously pulled $128M out of four Euler vaults and pushed $94M into their own Morpho vaults during the same 30 days. The 73% coverage ratio between the two flows means Euler's May contraction and Morpho's HHI deepening have a shared mechanism: a single curator restructuring their cross-protocol footprint. This is not "two unrelated curator stories on two different protocols." It's one operator's decision visible on both sides.

5. **Coverage expanded to six protocols.** Compound and Euler enter the report. Compound contributes ~$1.61B of Ethereum supply at 33.3% utilization, with Comet's one-base-many-collateral structure. Euler contributes ~$539M at 71% utilization, with its modular EVK vault topology. Both are smaller than Fluid in supply but together add ~$2.15B to sector total, which is non-trivial against a $33B sector.

6. **Risk in focus.** _[Erratum 2026-06-08 — outline originally framed a high idle ratio (bare unverified value) as the structural Morpho story. The verified May 31 reading is ~10 percent (see content/snapshots/2026-05-morpho-idle-ratio.json), which is at typical Morpho operating levels. The structural Morpho risk reading shifted to the curator concentration story: HHI 3,103, top three at 93.9 percent.]_ Curator concentration: HHI 3,103 deepening, top three curators on 93.9 percent of curated TVL — the inflow concentrated at a layer that was already past the antitrust threshold for the third consecutive month.

### §03 Macro Context (Real Yield Spread)

**Lead:** "The spread closed past parity for the first time in 2026."

Paragraphs:

1. **Where the number sits.** +154 bps May 31 vs −26 bps April 30. First positive print since [DATE — need historical RYS time series to confirm "first since"]. The mechanical decomposition: stable APY at _stable APY May_ vs T-bill at _T-bill May_; vs April's 3.34% / 3.60%.

> **DATA NEEDED — RYS components for Apr 30 and May 31.** Stable APY (blended across 6 protocols) and T-bill yield (FRED TB4WK). Should fall out of the `eom-report:may` script section 5 output.

2. **What drove the move.** Same engine as April, just running harder. The stable side lifted faster than T-bills changed. The lifting itself is the Aave V3 USDC borrow squeeze plus the slow grind of utilization across the sector ticking up while supply contracts.

3. **Cross-protocol dispersion update.** April's number was 833 bps on USDC against a 232 bps 12-month average — over 3.5× baseline. May's reading has eased materially but USDC remains the loud asset:

| Asset | May 31 dispersion | 12-month avg | Ratio |
|---|---|---|---|
| **USDC** | **330.5 bps** | 249.3 bps | **1.33×** (above baseline) |
| USDT | 161.7 bps | 186.2 bps | 0.87× (below baseline) |
| WETH | 35.2 bps | 134.7 bps | 0.26× (well below baseline) |

USDC dispersion fell from April's 833 bps to May's 330.5 bps but is still 33% above its 12-month average — Fluid at 5.93% leads, Euler V2 at 2.62% trails, a 331 bps spread. USDT and WETH have actually converged below baseline, which is the more typical post-stress signature. The persistence of USDC dispersion above baseline is the §03 lead finding: the Aave V3 USDC squeeze pulled USDC supply rates higher than peers and that gap hasn't closed.

Exclusions: Morpho USDT (no matching DefiLlama symbol pool), Morpho and Compound V3 WETH (Morpho has no representative pool; Compound's WETH is collateral inside its USDC-base market). Sources: `content/snapshots/2026-05-rate-dispersion.json`.

> **OPERATIONAL FLAG — `rate_snapshots` Neon table only has 2 days of data (Apr 24-25).** The `snapshot:rates` cron stopped firing in late April. The dispersion script pivoted to DefiLlama Yields `/chart` (same `apyBase` series) and the resulting JSON carries a `pivot_note`. Restarting the rate cron is a housekeeping task — task #13.

4. **What this means for the regime question Issue 001 left open.** Issue 001 closed with: "If the spread continues closing through May without further deleveraging, the system is rebalancing organically. If the spread reopens as capital normalizes back into the system, April was a short squeeze rather than a regime change." May's answer: the spread closed past parity even though deleveraging continued. That's a stronger signal than continued contraction would have been.

### §04 Sector Overview

**Lead:** "Six protocols, $33.06B, the same downward drift since September 2025."

Paragraphs:

1. **The aggregate picture.** Total supply $33.06B, down $1.58B MoM. Active borrows $13.20B, down $1.33B. Available liquidity $19.86B, down $247M. Sector utilization 39.9%, down 2.0pp MoM. The shape is a continuation of contraction, not a stabilization.

2. **Why the contraction shape matters.** Borrows fell $1.33B in absolute terms, supply fell $1.58B. The ratio (borrows fell ~$0.84 for every $1.00 of supply that left) says depositors led the exit and borrowers reluctantly followed. That's a different dynamic from April's deleveraging, where utilization rose because supply led the exit.

3. **Compound and Euler context.** [Short paragraph framing what these protocols are and why they're in coverage now. The Comet architecture explanation for Compound, the EVK modular vault explanation for Euler. Why their numbers will look different from Aave/Spark/Morpho/Fluid.]

4. **Composition shifts.** Collateral mix: WETH 16.1, WSTETH 15.0, WEETH 7.5 = ETH-family 38.6% of collateral (was 61% in April). _Major_ shift: the LRT unwind compressed ETH-family collateral materially. BTC-family (WBTC + CBBTC) at 16.7%, up from earlier. Stable collateral (USDT + USDC) at 22.5%.

> **DATA NEEDED — April 30 collateral mix figures (6-protocol).** For direct MoM comparison.

5. **Borrow mix.** Stablecoin debt share 59.3% (recovered sharply from April's 43.6%). WETH borrow share 31.0%, materially down from April's 41.4%. The LRT unwind paid down WETH debt and replaced it with stablecoin borrowing.

### §05 The Loop Unwinds — Reframed by the Daily Data

**Major thesis change after Prompt 7.** The original §05 was built around two claims: (1) Aave V3 lost massive supply in May, (2) the loss was driven by LRT loops finally exiting post-May-14. The daily flow data (`content/snapshots/2026-05-aave-daily-flows.csv`) refutes both claims at the level they were stated. The real story is more interesting and the section needs to be rewritten around it.

**The corrected facts from the daily flow data:**

- **At constant prices, Aave V3 GAINED supply in May — net +$352M.** The "Aave V3 lost $1.96B of supply" headline from the protocol-level backfill is dominated by **price decline on existing LRT and ETH-family collateral**, not depositor exit. Mark-to-market accounting and constant-quantity accounting tell directionally opposite stories on Aave V3 this month.
- **WEETH bled $681M at constant prices over May.** But the bleed was front-loaded: −$459M in May 1-13 (pre-rsETH-unpause) versus −$222M in May 14-31 (post-unpause). The daily WEETH outflow rate was roughly **twice as high before the unpause as after**. The "LRT loops finally got their clean exit on May 14" narrative does not hold at the WEETH level.
- **The biggest post-May-14 daily outflow days were stables-driven, not LRT-driven.** Top 3 outflow days: May 18 (−$139M total, only −$19M WEETH), May 15 (−$130M total, only −$20M WEETH), May 29 (−$104M total, −$0.8M WEETH). The post-unpause spikes are about something other than LRT exits — most likely stable-collateral rebalancing or Aave V3 USDC squeeze migration (the 97.6% utilization / 9.62% supply APY in §03).

**Revised lead:** "Aave V3's headline supply contraction in May was largely a price-decline artifact on its LRT collateral. At constant prices, the protocol gained supply. The LRT exit story is real but it happened before the rsETH unpause, not after — and the post-unpause outflow days that look like LRT exits in the headline number were actually stables-driven."

**Revised paragraph structure:**

1. **Open with the constant-price vs nominal accounting distinction.** This is the framing that resolves the apparent contradiction. The protocol-level supply fell $1.96B but constant-price net deposits rose $352M. Both are true; they're measuring different things.

2. **The WEETH timing finding.** −$459M pre-unpause vs −$222M post-unpause. The depositors who wanted out of WEETH on Aave didn't wait for May 14 — they exited via alternative paths throughout the first half of the month. Worth investigating: was WEETH specifically subject to the rsETH-unpause-relevant freeze, or was it a different asset under a different procedural regime? (WEETH is Ether.fi's eETH wrapper, not rsETH. The two assets share the LRT category but their Aave freeze status in April may have differed materially.)

> **DATA STILL NEEDED — Confirm WEETH-specific Aave V3 freeze status during April.** Did WEETH get frozen the same week rsETH did? Did it have its own LTV-restoration date? If WEETH was never subject to the rsETH procedural freeze, then its continuous May bleed reads as a general LRT-collateral derisking, not a procedurally-delayed exit. If it WAS subject to the same freeze and unfroze earlier than May 14, that's a different story again.

3. **Post-May-14 spikes were not LRT exits.** Walk through May 18 specifically: −$139M total, of which only −$19M was WEETH. The other ~$120M was stables and other collateral. The narrative "LRT loops finally exited post-May-14" doesn't survive this disaggregation. Whatever was happening on May 15, 18, and 29 was a stables rotation — possibly driven by the Aave V3 USDC squeeze (depositors moving to better stable yields elsewhere) or by a broader risk-off in stables on Aave V3 specifically.

4. **The cleaner LRT-unwind story still exists, at the sector level.** Even with the WEETH timing finding, total LRT outflows across the sector were ~$1.17B in May (WEETH $844M, RSETH $221M, EZETH $64M, OSETH $46M, per the Sankey). The LRT contraction is real; the timing argument tied to May 14 is what doesn't hold. The story to tell is "LRT collateral continued to drain throughout the month, with no procedural inflection point obvious in the daily data."

5. **Where the capital went (mostly unchanged from original).** Spark (+$751M), Morpho (+$759M), BTC-family (~$818M). What's new is the framing: the capital wasn't released by the May 14 unpause; depositors had been rotating throughout May and the unpause was an accelerant rather than a trigger.

6. **The honest editorial close.** Issue 002 was supposed to argue "the loops finally unwound when the procedural freeze lifted." The data says "the loops were already unwinding by the time the procedural freeze lifted, and the daily outflow spikes that came after were about something else." That's the more rigorous finding, and it earns the section's title rather than weakens it.

> **DATA NEEDED — Per-asset daily breakdown for the May 18 spike on Aave V3.** Was it USDC? USDT? WSTETH? The CSV has WEETH separately but the rest is aggregate. A per-asset cut of the top 3 outflow days would let us name the specific assets driving the post-unpause spikes and would let §05 close cleanly.

### §06 Protocol Deep Dives

One subsection per protocol. Length proportional to size and to story relevance.

**§06.1 Aave V3** (longest — still the dominant protocol, now significantly reframed by the daily flow data)

Themes: 71% off the Sep 2025 peak; the USDC borrow squeeze (97.6% util, 9.62% supply APY); the constant-price vs nominal supply story (§05 anchors this; §06.1 reinforces); the Aave V3 Core / Prime / Horizon market structure and the clean WEETH finding.

**Settled finding — WEETH market concentration.** DefiLlama confirms only one WEETH pool exists on Aave V3 Ethereum, in **Core** (`poolMeta = None`). Prime and Horizon do not list WEETH. ≥95% of WEETH supply in one market at both Apr 30 and May 31 endpoints (printed in JSON).

| Aave V3 market | Apr 30 WEETH | May 31 WEETH | Δ |
|---|---|---|---|
| Core | $3.17B | $2.11B | **−$1.06B (−33.4%)** |
| Prime | not listed | not listed | — |
| Horizon | not listed | not listed | — |

The "all of it sat in Core" outcome makes the per-market story trivially clean. Source: `content/snapshots/2026-05-aave-weeth-by-market.json`.

(Note: the $1.06B WEETH decline at nominal prices is materially larger than the $681M WEETH decline at constant prices captured in §05's daily data. The ~$380M gap is the WEETH price-decline component — the same accounting wedge that explains why protocol-level nominal supply fell $1.96B while constant-price net deposits rose $352M.)

**§06.2 Spark** (second-longest — the migration story continues)

Themes: another +$600M card / +$751M Sankey month of inflow; WSTETH supply trajectory; the Sky / MakerDAO institutional positioning; how Spark's interest rate model (SPK Farming Pool, USDS) shapes the deposit profile.

**§06.3 Morpho** (anchor section for the HHI angle — but the HHI gets its own §07, so keep this focused on protocol-level data)

Themes: +$759M inflow into a curator layer already past the antitrust threshold (HHI 3,103, top three at 93.9 percent); 510 markets; the Morpho-Blue architecture story. Hand off to §07 for the curator concentration analysis. _[Erratum 2026-06-08 — outline originally flagged the idle ratio (bare value, no derivation trail) as the structural surface. Verified May 31 reading ~10 percent supersedes; thesis dropped. See content/snapshots/2026-05-morpho-idle-ratio.json.]_

**§06.4 Fluid** (short — Fluid's story is consistent across months)

Themes: 63% off the Aug 2025 peak (steepest decline of all six); 55% utilization (highest of the six excluding Euler); the liquidation engine identity still holds — flag the May liquidation efficiency figure once pulled.

**§06.5 Compound** (new — introductory framing)

Themes: $1.61B Ethereum supply (Comet architecture means base assets pooled across borrowers, collateral does not earn interest); net -$32M in May; the Comet market breakdown by base asset; what the dashboard's $8.34B detail page represents (multi-chain rollup vs Ethereum-only card).

> **DATA NEEDED — Compound V3 by Comet market for May (USDC, USDT, ETH, USDS bases).** This is the natural cut for a Compound section. DefiLlama exposes Comet markets individually.

**§06.6 Euler** (the surprise of the issue — now fully resolved as a Sentora reallocation story)

> Full source brief at `content/snapshots/SOURCE_BRIEF_section_06_6.md` (15 sections, 15.7 KB, confirmed location). The summary below is the outline-level version; the section prose pulls from the source brief.

**The headline finding:** Euler V2's May outflow was not a depositor revolt. It was one operator reallocating across protocols. Sentora — the on-chain operator behind ePYUSD-6, eRLUSD-7, eUSDC-80, and eUSDC-70 on Euler — simultaneously expanded their MetaMorpho footprint by $93.94M in the same window. Approximately 73% of the Sentora-attributable Euler outflow reappears as a Sentora-curated Morpho inflow inside the same 30 days. The move was structural, not panic-driven: a third Sentora Morpho vault ("Sentora PYUSD Core") was drained to literal dust ($165 in dollars, not millions) while the primary Sentora PYUSD and Sentora RLUSD vaults absorbed the new capital.

**Three headline numbers, all defensible:**

| Quantity | Value | Source |
|---|---|---|
| Sentora-attributable Euler outflow (May 1 → May 31) | **−$128.39M** | DefiLlama Yields `/chart` per-vault TVL |
| Sentora Morpho net change, same window | **+$93.94M** | Morpho blue-api `historicalState.totalAssetsUsd` |
| Reallocation coverage ratio | **73.2%** | Arithmetic |

The $34M residual is unaccounted at the curator layer. Three checks ran clean to rule out the obvious alternatives: no Sentora label variants on Morpho, Sentora multisig holdings empty on May 1 and May 31 across all relevant stables and lending receipts, no direct Sentora LP positions on other protocols. Conclusion: distributed LP decisions downstream of the Sentora vault withdrawals.

Apr 30 → May 31, all figures Ethereum-only:

| Metric | Apr 30 | May 31 | MoM |
|---|---|---|---|
| Total supply | $896.3M | $549.4M | **−38.7%** |
| Total borrows | $572.4M | $396.2M | **−30.8%** |
| Available liquidity | $324.0M | $153.2M | **−52.7%** |
| Utilization | 64% | 71% | +7pp |
| Net deposit flow (Sankey) | — | −$338.5M | — |

(Note: figures above are the refined values from Claude Code's source brief — slightly different from the dashboard freeze JSON because the source brief used DefiLlama datapoints with cleaner timestamping. Both are within ~$10M of each other; cite the source brief versions in the writeup since they're date-anchored to May 1 and May 31 explicitly.)

The supply contraction of $347M is the wider protocol number. Of that, **$128.39M is cleanly attributable to Sentora** at the vault level. The remainder is borrow runoff (positions unwinding as utilization caps trigger repayments when LP capital exits) plus 11 mid-month-created Euler vaults that weren't in the May 1 baseline. Use $128M as the headline figure, $347M as the wider context with a footnote on borrow runoff.

**The vault-level story.** Of Euler's $130M attributable outflow, four vaults — all USD-denominated, all governed by the Sentora multisig at `0x9453ee…5685` — accounted for $128.39M:

| Vault | May 1 TVL | May 31 TVL | Δ |
|---|---|---|---|
| EVK Vault ePYUSD-6 | $63.12M | $10.31M | **−$52.80M** (−83.7%) |
| EVK Vault eRLUSD-7 | $43.78M | $11.09M | **−$32.68M** (−74.7%) |
| EVK Vault eUSDC-80 | $37.93M | $13.55M | **−$24.38M** (−64.3%) |
| EVK Vault eUSDC-70 | $28.06M | $9.55M | **−$18.52M** (−66.0%) |
| **Sentora total** | $172.89M | $44.50M | **−$128.39M (−74.3%)** |

K3 Capital ran every material inflow vault on Euler in May (ewstETH-2, eWBTC-3, eWETH-2, eUSDC-22, eUSDe-6) and lost no material capital. The split is one-to-one with curator identity. Not a single Sentora vault grew; not a single K3 Capital vault bled materially.

**Why yield-chasing is ruled out.** Sentora's bleeders softened APYs only 0.6 to 1.1 percentage points across May. K3 Capital's eWETH-2 (an inflow vault under the other operator) collapsed from 4.32% to 1.34% — a 2.98-percentage-point drop, more than triple the bleeders — and still attracted capital. eUSDC-22 dropped 1.76 percentage points and still attracted capital. The data does the opposite of what yield-chasing would predict.

**The mechanism: cross-protocol reallocation under the same curator.** Sentora simultaneously restructured their MetaMorpho footprint. Across May 1 → May 31:

| Sentora Morpho vault | May 1 TVL | May 31 TVL | Δ |
|---|---|---|---|
| Sentora RLUSD | $132.09M | $209.65M | **+$77.56M (+58.7%)** |
| Sentora PYUSD | $230.16M | $296.70M | **+$66.54M (+28.9%)** |
| Sentora PYUSD Core | $50.16M | ~$165 (literal) | **−$50.16M (−100%)** |
| **Sentora Morpho total** | $412.41M | $506.35M | **+$93.94M** |

Sentora pulled $128M of Euler shape and pushed $94M of Morpho shape, with one Morpho vault deprecated to dust while two others absorbed the new capital. 73% coverage ratio between the two protocols. The remaining $34M is downstream LP behavior the curator-level view can't see; three verification checks (label variants, multisig holdings, direct LP positions) ran clean.

**This reframes the §07 thematic link.** Sentora is not merely a static occupant of Morpho's top-3 curator chair. They are the curator that moved the most in May, and the movement spans protocols. Their Morpho TVL grew partly because of their own Euler-to-Morpho redeployment. The Morpho HHI deepening in May has an endogenous component: Sentora's own decision contributed to their own share gain. The same name, two protocols, opposite flow direction, one decision. That is the curator-concentration story Issue 002 actually has.

> **DATA STILL HELPFUL — Liquidations on Euler over May (in the §08 risk indicators data pull).** The Sentora story is the main mechanism but doesn't fully explain the $190M of borrow contraction. If liquidations on Euler were unusual in May, that adds context. If they were quiet, the borrow contraction traces back to the same Sentora redeployment forcing borrowers to repay.

### §07 Curator Concentration as a Cross-Protocol Phenomenon

**Reframed.** §06.6 closes with the Sentora reallocation finding. §07 picks it up and broadens it. The argument is no longer "curators are concentrated and that's a risk." It is: **the same curators operate across multiple lending protocols, and their decisions move capital between protocols in ways no single-protocol metric can see.** Morpho's HHI captures one slice of one protocol. Sentora's May reallocation moved across two.

**Lead:** "Morpho's curator HHI deepened again in May. So did the assumption that what HHI measures is the only thing that matters."

Paragraphs:

1. **The Morpho reading on its own terms.** HHI 3,103 at May 31, up from 3,026 at April 30, up from 2,700 at March 31. Trajectory has held one direction for three months. Composition: Sentora 38.6%, Steakhouse Financial 34.1%, Gauntlet 21.2%, combined 93.9%. Top-3 share dipped slightly from April's 94.4%; HHI still rose. The textbook illustration of why HHI catches what share alone misses. (Confirmed via `content/snapshots/2026-05-31-curator-hhi.json`.)

2. **The endogeneity wrinkle.** Sentora's Morpho TVL grew by $93.94M during May, in part because Sentora itself moved capital from their Euler vaults into their own Morpho vaults. The HHI deepening this month was not just "depositors continue gravitating to the largest curators" — it was "the largest curator moved capital onto their own pile." That's mechanistically related but interpretively different.

3. **The trajectory continued into early June.** Four days past the May 31 freeze, the snapshot script's first programmatic run captured HHI **3,290.60** at June 4, up from 3,103 at May 31. That's a +187-point jump in four days. Sentora's share grew from 38.6% to **41.3%** (+2.7 percentage points); Steakhouse from 34.1% to 34.8%; Gauntlet softened from 21.2% to 19.0%. Top-3 share rose from 93.9% to 95.2%. This is consistent with the Sentora reallocation continuing past May — capital is still moving toward Sentora's Morpho vaults at the early-June reading. The next monthly HHI snapshot (June 30) will be the first reading where we can ask whether this is a multi-month structural deepening or whether it stabilizes. (Source: `content/snapshots/2026-06-04-curator-hhi.json`.)

3. **What HHI methodologically captures and misses.** Brief callout — defer the deep methodology to §00 conventions. The point worth landing here: HHI on Morpho captures static concentration within Morpho. It does not capture cross-protocol curator footprints (Sentora also runs Euler, Spark, etc.) and it does not capture the rate-of-change of capital under a single curator's discretion.

4. **The structural risk.** Three things this section names that the HHI alone doesn't:
   - **Correlated exposure within Morpho.** The top three vaults share collateral and oracle dependencies; one oracle break in a shared market could trigger drawdowns across 94% of curated TVL in a single block. The risk Issue 001 named, unchanged.
   - **Cross-protocol curator concentration.** Sentora is Morpho's #1 curator AND the operator behind Euler's bleed AND has positions on Spark and Aave V3 to verify. The on-chain curator economy is more concentrated than any per-protocol HHI suggests, because the same operator names appear across multiple protocols' top-curator slots.
   - **Curator agency at scale.** May demonstrated that one curator decision can move $128M out of one protocol and $94M into another in a single month, with no flagged event, no oracle failure, no governance vote, no liquidation cascade. Just operating choice. The implicit model of curators as passive aggregators is what May contradicts.

5. **The Euler complement.** §06.6 has the full Sentora story. §07 anchors the cross-protocol framing here: where Morpho's curator concentration sits as a slow-moving structural reading, Euler in May showed the dynamic version of the same operator's behavior. Both readings belong to the same picture, not two separate concerns.

6. **The "standard but worse" angle.** Acknowledge the X reply about retail being gone and B2B private deals dodging higher concentration metrics. On-chain HHI captures only the curated public layer of one protocol at a time. Cross-protocol curator footprints sit one layer above the HHI metric and are even more concentrated. Institutional credit allocation, off-chain B2B deal flow, and the multi-protocol curator economy together make the "real" concentration meaningfully higher than the on-chain HHI suggests. May's Sentora finding is the first dataset that lets us name a number in that broader picture.

### §08 Risk Indicators (Beyond the Cheat Sheet)

A consolidated risk dashboard for May. Most data points are flagged elsewhere in the report; this section gathers them for the reader who jumps straight to risk.

- **Oracle concentration.** _DATA NEEDED._
- **Liquidations 90D by protocol (Mar 3 → May 31).** Now in `content/snapshots/2026-05-liquidations-90d.json`. Per-protocol effective penalty: **Spark 4.87%, Morpho 24.10%, Fluid 1.68%**. Aave V3 came back at an implausible 261.33% aggregate ($188M collateral against $52M debt across 911 events), almost certainly an event-recording artifact in the liquidator-economy DB (one or two rows where `collateral_amount_usd` was recorded as the full position value rather than the seized portion). Two options for the writeup:
   - **Recommended:** cite Spark / Morpho / Fluid figures only, footnote Aave as "skewed by event-recording artifacts in the liquidator-economy DB; under investigation."
   - **Alternative:** use median per-event penalty across all four protocols and footnote the dollar-weighted aggregate.
   - **Note:** Compound V3 and Euler V2 are not yet ingested by `liquidator_db` — both protocols show zeros and a `not_ingested: true` flag in the JSON. For Issue 002 they belong in the table as "not yet covered" rather than "zero liquidations." This is a backlog item worth surfacing in the appendix; for Euler in particular, the liquidations question matters for §06.6's borrow-runoff explanation.
- **Stablecoin debt share trajectory.** 43.6% (Apr) → 59.3% (May). Material rebound, driven by LRT loops repaying WETH and rotating into stables.
- **Morpho idle ratio.** _[Erratum 2026-06-08 — original outline pinned a bare unverified value here; verified May 31 reading is ~10 percent (see 2026-05-morpho-idle-ratio.json). Thesis dropped from Issue 002. Morpho structural risk in §08 is the curator concentration reading.]_
- **Aave V3 USDC borrow squeeze.** Flagged in §01 and §03.
- **LRT collateral remaining across protocols.** _DATA NEEDED — how much WEETH / RSETH / EZETH / OSETH still on-protocol at May 31._

### §09 What to Watch in June

Five forward-looking questions, each anchored in a metric from the report:

1. Does the Real Yield Spread hold positive? If yes, May is the regime change. If no, May was a short squeeze.
2. Does Aave V3 USDC utilization unwind from 97.6%, or does the squeeze persist? The supply APY at 9.62% should pull capital in eventually.
3. Does Morpho HHI break 3,200 or settle? The trajectory has been monotonic for three months.
4. Does Euler stabilize or continue bleeding? -$338M in May is large for a $539M protocol.
5. Does the BTC-collateral rotation continue? ~$818M inflows in May. If it persists into June, the LRT-to-BTC thesis shift becomes a structural feature.

---

## Data needs consolidated

This is the punch list for the writeup. Some come from the live pipeline you'll run tonight; some need separate pulls.

### From the `eom-report:may` script run

- Apr vs May Ethereum-only fees (gross) per protocol.
- Apr vs May `dailyUserFees` per protocol (or fallback to `dailyFees`).
- Fee decomposition (supply-side / protocol / holders) for both months.
- Sector take rate at Apr 30 and May 31.
- Real Yield Spread at Apr 30 and May 31 with stable APY and T-bill components.

### From Neon (`sector_snapshots`, `rate_snapshots`, `liquidator_db`)

Each of these maps to a Claude Code prompt below.

- ~~Six-protocol baselines at Apr 30 (total supply, borrows, available liquidity by protocol).~~ ✅ Done — see `content/snapshots/2026-04-30-baseline.json` (schema v2). Compound and Euler backfilled via DefiLlama; original 4 from Neon. Methodology gap of ~$370M between Neon-implied and DefiLlama-reconstructed sector totals, both directions agree.
- ~~Cross-protocol supply APY dispersion at May 31 (USDC, USDT, WETH).~~ ✅ Done — see `content/snapshots/2026-05-rate-dispersion.json`. USDC 330.5 bps (1.33× baseline), USDT 161.7 bps (0.87×), WETH 35.2 bps (0.26×). Pivoted from `rate_snapshots` (cron gap) to DefiLlama Yields `/chart` — flagged for cron repair.
- ~~Aave V3 by market (Core / Prime / Lido) supply for WEETH at Apr 30 and May 31.~~ ✅ Done — see `content/snapshots/2026-05-aave-weeth-by-market.json`. All WEETH sat in Core. −$1.06B (−33.4%) at nominal prices. Gap vs constant-price decline ($681M) is price effect.
- Liquidations 90D by protocol (counts, $ liquidated, effective penalty, intensity %).
- Oracle concentration roll-up at May 31.
- Compound V3 by Comet market at May 31 (USDC, USDT, ETH, USDS bases).
- ~~Top 5 Euler vaults by May TVL change.~~ ✅ Done — see `content/snapshots/2026-05-euler-vault-flows.json`. Four Sentora vaults account for $128.39M of $130M attributable outflow.
- ~~Euler vault APY trajectories (May 1 / 15 / 31).~~ ✅ Done — see `content/snapshots/2026-05-euler-vault-apys.json`. Rules out yield-chasing as the driver.
- ~~Euler vault governors / operator concentration.~~ ✅ Done — see `content/snapshots/2026-05-euler-vault-curators.json`. Governor `0x9453ee…5685` identified as Sentora via Euler app's Risk Manager badge. Inflow vaults all run by K3 Capital.
- ~~Sentora cross-protocol reallocation (Euler → Morpho).~~ ✅ Done — see `content/snapshots/2026-05-sentora-cross-protocol.json`. Sentora's Morpho TVL grew $93.94M in same window; 73% coverage of Euler outflow.
- ~~Sentora label variant sweep on Morpho.~~ ✅ Done — see `content/snapshots/2026-05-sentora-morpho-variants.json`. No sub-labels or rebrands inside the window. Strict "Sentora" set is the full set.
- ~~Sentora multisig holdings check.~~ ✅ Done — see `content/snapshots/2026-05-sentora-multisig-holdings.json`. All balances zero at both May 1 and May 31 block heights. Rules out treasury-idle and direct-LP explanations.
- ~~Morpho curator HHI fresh pull (May 31 confirmed + persistent script).~~ ✅ Done — see `content/snapshots/2026-05-31-curator-hhi.json` (manual pre-freeze: HHI 3,103) and `content/snapshots/2026-06-04-curator-hhi.json` (first programmatic run: HHI 3,290.60). Persistent script wired as `npm run snapshot:curator-hhi`; backing Neon table `morpho_curator_hhi_history` created. Cron wiring documented but manual.
- ~~Liquidations 90D by protocol.~~ ✅ Done — see `content/snapshots/2026-05-liquidations-90d.json`. Spark / Morpho / Fluid penalties in-range; Aave V3 flagged as artifact-skewed; Compound and Euler not yet ingested.
- ~~Daily Aave V3 net supply flow series for May (to confirm post-May-14 clustering).~~ ✅ Done — see `content/snapshots/2026-05-aave-daily-flows.csv`. Result **disproved the post-May-14 clustering thesis at the WEETH level** (WEETH outflow was front-loaded pre-unpause). Forced major restructure of §05 (see revised section above). Constant-price net flow on Aave V3 was +$352M for the month; nominal supply decline was a price-effect artifact.
- LRT collateral by asset across all 6 protocols at Apr 30 and May 31 (WEETH, RSETH, EZETH, OSETH).

### From Morpho GraphQL

- May 31 curator HHI confirmed reading.

### From DefiLlama / FRED (handled by eom-report:may but worth verifying)

- April 30 collateral mix (six-protocol).
- Historical RYS time series — confirm whether May 31 is the first positive print of 2026.

---

## Claude Code prompts (run in a separate Claude Code session)

Each block below is a self-contained prompt. Paste one at a time into a Claude Code session pointed at `lending-intelligence-terminal/`.

### Prompt 1 — Six-protocol Apr 30 baseline

```
I need the six-protocol baseline reading for April 30, 2026 from the sector_snapshots table in Neon.

Write a one-shot script at scripts/query-apr30-baseline.ts that:
1. Connects to Neon via DATABASE_URL.
2. Queries sector_snapshots for the row closest to 2026-04-30 23:59 UTC.
3. Prints the payload's per-protocol supply, borrows, available liquidity for all 6 protocols (aave-v3, spark, morpho-blue, fluid, compound-v3, euler-v2).
4. Also prints the sector aggregate: total supply, active borrows, available liquidity, sector utilization, RYS, sector take rate.

Format as a JSON object and write to content/snapshots/2026-04-30-baseline.json so I can reference it directly in the writeup.

Use the existing lib/db.ts sql client.
```

### Prompt 2 — Liquidations 90D by protocol

```
I need a 90-day liquidations snapshot for all 6 protocols at May 31, 2026.

Write a one-shot script at scripts/query-liquidations-may.ts that:
1. Connects to the liquidator_db (use LIQUIDATOR_DATABASE_URL or the same DATABASE_URL — check lib/liquidator-db.ts for the actual env var).
2. Queries the liquidation_events table for events between 2026-03-03 and 2026-05-31 (inclusive) across all 6 protocol slugs in lib/protocols.ts (aave_v3, spark, morpho_blue, fluid, compound_v3, euler_v2 — note the underscore convention).
3. Aggregates by protocol: count of liquidations, $ collateral seized, $ debt repaid, average effective penalty %, liquidations as % of protocol TVL (intensity).
4. Writes the result to content/snapshots/2026-05-liquidations-90d.json.

If a protocol slug returns zero rows, include it in the output with all zeros — don't omit it. We need the complete picture even where Compound or Euler aren't yet ingested.
```

### Prompt 3 — Morpho curator HHI fresh pull

```
Write scripts/snapshot-curator-hhi.ts that:
1. Hits the Morpho blue-api.morpho.org GraphQL endpoint (see scripts/check-upstream.ts for the query shape — vaults() with state.curators).
2. Pulls the top 50 Ethereum vaults by TotalAssetsUsd.
3. Aggregates by primary curator name (use the first curator in state.curators[]).
4. Computes:
   - Curated TVL (sum of vaults with non-empty curator names).
   - Per-curator TVL share.
   - HHI = sum of squared per-curator share percentages.
   - Top 3 share.
5. Writes the result to content/snapshots/2026-05-31-curator-hhi.json with the timestamp, curated TVL, per-curator breakdown, HHI, and top 3 share.

Also include this as a recurring command in package.json as "snapshot:curator-hhi" so it can be run monthly going forward.
```

### Prompt 4 — Aave V3 by market for WEETH

```
I need the WEETH supply breakdown across Aave V3's three Ethereum markets (Core, Prime, Lido) at both Apr 30 and May 31, 2026.

The dashboard fetches this via DefiLlama's /protocol/aave-v3 endpoint or via on-chain reads (see lib/aave-onchain.ts). Write scripts/query-aave-weeth-by-market.ts that:
1. Pulls WEETH supplied USD per market for Apr 30 and May 31.
2. Computes the per-market change.
3. Writes to content/snapshots/2026-05-aave-weeth-by-market.json.

If on-chain reads are needed, use the ETH_RPC_URL from .env. Otherwise the DefiLlama path is fine — confirm that DefiLlama exposes the market split as separate slugs (aave-v3 core/prime/lido) before assuming.
```

### Prompt 5 — Cross-protocol rate dispersion at May 31

```
I need cross-protocol supply APY dispersion at May 31, 2026 for USDC, USDT, and WETH across all 6 protocols.

Write scripts/query-rate-dispersion-may.ts that:
1. Reads from rate_snapshots Neon table.
2. For each of USDC, USDT, WETH at May 31 (or closest reading): pulls supply APY across all 6 protocols.
3. Computes max, min, dispersion (max minus min) in basis points.
4. Compares each to the trailing 12-month average dispersion for that asset.
5. Writes to content/snapshots/2026-05-rate-dispersion.json.
```

### Prompt 6 — LRT collateral by asset across protocols

```
I need a snapshot of LRT collateral (WEETH, RSETH, EZETH, OSETH) supplied across all 6 protocols at Apr 30 and May 31.

Write scripts/query-lrt-collateral.ts that:
1. For each protocol in lib/protocols.ts, queries DefiLlama's /protocol/<slug> endpoint and pulls Ethereum-side supply for WEETH, RSETH, EZETH, OSETH at Apr 30 and May 31.
2. Aggregates to total LRT collateral by asset across the sector.
3. Computes MoM change per asset and per protocol.
4. Writes to content/snapshots/2026-05-lrt-collateral.json.

The dashboard's lib/assets.ts has the casing conventions for LRT tickers; use that as the source of truth.
```

### Prompt 7 — Daily Aave V3 net supply flow for May

```
I need the daily net supply flow for Aave V3 across May 2026 to test whether outflows concentrated after May 14 (rsETH unpause) and May 17 (WETH LTV restoration).

Write scripts/query-aave-may-daily-flows.ts that:
1. Reads from whatever Neon table backs the Sankey / net-flow chart on the dashboard (likely net_flows_daily — check lib/net-flows-sankey.ts).
2. For each day in May 2026, gives the Aave V3 net deposit change in USD (constant prices, no price moves).
3. Writes a CSV to content/snapshots/2026-05-aave-daily-flows.csv with columns: date_utc, net_supply_change_usd.

Output a one-line summary at the end: "Top 3 outflow days in May: <date> $<amount>M, <date> $<amount>M, <date> $<amount>M".
```

### Prompt 8 — Top 5 Euler vaults by May TVL change

```
I need the top 5 EVK vaults on Euler V2 ranked by absolute USD change in supplied TVL across May 2026.

Write scripts/query-euler-vault-flows.ts that:
1. Pulls Euler EVK vault TVL data (check lib/protocols.ts for the DefiLlama slug "euler-v2" and confirm the data shape).
2. For each vault on Ethereum, compares May 1 to May 31 total supplied.
3. Ranks by absolute change in USD.
4. Writes the top 5 (gainers and losers separately) to content/snapshots/2026-05-euler-vault-flows.json.

We're trying to identify which specific Euler vaults bled the $338M of net outflow in May.
```

### Prompt 9 — Compound V3 by Comet market

```
I need Compound V3 broken out by Comet market (USDC, USDT, ETH, USDS bases) on Ethereum at May 31, 2026.

Write scripts/query-compound-comet-markets.ts that:
1. Pulls Compound V3 Ethereum data from DefiLlama's /protocol/compound-v3 endpoint.
2. Separates by base asset market (each Comet market has one borrowable base).
3. For each market: total supply, total borrows, utilization, supply APY, borrow APY.
4. Writes to content/snapshots/2026-05-compound-comet-markets.json.

Confirm the $1.61B Ethereum-only card value reconciles against the sum of Comet markets.
```

---

## Screenshot requests

Where Claude Code can't easily get the picture, or where the dashboard view is the cleanest record:

1. **Sankey on Weekly toggle** for the last week of May (May 25–31). Useful to confirm whether the LRT outflow finished or was still trickling at month-end.
2. **Sankey on Quarterly toggle** (Mar–May). Useful to put the May rotation in the broader context.
3. **Oracle concentration panel** on the dashboard at May 31. The exact shares for Chainlink / Redstone / other.
4. **Liquidations 90D panel** on the dashboard, showing per-protocol intensity and effective penalty.
5. **Morpho HHI / curator concentration panel** as it stands at end-of-day May 31 (confirmation of 3,103).
6. **Aave V3 detail page** with the market-level breakdown if the dashboard exposes one for Core / Prime / Lido.
7. **Real Yield Spread chart** showing the multi-month trajectory, ideally 18 months back, to anchor the "first positive print since X" claim in §03.
8. **Cross-protocol supply APY dispersion chart** for USDC over the past 3 months, to compare May's dispersion against April's spike.

---

## Open editorial questions

These are the choices I'd want answered before drafting the body:

- **Title:** confirm "The Loop Unwinds" or pick from the alternatives.
- **HHI in cheat sheet:** confirm graduating it to §01.
- **Compound and Euler framing:** keep as new entrants in §02 paragraph or give them a dedicated half-section?
- **§05 length:** the LRT unwind story is the centerpiece. Should it stay one section or split into "Timeline" and "Where The Capital Went"?
- **§07 framing:** standalone curator-concentration deep dive, or fold back into §06.3 Morpho? My recommendation: standalone. It's been your highest-engagement angle on the personal account.
- **Bad debt incidents.** Issue 001 referenced ongoing rsETH bad debt question. Has anything changed structurally in May worth flagging? content/bad-debt-incidents.json is in the repo — worth a look.
