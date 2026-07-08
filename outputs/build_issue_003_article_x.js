// Issue 003 long-form article, X variant (~1600 words).
//
//   node outputs/build_issue_003_article_x.js
//   -> content/reports/distribution/Issue_003_Article_X_Long_Form.docx
//
// Adapted from content/reports/2026-06-june.mdx. X long-form supports
// headers, paragraphs, and embedded links; the three Track A promo cards
// are embedded at their natural section boundaries.

const fs = require("fs")
const path = require("path")
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  ExternalHyperlink,
  AlignmentType,
} = require("docx")

const REPO = path.resolve(__dirname, "..")
const OUT = path.join(REPO, "content/reports/distribution/Issue_003_Article_X_Long_Form.docx")
const CARDS = path.join(REPO, "public/reports/charts-social")

const REPORT_URL = "https://lending-intelligence-terminal.vercel.app/reports/2026-06-june"

const BODY = { font: "Georgia", size: 22 } // 11pt

function p(text) {
  return new Paragraph({
    children: [new TextRun({ ...BODY, text })],
    spacing: { after: 220 },
  })
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ font: "Georgia", size: 28, bold: true, color: "0E1B2C", text })],
    spacing: { before: 340, after: 200 },
  })
}

function img(file) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "png",
        data: fs.readFileSync(path.join(CARDS, file)),
        transformation: { width: 600, height: 338 },
      }),
    ],
    spacing: { after: 260 },
  })
}

const TITLE = "Consolidation Under Yield Compression: State of DeFi Lending on Ethereum, June 2026"
const SUBHEAD =
  "Aave V3 grew $845 million in June while its USDC book contracted. The paradox of consolidation under yield compression."

