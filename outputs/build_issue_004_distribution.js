// Issue 004 distribution stack (July 2026). Four docx artifacts:
//   node outputs/build_issue_004_distribution.js
//   -> content/reports/distribution/Issue_004_Article.docx
//   -> content/reports/distribution/Issue_004_LinkedIn_MiniPost.docx
//   -> content/reports/distribution/Issue_004_Datum_Labs_Twitter.docx
//   -> content/reports/distribution/Issue_004_Joel_Personal_Twitter.docx
//
// Voice: Blockworks-tier analyst register. Numbers front-loaded, snapshot-
// dated, units in % / bps / pp, values in $B / $M. No em dashes, no first-
// person plural in the Datum Labs voice, no all-caps emphasis, no reveal
// setups or AI wrap-ups. All figures adapted from
// content/reports/2026-07-july.mdx; no new claims.

const fs = require("fs")
const path = require("path")
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
  ShadingType,
} = require("docx")

const REPO = path.resolve(__dirname, "..")
const DIST = path.join(REPO, "content/reports/distribution")
const REPORT_URL = "https://datumlab.xyz/resources/reports/state-of-lending-ethereum-july-2026"
const BODY = { font: "Georgia", size: 22 } // 11pt

function p(text) {
  return new Paragraph({ children: [new TextRun({ ...BODY, text })], spacing: { after: 220 } })
}
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ font: "Georgia", size: 32, bold: true, color: "0E1B2C", text })],
    spacing: { before: 400, after: 200 },
  })
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ font: "Georgia", size: 28, bold: true, color: "0E1B2C", text })],
    spacing: { before: 340, after: 200 },
  })
}
function italicNote(text) {
  return new Paragraph({
    children: [new TextRun({ ...BODY, italics: true, color: "595959", text })],
    spacing: { after: 200 },
  })
}
function linkPara(lead, tail) {
  return new Paragraph({
    children: [
      new TextRun({ ...BODY, text: lead }),
      new ExternalHyperlink({
        children: [new TextRun({ ...BODY, style: "Hyperlink", text: REPORT_URL })],
        link: REPORT_URL,
      }),
      ...(tail ? [new TextRun({ ...BODY, text: tail })] : []),
    ],
    spacing: { after: 220 },
  })
}

// ── shared tweet/clip block: id + title, then shaded indented paragraphs,
//    then a char-count meta line ──────────────────────────────────────────
function tweetBlock(id, title, text) {
  const out = [
    new Paragraph({
      children: [
        new TextRun({ ...BODY, bold: true, color: "C5511A", text: `${id}  ` }),
        new TextRun({ ...BODY, bold: true, text: title }),
      ],
      spacing: { before: 280, after: 120 },
    }),
  ]
  for (const line of text.split("\n\n")) {
    out.push(
      new Paragraph({
        children: [new TextRun({ ...BODY, text: line })],
        indent: { left: 360 },
        shading: { type: ShadingType.CLEAR, fill: "F7F4ED" },
        spacing: { after: 120 },
      })
    )
  }
  out.push(
    new Paragraph({
      children: [new TextRun({ ...BODY, size: 18, italics: true, color: "595959", text: `${text.length} characters` })],
      indent: { left: 360 },
      spacing: { after: 160 },
    })
  )
  return out
}

function writeDoc(outFile, children) {
  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(path.join(DIST, outFile), buf)
    return buf.length
  })
}

// ════════════════════════════════════════════════════════════════════════
// PART A — X / LinkedIn article
// ════════════════════════════════════════════════════════════════════════
const ARTICLE_TITLE = "Aave Carried the Sector: State of DeFi Lending on Ethereum, July 2026"
const ARTICLE_SUBHEAD =
  "Aave V3 was the only major Ethereum lending protocol that grew in July. Growth halved from June, curator concentration deepened, and stablecoin real yield sank to −75 bps below the T-bill."

