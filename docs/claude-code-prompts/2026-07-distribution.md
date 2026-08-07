# Claude Code hand-off — Issue 004 distribution

Full distribution stack: the X/LinkedIn article that stands on its own without requiring readers to open the full report, the LinkedIn mini-post that hooks the article, and two separate Twitter thread sets (one for the Datum Labs account, one for Joel's personal account).

Paste the block below into a fresh Claude Code session at the repo root.

---

You are working in the lending-intelligence-terminal repo. Four distribution artifacts for Issue 004. All docx output, following the Issue 003 distribution pattern.

**Live report URL:** confirm the exact URL for the July 2026 report on the DatumLabs resources page. Grep for `state-of-lending-ethereum-june-2026` and swap `june-2026` → `july-2026` in the resulting URL. Report the confirmed URL back before drafting the artifacts.

**Context files to read first:**

1. `content/reports/2026-07-july.mdx` — the published July report; source content for everything
2. `content/reports/distribution/Issue_003_*.docx` — the Issue 003 distribution artifacts; use as structural templates (voice, length, format)
3. Prior Issue 003 build scripts under `outputs/build_issue_003_*.js` (if still present) — reference for docx generation pattern

## Voice rules — read carefully before writing anything

### Mechanism facts (verified — do not contradict)

- SparkLend's 5 Sky-linked reserves (DAI, USDC, USDT, USDS, PYUSD) use utilization-curve IRMs (RateTargetBaseInterestRateStrategy) whose base rate parameter is Sky-anchored, not fixed at listing. They respond to both pool utilization and Sky Base Rate moves.
- Sky Base Rate stepped 3.90% → 3.72% on 2026-07-23 at 14:43:23 UTC (verified on-chain, block 25596101).
- Per-reserve July 23 step sizes: DAI 18 bps, USDS 18 bps, USDC 14 bps, PYUSD 8 bps, USDT 49 bps (USDT stacked a utilization drop from 93.0% to 83.6%).
- SparkLend USDC markup over the Sky Base Rate: 0.52 pp on July 22, 0.56 pp on July 23 (widened, not narrowed).
- Fluid's USDC spread over the T-bill at the July close: +106 bps above (not −107 below); Fluid stayed the only covered venue above the T-bill on USDC.
- Aave V3's inflow composition is role-based (supply-to-borrow-against vs supply-to-earn-rate), with sUSDe as the edge case: a stablecoin by asset class, collateral by Aave role.

Joel rejected the first pass of the Issue 003 clip pack for AI-slop patterns. These specific patterns must be absent from every artifact:

**Forbidden patterns:**

- No em dashes anywhere (use commas, colons, parentheses, or sentence splits instead)
- No "not just X, it's Y" or any variant
- No "That's X, not Y" declarations
- No ALL CAPS emphasis words like "ADDED" or "MOVED"
- No "on paper... but when I broke down..." reveal setups
- No "Here's the strongest signal" hooks
- No "That tells us something important" AI wraps
- No "It's not X, but Y" openings
- No "In today's DeFi landscape" or any "In today's..." framing
- No "cornerstone", "leverage" (as verb), "unlock" (as verb for insights), "delve", "utilize"
- No hollow superlatives ("massive", "huge", "monumental", "unprecedented") unless the number literally is unprecedented and the number is cited
- No "the elephant in the room"
- No hyphens where an em dash would go (Joel prefers commas, colons, or sentence splits)

**Voice targets:**

- Blockworks-tier analyst voice: declarative, specific, numbers-forward, no rhetorical flourishes
- Use %, bps, pp for units (never "percent", "basis points", "percentage points" spelled out)
- Use $B/$M for values above $1B (never "$1,334M")
- Every claim carries a number or a specific date
- No "we" in the Datum Labs voice (institutional third-person)
- First person allowed in Joel's personal voice, but sparingly and analytically

**Test:** if a sentence would work in a Wall Street Journal markets column, it works. If it reads like a LinkedIn thought-leader post, it does not.

## Part A. X / LinkedIn article (`Issue_004_Article.docx`)

The primary artifact. Reader gets the full content of the July report without needing to open the full report. Not watered down. Same analytical depth, restructured for the article-length surface.

**Length:** 1,200 to 1,500 words.

**Structure:**

1. **Opener (2-3 paragraphs, ~200 words):** the Aave-carried-the-sector hook. Same opening move as §01 of the report: Aave V3 as the only major protocol that grew in July, the +$553M sector total being entirely Aave with a small remainder. Establish the reader hook in the first 100 words. Follow with the halved-growth + climbing-concentration + deepening-real-yield triple thread.

2. **The Aave composition read (~250 words):** why Aave carried the sector. Collateral in, stables flat to negative. weETH +$285M, sUSDe +$145M, WBTC +$124M. USDC drain smaller than June's but same direction. The USDe complex quietly growing while USDC/USDT drain. Second consecutive month of the same pattern.

3. **The Sentora overtaking Steakhouse story (~250 words):** the curator crossover finding. Sentora 27.65% at May 31, overtook Steakhouse at some point in June, closed July at 33.56% as Morpho's largest single curator. Steakhouse held flat over the two months. Gauntlet declined 557 bps. The concentration story underneath the aggregate HHI number.

4. **The SparkLend Sky-anchored rate mechanism (~300 words):** the strongest single analytical finding of the month. Five of eighteen SparkLend reserves (all stablecoins) price their borrow rate off a utilization-curve IRM whose base rate parameter is anchored to a Sky-linked rate source rather than fixed at listing, so the rate responds to both pool utilization and Sky governance. Sky Base Rate stepped from 3.90% to 3.72% at 14:43 UTC on July 23 via the Atlas Edit executive spell; SparkLend's USDC retail rate stepped from 4.42% to 4.28% the same day, with 14 of the 18 bps passing through. This is a Sky-anchored base rate, not the listing-fixed base that Aave, Fluid, Compound, and Euler run, and it matters for how a reader interprets any cross-protocol USDC rate comparison.

5. **The Fluid rate premium narrowing (~200 words):** Fluid was the sector's only positive real-yield spread on USDC at June close (+281 bps over T-bill). At July close it sits at +106 bps above T-bill, still the only covered venue above it. The USDC supply APY fell from 6.41% to 4.66%. Fluid still leads, but by 139 bps over Aave rather than 322 bps. The blended-sector Real Yield Spread deepened to −75 bps.

6. **What August tests (~150 words):** short forward-looking close. Does Aave keep carrying the sector? Does Sentora keep pulling ahead? Does the Sky-linked stablecoin book see another Atlas Edit adjustment? Does Fluid stabilize or continue drifting toward Aave's rate level?

7. **Closer with report link (~50 words):** one-sentence pointer to the full report at the DatumLabs URL. Include the URL as text (LinkedIn's article editor will hyperlink it).

**Voice note for this artifact specifically:** the article stands alone. A reader who never opens the full report should walk away with a complete picture of July 2026's DeFi lending sector. That means claims that would be cross-referenced to §04 in the report need to be self-explaining here. Include the mechanism context inline, do not defer to "as covered in the full report."

## Part B. LinkedIn mini-post (`Issue_004_LinkedIn_MiniPost.docx`)

The short version that LinkedIn asks for after you upload the article (the "Tell your readers what this article is about" prompt). Points readers into the article.

**Length:** 80 to 120 words.

**Structure:** one-punchy-opener, one-analytical-hook, one-CTA sentence pointing to the article.

**Example shape (do not copy verbatim, use as reference):**

> Aave V3 was the only major DeFi lending protocol on Ethereum that grew in July 2026. Its +$649M net constant-price flow carried a sector that would have contracted without it. The other five covered protocols combined for a net −$96M in the same window.
>
> The July 2026 State of DeFi Lending on Ethereum report unpacks four findings from the month: what's driving Aave's growth (not what most people assume), why Sentora just overtook Steakhouse as Morpho's largest curator, how SparkLend's stablecoin rates respond to both pool utilization and Sky governance, and what happened to Fluid's June rate leadership on USDC.
>
> Full report below.

## Part C. Datum Labs Twitter threads (`Issue_004_Datum_Labs_Twitter.docx`)

Institutional voice. Third-person. No "we". Every tweet advances the analysis or adds context. Never just restates the previous tweet.

**Deliverable:** three threads, each 6 to 8 tweets. Plus 4 standalone tweets that can be scheduled independently.

**Thread 1: The Aave-carried-the-sector story.** Anchor tweet with the +$649M number and the without-Aave-contraction framing. Follow-up tweets on the collateral composition (weETH, sUSDe, WBTC), the USDe complex shift, the "collateral in, stables flat" pattern being two months old. Close with the read that Aave's growth mechanism is depositors supplying collateral for borrow capacity, not chasing supply APY.

**Thread 2: The Sentora overtaking Steakhouse story.** Anchor tweet on the crossover, the July 31 numbers (Sentora 33.56%, Steakhouse 31.31%). Follow-up tweets on the May-to-June direct share transfer (Sentora +358 bps, Steakhouse −191 bps in that window), the June-to-July coincident growth from the long tail (Sentora + Steakhouse together +447 bps from the field), Gauntlet's structural decline, why the concentration matters. Include the specific structural difference across curators: Sentora 3 concentrated V2 vaults, Steakhouse 18 mixed vaults, Gauntlet 22 V1-heavy vaults.

**Thread 3: The SparkLend Sky-anchored rate mechanism.** Anchor tweet on the July 23 Atlas Edit event, the −18 bps Sky Base Rate step from 3.90% to 3.72%, the specific transaction hash on-chain. Follow-up tweets naming the five Sky-linked reserves (DAI, USDC, USDT, USDS, PYUSD), the shared Sky rate source contract (0x57027B62, references sUSDS), that these reserves run Aave-shape utilization curves with a Sky-anchored base rather than a base fixed at listing, the per-reserve step sizes (DAI/USDS 18 bps, USDC 14 bps, PYUSD 8 bps, USDT 49 bps as its utilization also fell), and the July 6 earlier step that was Spark-specific (not Sky-driven). Close with the analytical implication: Fluid's 4.66% USDC supply APY vs SparkLend's 3.47% is not a clean like-for-like because SparkLend's rate carries a Sky-anchored base on top of its utilization curve.

**Standalone tweets (4):**

- The Fluid rate premium narrowing (6.41% → 4.66% USDC supply, +281 bps → +106 bps over T-bill, still above it)
- The Morpho V2 at 71.76% of curated TVL + Midnight launch on July 24
- The Real Yield Spread deepening to −75 bps sector-wide
- The Aave V3 USDe-complex composition shift (USDe / sUSDe / USDTB / PT-sUSDe growing while USDC and USDT drain)

Each standalone tweet stands independently and includes a link to the full report at the DatumLabs URL.

**Character budget:** X allows 280 characters for standard accounts and up to 25,000 for Premium threads. Assume Datum Labs runs Premium. Long tweets are fine when the content earns the length, but every tweet must advance the read, not pad.

## Part D. Joel's personal Twitter threads (`Issue_004_Joel_Personal_Twitter.docx`)

First person allowed. This is Joel's analyst take, not a Datum Labs institutional broadcast. The voice should read as Joel reflecting on what the July data taught him, with more mechanism context than a Datum Labs institutional thread would carry.

**Deliverable:** two threads, each 6 to 8 tweets. Plus 3 standalone tweets.

**Thread 1: Joel on the Aave collateral pattern.** Personal read: "This is now the second month I've watched Aave carry the sector. The pattern is not what I expected when I started this cycle." Then the analytical work: the collateral-in / stables-flat mechanism, why it means Aave's growth reflects borrow-book depth demand rather than depositor rate-chasing, what that tells him about where institutional capital is actually going. Close with what he's watching in August.

**Thread 2: Joel on the SparkLend Sky mechanism.** Personal frame: "The single most consequential finding in this month's data is that five of SparkLend's eighteen reserves run a utilization curve with a Sky-anchored base, so their rate moves on Sky governance days even when utilization is flat." Then walk through the mechanism at a depth that assumes the reader is a lending-market person: the Sky Agent structure, the Base Rate as a wholesale cost of USDS that anchors the curve's base parameter, the July 23 Atlas Edit execution, why the July 6 earlier Spark step was different (a Spark-side markup change, not a Sky pass-through). Close with the analytical implication for cross-protocol comparisons.

**Standalone tweets (3):**

- Joel's take on the Sentora crossover as a Morpho vault surface story
- Joel's take on Fluid's rate leadership erosion and what it says about depositor stickiness on structurally different lending protocols
- One reflection tweet on the broader shape of the sector (halved growth + climbing concentration + deepening real yield = late-cycle depositor market shape)

## Part E. Save outputs + commit

All four artifacts land as .docx files at `content/reports/distribution/`, following the Issue 003 naming:

- `Issue_004_Article.docx`
- `Issue_004_LinkedIn_MiniPost.docx`
- `Issue_004_Datum_Labs_Twitter.docx`
- `Issue_004_Joel_Personal_Twitter.docx`

Build script goes to `outputs/build_issue_004_distribution.js` following the Issue 003 script pattern (docx-js library).

Commit: `distribution: issue 004 article, linkedin mini-post, twitter threads (datum labs + personal)`

## Part F. Report back

1. The confirmed live report URL used in all four artifacts
2. Word count on the article
3. Tweet count per thread and per standalone set
4. Any AI-slop patterns you caught in your own draft and fixed before writing to disk (self-report)
5. Commit hash

If any artifact's tone starts drifting toward LinkedIn-post cadence or watered-down summary voice, stop and rewrite that section before saving.

If the Issue 003 distribution artifacts aren't present in the repo (they may have been deleted or moved), use the voice rules in this hand-off as the sole reference. Do not guess based on generic content marketing conventions.

---

## Copy-paste block ends above this line.

## After

Once the four artifacts are drafted, Joel reads them, marks up the ones that need voice adjustment, and we iterate. Distribution is where prior cycles have had the most editorial revision rounds, so expect 2-3 passes on the article and clip pack.

After the writing is approved, the last piece is promo cards (PNG 1200×675, three cards matching Issue 003 style — one per major finding). Those are a separate small hand-off once the writing lands.