const SECTIONS = [
  {
    header: null,
    paras: [
      "The June reading across Ethereum's six largest lending protocols is consolidation under yield compression. The Real Yield Spread, the blended stablecoin lending rate minus the 4-week U.S. Treasury bill yield, closed June 30 at −37.1 basis points (bps), the deepest month-end inversion since March 2026. Capital did not leave in response. The six protocols absorbed $1.33 billion of net deposits at constant prices, and the largest single destination was the venue paying 41 bps less than the T-bill on its USDC book.",
    ],
    image: "twitter-promo-sector-paradox.png",
  },
  {
    header: "The Real Yield Spread deepened, and June 5 was the trigger",
    paras: [
      "The blended stablecoin supply rate, TVL-weighted across USDC, USDT, DAI, and USDS on Aave V3, Spark, Morpho, and Fluid, fell from 3.60% at the May close to 3.23% at the June close, a 37-bps compression. The 4-week Treasury bill held at 3.60% across the same window, unchanged to two decimal places. The spread re-inverted because on-chain rates fell, not because TradFi rates moved. That is the inverse of May's mechanism, where stablecoin APYs lifted to meet T-bills and the spread closed at parity.",
      "The spread last printed positive on June 4, at +42.0 bps. It turned negative on June 5 and stayed negative through the remaining 25 days of the month. June 5 was also the month's largest liquidation event: $128.31 million of collateral seized across 1,766 individual events, 10.25 times the trailing seven-day median of $12.51 million. Aave V3 carried $93.98 million of the day's seized collateral, Fluid $15.04 million, Morpho $11.08 million, Compound V3 $7.22 million, and SparkLend and Euler V2 the residual.",
      "The distribution across five of six protocols indicates a spot-price shock that traveled across the sector rather than a single-protocol operational failure. The mechanical chain runs from liquidation to rate: forced repayments retire borrow positions, utilization drops across the affected markets, borrow rates fall on the utilization curve, and supply APYs compress with them. That chain, together with the mark-to-market repricing on ETH-family collateral, is the proximate driver of the month's yield compression.",
      "Context matters for calibration. June's −37 bps is not the deepest reading on record: February 2026 printed −151 bps and March −118 bps before April and May recovered toward parity. Against the prior cycle, the May to November 2025 month-end series ranged from −19 to −90 bps with two positive prints in between. June's print is consistent with the spread reverting to the pre-rally regime rather than continuing the recovery that May suggested.",
    ],
    image: null,
  },
  {
    header: "Where the money went (and where it didn't)",
    paras: [
      "At nominal prices the sector contracted. Total supply fell 10.4%, from $32.64 billion at May 31 to $29.23 billion at June 30. At constant prices, holding each token's price fixed at the snapshot date and counting only the change in token quantity, depositors added $1.33 billion. The wedge between the two readings is mark-to-market on collateral: spot ETH fell 21.3% in June and the four largest liquid restaking tokens fell in near-lockstep. The dollar value of the sector's deposits shrank while the deposited quantity grew.",
      "Five of the six protocols saw positive constant-price flow. Aave V3 added $845 million, the largest single-protocol inflow in the captured series, up from $352 million in May. SparkLend added $415 million, Compound V3 $59 million, Morpho $20 million, and Fluid $16 million. Only Euler V2 was negative, at $21 million of outflow distributed across many small vaults rather than one operator's exit.",
      "Aave V3's $845 million did not arrive in USDC. The protocol's own USDC book shed $162 million of net constant-price capital across the month. What arrived was $452 million of wstETH, $143 million of cbBTC, $104 million of USDTB, and $99 million of USDT, with smaller positives spread across other assets. That composition is not yield-seeking supply. It is collateral flowing to the sector's largest borrow book.",
      "The daily shape distinguishes accumulation from a single trade at scale. Aave V3 added quantity on twenty-seven of thirty June trading days. The three material outflow days, June 3, 11, and 12, were dominated by USDC leaving alongside wstETH arriving on the same day: asset rotation inside the protocol rather than depositor exit. The month's inflow was steady accumulation punctuated by three days of stable-token rotation.",
      "The cleanest counter-test is Fluid. Its USDC supply APY closed June at 6.41%, 281 bps above the T-bill and the sector's only positive real yield spread on USDC. It received $16 million of net inflow for the month, against Aave V3's $845 million protocol total: a 50-to-1 ratio in favor of the venue paying 41 bps below the risk-free rate on the same asset. Whatever is steering the marginal dollar, it is not the headline rate.",
    ],
    image: "twitter-promo-aave-wrong-asset.png",
  },
  {
    header: "Concentration accelerated at the top",
    paras: [
      "Aave V3 captured 63.4% of the sector's net constant-price inflow while holding 56.7% of the sector's nominal supply at June 30, over-indexing by roughly 7 percentage points (pp). SparkLend captured 31.1% against a 17.2% share of supply, over-indexing by 14 pp.",
      "Together the two largest protocols absorbed 94.5% of net inflow while holding 73.9% of stock. The remaining four protocols captured 5.5%. That is the concentration mechanism in one ratio: existing incumbents absorbed new capital at rates that widened rather than narrowed the gap between top and tail, in a month where the largest destination paid less than the T-bill on USDC.",
    ],
    image: "twitter-promo-concentration-94-5.png",
  },
  {
    header: "Morpho was less concentrated than we reported for May",
    paras: [
      "Issue 003 also carries a correction. Issue 002 reported Morpho's curator concentration at May 31 as a Herfindahl-Hirschman index (HHI) of 3,103, with three curators holding 93.9% of curated deposits. That reading captured only MetaMorpho, the V1 vault system. Morpho operates a second vault system, Vault V2, in parallel, and V2 was already the larger side of the curator market at May 31.",
      "Measured across both systems, Morpho's curator market at June 30 holds $2.12 billion of curated deposits across twenty curators, with an HHI of 2,095 and a top-three share of 74.6%. Sentora ranks first at 31.2%, Steakhouse Financial second at 29.2%, and Gauntlet third at 14.2%. Re-measured on the combined basis, May 31 comes to 2,144. The curator market did not concentrate further in June. It was less concentrated than the V1-only reading suggested all along, because half the market was invisible to it.",
    ],
    image: null,
  },
  {
    header: "The LRT contraction was mostly price",
    paras: [
      "The sector's liquid restaking token collateral fell $807 million at actual prices in June, from $3.73 billion to $2.92 billion. Roughly $781 million of that is per-unit price effect: weETH fell 21.04% per token, rsETH 21.00%, ezETH 21.28%, and osETH 19.99%, all tracking spot ETH's 21.25% decline. The residual constant-price flow across the four LRTs is approximately $26 million of net outflow. June's LRT contraction is roughly 97% price and 3% depositor flow.",
      "The Aave V3 Core weETH book makes the point concrete. Its dollar value fell $419 million across June, from $2.11 billion to $1.69 billion. Its token quantity grew by roughly 14,000 weETH. Depositors did not exit LRTs in June; prices did the contracting. May's reading was the opposite, $1.17 billion of genuine constant-price LRT outflow, and that exit thesis held for May. The mechanism did not extend to June.",
      "The forward question is behavioral. If LRT prices stabilize or recover in July, holders who sat through the two-month drawdown will recover dollar value without having moved. If prices fall at June's rate again, the same depositors take a second haircut on unchanged collateral, and whether that catalyzes exit at May's magnitude is the reading July's flow data will answer.",
    ],
    image: null,
  },
  {
    header: "What to watch in July",
    paras: [
      "Three readings will discriminate. First, the Real Yield Spread against the late-July Federal Open Market Committee decision: absent a cut, we expect the July 31 spread to land between −20 and −60 bps; a cut would close the spread from the rate side rather than the on-chain side. Second, Aave V3's share of sector inflow: the consolidation thesis expects it to stay above 50%, most likely in the 55 to 70% range. Third, Fluid's flow response to its rate leadership: we expect its USDC supply APY to hold above 5% and its net inflow to stay under $50 million. Two quieter calls round out the slate: Euler V2's flow should land within $30 million of zero with its loan-to-deposit ratio holding near 85%, and Steakhouse Financial's combined V1+V2 curator share should grow from 29.2% toward 30 to 35% by July 31.",
      "The thesis is falsifiable. If Aave V3's share of sector inflow falls below 50% and Fluid's constant-price flow rises above $75 million, it needs revision, and Issue 004 will publish the correction.",
    ],
    image: null,
  },
]