const ARTICLE_SECTIONS = [
  {
    header: null,
    paras: [
      "Aave V3 added $649M of net constant-price deposits on Ethereum in July 2026, the only positive reading among the six largest lending protocols large enough to move the sector. The other five, SparkLend, Morpho V1, Fluid, Compound V3, and Euler V2, combined for a net −$96M over the same window. The sector total was +$553M. Strip out Aave V3 and the sector contracted.",
      "July halved June's growth. The same six-protocol frame added $1.33B in June and $553M in July, a 58% drop. Two other readings moved with it. Morpho's combined V1 and V2 curator concentration climbed for a second straight month, from an HHI of 2,095 at June 30 to 2,337 at July 31. And the sector's blended stablecoin supply rate closed July at 2.85% against a 3.60% 4-week Treasury bill, a Real Yield Spread of −75 bps, down from −37 bps at the June close.",
      "One protocol carrying the sector, concentration climbing at the curator layer, and real yield deepening below the risk-free rate for a second consecutive month: the shape of a depositor market running short of new participants.",
    ],
  },
  {
    header: "The growth was collateral",
    paras: [
      "Aave V3's inflow did not arrive in stablecoins. USDC on the protocol shed $20M in July, a smaller drain than June's −$162M but the same direction. USDT shed $62M and WETH shed $29M. Against those, the collateral reserves grew: weETH +$285M, sUSDe +$145M, WBTC +$124M, wstETH +$113M, cbBTC +$63M.",
      "Inside the liquid restaking complex the flow split rather than moved as a block. weETH took +$285M while rsETH lost $93M, a rotation toward the token with the deepest looping venue on Aave rather than a uniform restaking inflow. The stablecoin picture is similar underneath the headline drain: combined outflow across USDC, USDT, and a maturing Pendle sUSDe reserve totaled roughly −$110M, while combined inflow across sUSDe, USDe, USDTB, and a longer-dated Pendle sUSDe forward totaled roughly +$255M. Net stablecoin position grew about +$145M, but the growth landed in the USDe complex, Ethena's synthetic dollar and its tokenized forwards, while USDC and USDT drained.",
      "This is the second consecutive month of the same composition: collateral in, base stablecoins and ETH flat to negative. Aave V3's growth this cycle reflects depositors supplying collateral to borrow against. The 3.27% USDC supply rate, 33 bps under the T-bill, is not what draws them. Two months makes it a pattern rather than a June artifact.",
    ],
  },
  {
    header: "Sentora overtook Steakhouse on Morpho",
    paras: [
      "Underneath the rising HHI, the curator layer rotated. Sentora grew from 27.65% of Morpho's combined V1+V2 curated TVL at May 31 to 33.56% at July 31, overtaking Steakhouse Financial to become Morpho's largest single curator. Steakhouse held roughly flat over the two months, 31.08% to 31.31%. Gauntlet declined for a second straight month, 18.59% to 13.02%, a 557 bps drop.",
      "The crossover ran in two moves. May to June was a direct transfer: Sentora +358 bps, Steakhouse −191 bps, share moving from the incumbent to the challenger. June to July was coincident growth: Sentora and Steakhouse both gained, together +447 bps, with the ground coming from the long tail rather than from each other. Across the full window Sentora added +591 bps and Steakhouse netted +23 bps.",
      "The three largest curators run structurally different books. Sentora holds $741M across three concentrated V2 vaults. Steakhouse holds $691M across 18 vaults split evenly between V1 and V2. Gauntlet holds $287M across 22 vaults weighted 82% to V1. Combined top-three share still rose, 74.6% to 77.9%. The aggregate concentration number reads as generic; the composition underneath is one V2-native curator consolidating a concentrated book while the incumbent holds a mixed one and the third retreats into legacy V1 exposure.",
    ],
  },
  {
    header: "SparkLend's stablecoin rates now move with Sky governance",
    paras: [
      "Five of SparkLend's 18 reserves, all stablecoins, price their borrow rate from Sky governance rather than from pool utilization. On July 23 at 14:43 UTC, Sky's weekly Atlas Edit executive spell executed on-chain and cut the Sky Base Rate, the wholesale cost of the USDS inventory SparkLend lends against as a Sky Agent, from 3.90% to 3.72%, an 18 bps step. SparkLend's on-chain USDC retail borrow rate stepped from 4.42% to 4.28% in the same transaction cycle.",
      "The five Sky-linked reserves are DAI, USDC, USDT, USDS, and PYUSD. On-chain reads show all five point their variable-rate model at a single Sky-linked rate source contract at 0x57027B62, which references sUSDS and derives from the Base Rate. All five stepped roughly 18 bps on July 23. None of SparkLend's other 13 reserves, the collateral book of WETH, wstETH, WBTC and the rest, moved that day; they clear on standard Aave-shape utilization curves. SparkLend is a hybrid: a Sky-priced stablecoin book bolted onto an Aave-style collateral book.",
      "An earlier step on July 6 cut USDC from 4.61% to 4.42%, but the Base Rate did not move that day and the other four Sky-linked stablecoins held. July 6 was SparkLend compressing its own markup over the wholesale rate; July 23 was Sky cutting the wholesale rate itself. The markup narrowed from 0.71 pp on July 22 to 0.56 pp on July 23. The mechanism matters for any cross-protocol rate read. Comparing Fluid's 4.66% USDC supply APY to SparkLend's 3.47% is not a like-for-like: one rate reflects lender-borrower matching, the other reflects a Sky governance decision.",
    ],
  },
  {
    header: "Fluid gave back its rate lead",
    paras: [
      "Fluid closed June with the sector's only positive real yield on USDC: a 6.41% supply APY, 281 bps over the 4-week T-bill. It closed July at 4.66%, 107 bps under the T-bill, a 175 bps compression in a month while Aave V3's USDC rate moved 8 bps (3.19% to 3.27%). Fluid still leads the pool-based USDC field, but its margin over Aave narrowed from 322 bps to 139 bps, and the dispersion across the four pool-based USDC markets halved from 322 bps to 157 bps.",
      "The compression was idiosyncratic to Fluid rather than sector-wide, but Fluid took +$26M of net flow anyway, near-flat. A 175 bps rate cut on a structurally higher-yielding venue did not produce a visible exit. On a lending book whose yield edge comes from capital that serves as both DEX and lending liquidity, that reads as depositor stickiness worth tracking into August.",
    ],
  },
  {
    header: "What August tests",
    paras: [
      "Three readings settle whether July's shape is structural. Whether Aave V3 keeps carrying the sector: two months of Aave-dominant growth, +$845M in June and +$649M in July, is not a base case for a healthy multi-protocol sector, and a month where Aave goes flat while another protocol absorbs the inflow would break the read. Whether Sentora keeps pulling ahead or Morpho's concentration peaked in July. Whether the Sky-linked stablecoin book sees another Atlas Edit adjustment to the Base Rate. And whether Fluid stabilizes around 4.6% or continues drifting toward Aave's 3.27%. A third consecutive month of climbing concentration and deepening real yield would put the sector in a late-cycle depositor shape: the largest venues keep winning, and the pool of new capital they win from keeps thinning.",
    ],
  },
]
const ARTICLE_CLOSE_LEAD =
  "The full report, with the daily flow series, the six protocol sections, and the complete rate and curator tables: "
