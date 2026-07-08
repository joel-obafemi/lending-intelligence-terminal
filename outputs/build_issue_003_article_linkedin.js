// Issue 003 long-form article, LinkedIn variant (~950 words, Pass 5 rebuild).
//
//   node outputs/build_issue_003_article_linkedin.js
//   -> content/reports/distribution/Issue_003_Article_LinkedIn.docx
//
// Same skeleton as the X variant plus a measurement note after the lead,
// a historical calibration paragraph in the RYS section, and longer
// analytical closes. Voice: analyst register, numbers front-loaded,
// snapshot-dated, no first-person plural, no all-caps emphasis, no
// reveal setups. Adapted from content/reports/2026-06-june.mdx.

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
const OUT = path.join(REPO, "content/reports/distribution/Issue_003_Article_LinkedIn.docx")
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
      "Aave V3 added $845 million of net deposits in June 2026, the largest single-protocol inflow in the captured series, while its USDC book contracted by $162 million. The blended stablecoin rate across Ethereum's four largest lending venues closed the month 37.1 basis points (bps) below the 4-week Treasury bill. Capital consolidated anyway.",
      "The six largest lending protocols on Ethereum absorbed $1.33 billion of net deposits at constant prices in June, five of six positive. The largest destination paid 41 bps less than the T-bill on USDC through the month. The composition of the inflow, more than its size, carries the finding: what arrived was collateral.",
      "A note on measurement. All comparisons run snapshot to snapshot, May 31 to June 30, 2026. Constant-price flow holds each token's price fixed at the snapshot date and counts only the change in deposited quantity, isolating depositor behavior. Nominal figures use spot prices and mix behavior with price moves; where the two disagree, the gap is mark-to-market on collateral. Readings come from on-chain reads of each protocol's core contracts, cross-checked against DefiLlama, with the T-bill series from FRED.",
    ],
    imageAfterIndex: 1,
    images: ["twitter-promo-sector-paradox-brand.png"],
  },
  {
    header: "The trigger: June 5",
    paras: [
      "The Real Yield Spread, the blended stablecoin lending rate minus the 4-week T-bill yield, printed +42.0 bps on June 4 and went negative on June 5. It stayed negative through June 30, closing at −37.1 bps, the deepest month-end inversion since March 2026. The blended rate fell from 3.60% to 3.23% across the month while the T-bill held at 3.60%; the inversion came entirely from the on-chain side.",
      "June 5 was also the month's largest liquidation event: $128.31 million of collateral seized across 1,766 events, 10.25 times the trailing seven-day median, spread across five of the six covered protocols. The chain from there runs mechanically. Forced repayments retire borrow positions, utilization falls, borrow rates slide down the curve, and supply APYs compress behind them. A single day of liquidations set the rate regime for the remaining 25.",
      "For calibration: June's −37 bps is not the deepest print in the captured series. February 2026 reached −151 bps and March −118 bps before April and May recovered toward parity. The prior cycle's month-end readings, May through November 2025, ranged from −19 to −90 bps with two positive prints. June sits near the middle of the prior inverted regime, a reversion to the pre-rally range rather than a continuation of May's recovery.",
    ],
  },
  {
    header: "Where the money went",
    paras: [
      "At spot prices the sector contracted 10.4% in June, from $32.64 billion of total supply to $29.23 billion. At constant prices, holding token prices fixed and counting only quantity, depositors added $1.33 billion. The wedge is mark-to-market: spot ETH fell 21.25% and the four largest liquid restaking tokens fell 20 to 21.3% alongside it. The dollar value of the sector's deposits shrank while the deposited quantity grew, and the second reading is the one that describes behavior.",
      "Aave V3's $845 million breaks down as $452 million of wstETH, $143 million of cbBTC, $104 million of USDTB, and $99 million of USDT, against the $162 million USDC outflow. The assets that arrived are collateral for the sector's largest borrow book; the asset that left is the one priced directly against the T-bill. The daily shape supports accumulation over a single allocation: Aave V3 added quantity on twenty-seven of thirty June days, and the three material outflow days were dominated by USDC leaving alongside wstETH arriving, rotation within the protocol rather than exit from it.",
      "Fluid ran the counter-case. Its USDC supply APY closed June at 6.41%, 281 bps above the T-bill and the sector's only positive real yield on the asset. Its net June inflow was $16 million, against Aave V3's $845 million: 50-to-1 toward the venue paying 41 bps under the risk-free rate on the same asset. At June's prices, the 50-to-1 split is the cleanest available measure of what redemption depth is worth to the marginal depositor.",
    ],
    imageAfterIndex: 1,
    images: ["twitter-promo-aave-wrong-asset-brand.png"],
  },
  {
    header: "Concentration accelerated",
    imageBefore: "twitter-promo-concentration-94-5-brand.png",
    paras: [
      "Aave V3 captured 63.4% of June's net constant-price inflow on 56.7% of sector supply. SparkLend captured 31.1% on 17.2%. Together: 94.5% of the month's inflow into protocols holding 73.9% of the stock, with the remaining four protocols sharing 5.5%.",
      "A protocol whose inflow share matches its stock share is holding position; both of the largest venues ran ahead of theirs, by roughly 7 percentage points at Aave V3 and 14 at SparkLend, in a month when the largest destination paid under the T-bill on USDC. Scale drew the capital that yield did not.",
    ],
  },
  {
    header: "What July will discriminate",
    paras: [
      "Three readings settle whether June's pattern is structural. The Real Yield Spread at July 31, against the late-July FOMC decision: absent a cut, a print between −20 and −60 bps extends the regime; a cut closes the spread from the rate side rather than the on-chain side. Aave V3's share of July inflow: above 50% sustains the consolidation read. Fluid's flow response: USDC APY above 5% with inflow under $50 million keeps the depth-over-rate pattern intact.",
      "The thresholds are falsifiable and stated in advance. Aave V3 below 50% of sector inflow combined with Fluid above $75 million of constant-price flow would break the thesis, and Issue 004 would publish the correction. If the spread closes from the rate side while the flow pattern holds, June's consolidation reads cyclical rather than structural; the July close provides the discriminating datapoint either way.",
    ],
  },
]

const CLOSING_LEAD =
  "The full report, with the daily flow series, six protocol deep dives, and the complete data tables: "
const CLOSING_TAIL = ". Issue 003 of the monthly State of DeFi Lending on Ethereum series."

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
    if (section.imageBefore) children.push(img(section.imageBefore))
    section.paras.forEach((text, i) => {
      children.push(p(text))
      if (section.imageAfterIndex === i && section.images) {
        for (const file of section.images) children.push(img(file))
      }
    })
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