const CLOSING_LEAD =
  "The full report, with the daily flow series, six protocol deep dives, and the complete data tables, is live on the Datum Labs lending terminal: "
const CLOSING_TAIL = ". The June issue is the third in the monthly State of DeFi Lending on Ethereum series."

function build() {
  const children = [
    new Paragraph({
      children: [new TextRun({ font: "Georgia", size: 40, bold: true, color: "0E1B2C", text: TITLE })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ ...BODY, size: 24, italics: true, color: "404040", text: SUBHEAD })],
      spacing: { after: 320 },
    }),
  ]

  for (const section of SECTIONS) {
    if (section.header) children.push(h2(section.header))
    for (const text of section.paras) children.push(p(text))
    if (section.image) children.push(img(section.image))
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ ...BODY, text: CLOSING_LEAD }),
        new ExternalHyperlink({
          children: [new TextRun({ ...BODY, style: "Hyperlink", text: REPORT_URL })],
          link: REPORT_URL,
        }),
        new TextRun({ ...BODY, text: CLOSING_TAIL }),
      ],
      spacing: { after: 220 },
    })
  )

  const wordCount =
    [TITLE, SUBHEAD, CLOSING_LEAD + REPORT_URL + CLOSING_TAIL]
      .concat(SECTIONS.flatMap((s) => [s.header || ""].concat(s.paras)))
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(OUT, buf)
    console.log(`wrote ${OUT} (${(buf.length / 1024).toFixed(1)} KB, ~${wordCount} words)`)
  })
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