const ARTICLE_CLOSE_TAIL = ". Issue 004 of the monthly State of DeFi Lending on Ethereum series."

function buildArticle() {
  const children = [
    new Paragraph({
      children: [new TextRun({ font: "Georgia", size: 40, bold: true, color: "0E1B2C", text: ARTICLE_TITLE })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ ...BODY, size: 24, italics: true, color: "404040", text: ARTICLE_SUBHEAD })],
      spacing: { after: 320 },
    }),
  ]
  for (const s of ARTICLE_SECTIONS) {
    if (s.header) children.push(h2(s.header))
    for (const para of s.paras) children.push(p(para))
  }
  children.push(linkPara(ARTICLE_CLOSE_LEAD, ARTICLE_CLOSE_TAIL))

  const words = [ARTICLE_TITLE, ARTICLE_SUBHEAD, ARTICLE_CLOSE_LEAD + REPORT_URL + ARTICLE_CLOSE_TAIL]
    .concat(ARTICLE_SECTIONS.flatMap((s) => [s.header || ""].concat(s.paras)))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length
  return writeDoc("Issue_004_Article.docx", children).then((kb) => ({ kb, words }))
}

// ════════════════════════════════════════════════════════════════════════
// PART B — LinkedIn mini-post
// ════════════════════════════════════════════════════════════════════════
const MINI_PARAS = [
  "Aave V3 was the only major DeFi lending protocol on Ethereum that grew in July 2026. Its +$649M net constant-price flow carried a sector that would have contracted without it; the other five covered protocols combined for a net −$96M over the same window.",
  "The July State of DeFi Lending on Ethereum report covers four findings from the month: the collateral inflows carrying Aave while its USDC book drains, Sentora overtaking Steakhouse as Morpho's largest curator, SparkLend's stablecoin rates stepping with Sky governance rather than pool utilization, and the erosion of Fluid's June rate leadership on USDC.",
  "Full report below.",
]
function buildMiniPost() {
  const children = [
    new Paragraph({
      children: [new TextRun({ font: "Georgia", size: 32, bold: true, color: "0E1B2C", text: "Issue 004 LinkedIn Mini-Post" })],
      spacing: { after: 120 },
    }),
    italicNote(
      "The short description LinkedIn asks for after uploading the article (the “Tell your readers what this article is about” prompt). Points readers into the article."
    ),
  ]
  for (const para of MINI_PARAS) children.push(p(para))
  const words = MINI_PARAS.join(" ").split(/\s+/).filter(Boolean).length
  return writeDoc("Issue_004_LinkedIn_MiniPost.docx", children).then((kb) => ({ kb, words }))
}

// ════════════════════════════════════════════════════════════════════════
// PART C — Datum Labs Twitter (institutional, third person, no "we")
// ════════════════════════════════════════════════════════════════════════
const DL_THREADS = [
  {
    title: "Thread 1: Aave carried the sector",
    tweets: [
      "Aave V3 added $649M of net constant-price deposits on Ethereum in July 2026, the only positive reading among the six largest lending protocols large enough to move the sector. The other five combined for −$96M. Strip out Aave V3 and the sector contracted.",
      "The +$649M came through the collateral reserves. The stablecoin book drained over the same month: USDC −$20M, USDT −$62M, WETH −$29M. Against those, weETH +$285M, sUSDe +$145M, WBTC +$124M, wstETH +$113M, cbBTC +$63M.",
      "Inside the liquid restaking complex the flow split. weETH took +$285M while rsETH lost $93M, a rotation toward the token with the deepest looping venue on Aave rather than a uniform restaking inflow.",
      "Net stablecoin position on Aave V3 still grew about +$145M, but the growth was the USDe complex. sUSDe, USDe, USDTB, and Pendle sUSDe forwards drew inflow while USDC and USDT drained. Ethena's synthetic dollar is now a material stablecoin surface on the protocol.",
      "This is the second consecutive month of the same composition: collateral in, base stablecoins and ETH flat to negative. June ran the same shape, USDC down $162M against $845M of collateral.",
      "Aave V3's growth this cycle is a borrow-book story. Depositors supply collateral to borrow against; the 3.27% USDC supply rate, 33 bps under the 4-week T-bill, is not what draws them. Two months makes it a pattern.",
    ],
  },
  {
    title: "Thread 2: Sentora overtook Steakhouse on Morpho",
    tweets: [
      "Sentora closed July as Morpho's largest single curator at 33.56% of combined V1+V2 curated TVL, overtaking Steakhouse Financial at 31.31%. At May 31 Sentora sat at 27.65%, behind Steakhouse.",
      "The crossover ran in two moves. May to June was a direct transfer: Sentora +358 bps, Steakhouse −191 bps. Share moved from the incumbent to the challenger.",
      "June to July was coincident growth: Sentora and Steakhouse both gained, together +447 bps, with the ground coming from the long tail rather than from each other. Across the full window Sentora added +591 bps, Steakhouse +23 bps net.",
      "Gauntlet declined for a second straight month, 18.59% at May 31 to 13.02% at July 31, a 557 bps drop. Combined top-three curator share still rose, 74.6% to 77.9%.",
      "The three run structurally different books. Sentora: $741M across 3 concentrated V2 vaults. Steakhouse: $691M across 18 vaults split evenly V1/V2. Gauntlet: $287M across 22 vaults, 82% weighted to V1.",
      "Morpho's combined V1+V2 HHI climbed to 2,337 at July 31 from 2,095 at June 30, a second consecutive monthly rise. The aggregate number reads as generic concentration; the composition is one V2-native curator consolidating while the incumbent holds mixed and the third retreats into legacy V1.",
      "Two curators outside the top three grew in July, both V2-only: Sky Money to 5.46% ($121M) and Galaxy Curation to 3.60% ($79M). Growth on Morpho's vault surface is landing in V2.",
    ],
  },
  {
    title: "Thread 3: SparkLend's stablecoin rates move with Sky governance",
    tweets: [
      "On July 23 at 14:43 UTC, Sky's weekly Atlas Edit executive spell executed on-chain and cut the Sky Base Rate from 3.90% to 3.72%, an 18 bps step. SparkLend's USDC retail borrow rate stepped from 4.42% to 4.28% in the same cycle.\n\ntx 0x12435f652eeb08f9de4f4b6402a88de38ac092aef2a6656c87ed0be2f6f6619b",
      "Five of SparkLend's 18 reserves price their borrow rate from that Base Rate rather than from pool utilization. All five are stablecoins: DAI, USDC, USDT, USDS, PYUSD. All five stepped roughly 18 bps on July 23.",
      "On-chain, the five point their variable-rate model at a single Sky-linked rate source at 0x57027B62, which references sUSDS and derives from the Sky Base Rate. The Base Rate is the wholesale cost of the USDS inventory SparkLend lends against as a Sky Agent.",
      "None of SparkLend's other 13 reserves moved on July 23. The collateral book, WETH, wstETH, WBTC, weETH and the rest, clears on standard Aave-shape utilization curves. SparkLend is a hybrid: a Sky-priced stablecoin book on an Aave-style collateral book.",
      "An earlier step on July 6 cut USDC from 4.61% to 4.42%, but the Base Rate held and the other four Sky-linked stablecoins did not move. July 6 was SparkLend compressing its own markup; July 23 was Sky cutting the wholesale rate. The markup narrowed from 0.71 pp to 0.56 pp.",
      "The implication is for cross-protocol rate reads. Aave V3, Fluid, Compound V3, and Euler V2 set USDC rates on utilization. SparkLend's stablecoin book does not. Fluid's 4.66% USDC supply APY and SparkLend's 3.47% are set by different mechanisms and are not a like-for-like comparison.",
    ],
  },
]
const DL_STANDALONE = [
  {
    id: "S.1",
    title: "Fluid rate leadership eroded",
    text:
      "Fluid closed June with the sector's only positive real yield on USDC: 6.41% supply APY, 281 bps over the 4-week T-bill. It closed July at 4.66%, 107 bps under the T-bill. The 175 bps compression narrowed its lead over Aave V3 from 322 bps to 139 bps.",
  },
  {
    id: "S.2",
    title: "Morpho V2 share + Midnight launch",
    text:
      "Morpho V2 held 71.76% of combined curated TVL at July 31, $1.77B of a $2.21B book, as curators migrate mandates onto the newer vault standard. Morpho shipped Midnight, a fixed-rate and fixed-term product built on V2 markets, on July 24.",
  },
  {
    id: "S.3",
    title: "Real Yield Spread deepened",
    text:
      "The sector's blended stablecoin supply rate closed July at 2.85% against a 3.60% 4-week T-bill: a Real Yield Spread of −75 bps, down from −37 bps at the June close. Two consecutive months of materially negative real yield on the sector's largest asset class.",
  },
  {
    id: "S.4",
    title: "Aave V3 stablecoin composition shift",
    text:
      "Aave V3's stablecoin book grew about +$145M net in July, but the growth was the USDe complex. sUSDe, USDe, USDTB, and Pendle sUSDe forwards drew inflow while USDC shed $20M and USDT shed $62M.",
  },
]

function buildDatumLabsTwitter() {
  const children = [
    new Paragraph({
      children: [new TextRun({ font: "Georgia", size: 40, bold: true, color: "0E1B2C", text: "Issue 004 Twitter: Datum Labs profile" })],
      spacing: { after: 160 },
    }),
    italicNote(
      "Institutional voice, third person, snapshot-dated figures. Three threads plus four standalone tweets that schedule independently. Character counts noted under each tweet; long tweets assume a Premium account. Each standalone includes the report link."
    ),
  ]
  DL_THREADS.forEach((thread, ti) => {
    children.push(h1(thread.title))
    thread.tweets.forEach((t, i) => children.push(...tweetBlock(`T${i + 1}`, `Thread ${ti + 1}`, t)))
    // report link tweet closes each thread
    children.push(...tweetBlock(`T${thread.tweets.length + 1}`, `Thread ${ti + 1} (link)`,
      `Issue 004, State of DeFi Lending on Ethereum, July 2026. Six protocol sections and the full data tables.\n\n${REPORT_URL}`))
  })
  children.push(h1("Standalone tweets"))
  for (const s of DL_STANDALONE) children.push(...tweetBlock(s.id, s.title, `${s.text}\n\n${REPORT_URL}`))

  const tweetTotal = DL_THREADS.reduce((n, t) => n + t.tweets.length + 1, 0) + DL_STANDALONE.length
  return writeDoc("Issue_004_Datum_Labs_Twitter.docx", children).then((kb) => ({ kb, tweetTotal }))
}

// ════════════════════════════════════════════════════════════════════════
// PART D — Joel's personal Twitter (first person, sparing, analytical)
// ════════════════════════════════════════════════════════════════════════
const JOEL_THREADS = [
  {
    title: "Thread 1: the Aave collateral pattern",
    tweets: [
      "This is the second month I have watched Aave V3 carry the entire Ethereum lending sector. In July its +$649M net constant-price flow was effectively the whole story: the other five protocols netted −$96M.",
      "What keeps pulling me back to the composition is that almost none of it is USDC. weETH +$285M, sUSDe +$145M, WBTC +$124M. USDC actually shed $20M, USDT $62M. The growth is collateral.",
      "Collateral supplied at scale to the deepest borrow book on Ethereum reads one way to me: depositors are here to borrow against it. A 3.27% USDC rate, 33 bps under the T-bill, is not what pulls that capital in.",
      "The part I did not expect at the start of this cycle is how durable it is. Two months, same shape: collateral in, base stablecoins and ETH flat to negative. That durability is what makes it a pattern rather than a liquidation echo.",
      "The stablecoin growth that did happen went to the USDe complex, sUSDe and USDe and the Pendle forwards, while USDC and USDT drained. That composition shift is the quieter thread I want to keep watching.",
      "In August I am watching one reading: whether Aave keeps carrying the sector, or a month arrives where it goes flat and another protocol absorbs the inflow. That is what decides whether July was structural.",
    ],
  },
  {
    title: "Thread 2: the SparkLend Sky mechanism",
    tweets: [
      "The most consequential thing in this month's data, for me, is that five of SparkLend's 18 reserves do not work like the USDC markets on the other five protocols at all.",
      "All five are stablecoins: DAI, USDC, USDT, USDS, PYUSD. Their borrow rate tracks the Sky Base Rate, the wholesale cost of the USDS that SparkLend lends against as a Sky Agent, rather than pool utilization.",
      "On July 23 at 14:43 UTC, Sky's Atlas Edit spell cut that Base Rate from 3.90% to 3.72%. SparkLend's USDC retail rate stepped from 4.42% to 4.28% in the same cycle. All five Sky-linked reserves moved together. The other 13 did not.",
      "The subtle part is July 6. USDC stepped that day too, 4.61% to 4.42%, but the Base Rate held and the other four stablecoins stayed put. July 6 was Spark compressing its own markup over the wholesale rate. July 23 was Sky cutting the wholesale rate itself. Two different events.",
      "On-chain, the five point at one Sky-linked rate source, 0x57027B62, which references sUSDS. The collateral book, WETH, wstETH, WBTC and the rest, still clears on Aave-shape utilization curves. SparkLend is a hybrid.",
      "The implication I keep coming back to: any cross-protocol USDC rate table that lists SparkLend next to Aave or Fluid is comparing two different primitives. Fluid's 4.66% is lender-borrower matching. SparkLend's 3.47% is a governance decision.",
    ],
  },
]
const JOEL_STANDALONE = [
  {
    id: "S.1",
    title: "Sentora crossover as a vault-surface story",
    text:
      "Sentora overtaking Steakhouse as Morpho's largest curator is a story about the vault surface, one level below protocol flow. Morpho took +$135M at the protocol level in July; underneath, Sentora consolidated from 27.65% in May to 33.56% in July on three concentrated V2 vaults.",
  },
  {
    id: "S.2",
    title: "Fluid stickiness under rate compression",
    text:
      "Fluid cut its USDC supply APY 175 bps in July, 6.41% to 4.66%, and still took +$26M of net flow. On a venue whose yield edge comes from capital that serves as both DEX and lending liquidity, depositors did not treat the cut as a reason to leave. Stickiness worth watching.",
  },
  {
    id: "S.3",
    title: "The late-cycle shape",
    text:
      "Halved growth, a second month of climbing curator concentration, and real yield deepening to −75 bps below the T-bill. Put together, July reads to me as a late-cycle depositor market: the largest venues keep winning, and the new capital they win from keeps thinning.",
  },
]

function buildJoelTwitter() {
  const children = [
    new Paragraph({
      children: [new TextRun({ font: "Georgia", size: 40, bold: true, color: "0E1B2C", text: "Issue 004 Twitter: Joel personal profile" })],
      spacing: { after: 160 },
    }),
    italicNote(
      "First person, sparing and analytical. Two threads plus three standalone tweets. Character counts noted; each standalone includes the report link."
    ),
  ]
  JOEL_THREADS.forEach((thread, ti) => {
    children.push(h1(thread.title))
    thread.tweets.forEach((t, i) => children.push(...tweetBlock(`T${i + 1}`, `Thread ${ti + 1}`, t)))
    children.push(...tweetBlock(`T${thread.tweets.length + 1}`, `Thread ${ti + 1} (link)`,
      `Full July report, charts and tables throughout.\n\n${REPORT_URL}`))
  })
  children.push(h1("Standalone tweets"))
  for (const s of JOEL_STANDALONE) children.push(...tweetBlock(s.id, s.title, `${s.text}\n\n${REPORT_URL}`))

  const tweetTotal = JOEL_THREADS.reduce((n, t) => n + t.tweets.length + 1, 0) + JOEL_STANDALONE.length
  return writeDoc("Issue_004_Joel_Personal_Twitter.docx", children).then((kb) => ({ kb, tweetTotal }))
}

// ── build all four ────────────────────────────────────────────────────────
Promise.all([buildArticle(), buildMiniPost(), buildDatumLabsTwitter(), buildJoelTwitter()])
  .then(([a, m, d, j]) => {
    console.log(`Issue_004_Article.docx              ${a.kb / 1024 | 0} KB, ${a.words} words`)
    console.log(`Issue_004_LinkedIn_MiniPost.docx    ${m.kb / 1024 | 0} KB, ${m.words} words`)
    console.log(`Issue_004_Datum_Labs_Twitter.docx   ${d.kb / 1024 | 0} KB, ${d.tweetTotal} tweets`)
    console.log(`Issue_004_Joel_Personal_Twitter.docx ${j.kb / 1024 | 0} KB, ${j.tweetTotal} tweets`)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
