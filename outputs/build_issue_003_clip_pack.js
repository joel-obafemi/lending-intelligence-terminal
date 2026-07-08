// Issue 003 clip pack: twelve clips across two voices (Pass 5 rebuild).
//
//   node outputs/build_issue_003_clip_pack.js
//   -> content/reports/distribution/Issue_003_Clip_Pack_Consolidation.docx
//
// Voice: analyst register on both sections. Numbers front-loaded,
// snapshot-dated, interpretation embedded in the composition of the
// figures rather than stated as a separate wrap. No first-person plural,
// no all-caps emphasis, no reveal setups. The Morpho methodology clips
// were dropped in Pass 5; that correction stays in the report body only.
// All findings adapted from content/reports/2026-06-june.mdx; no new claims.

const fs = require("fs")
const path = require("path")
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ShadingType } = require("docx")

const REPO = path.resolve(__dirname, "..")
const OUT = path.join(REPO, "content/reports/distribution/Issue_003_Clip_Pack_Consolidation.docx")

const REPORT_URL = "https://lending-intelligence-terminal.vercel.app/reports/2026-06-june"

const BODY = { font: "Georgia", size: 22 } // 11pt

const SECTION_A = {
  title: "Section A: Personal X profile",
  notes:
    "Personal profile, analyst register. Post as standalone tweets or as a thread in this order.",
  clips: [
    {
      id: "A.1",
      title: "Opening: the paradox stated directly",
      text:
        "Aave V3 added $845 million of net deposits in June. Its USDC book fell $162 million over the same month.\n\nThe inflow was wstETH, cbBTC, and non-USDC stablecoins: collateral for the deepest borrow book on Ethereum, arriving while the headline USDC rate paid 41 bps under the T-bill.\n\nNew report out now.",
    },
    {
      id: "A.2",
      title: "Sector: both readings true at once",
      text:
        "June's sector numbers, both true at once: total supply down $3.41 billion at spot prices, depositor quantity up $1.33 billion at constant prices.\n\nETH fell 21% and repriced every ETH-family collateral position. Five of six protocols grew in token terms. Euler V2 was the exception at −$21 million, spread across dozens of small vaults.",
      attach: "twitter-promo-sector-paradox.png",
    },
    {
      id: "A.3",
      title: "Aave V3 composition",
      text:
        "Composition of Aave V3's +$845M June inflow: wstETH +$452M, cbBTC +$143M, USDTB +$104M, USDT +$99M. USDC: −$162M.\n\nThe protocol paid 3.19% on USDC against a 3.60% T-bill all month. The deposits that arrived are borrow-side collateral; the deposits that left were the ones the rate comparison actually touches.",
      attach: "twitter-promo-aave-wrong-asset.png",
    },
    {
      id: "A.4",
      title: "Fluid and the 50-to-1 split",
      text:
        "Fluid paid 6.41% on USDC in June, 281 bps over the 4-week T-bill and the sector's only positive real yield on the asset. Net June inflow: $16 million.\n\nAave V3 paid 41 bps under the same T-bill and drew $845 million.\n\nA 50-to-1 split toward the lower rate puts a number on what redemption depth is worth.",
    },
    {
      id: "A.6",
      title: "June 5 liquidation mechanism",
      text:
        "The Real Yield Spread printed +42 bps on June 4 and went negative on June 5, where it stayed through month-end.\n\nSame day: $128 million of collateral liquidated sector-wide, 10x the trailing-week median. Forced repayments cut utilization, borrow rates slid down the curve, and deposit yields followed. One day set the month's rate regime.",
    },
    {
      id: "A.7",
      title: "Closing and report link",
      text:
        `June's full picture is live: the re-inverted yield spread, $1.33 billion of constant-price inflow and where it landed, the LRT repricing, and the July thresholds that would falsify the read. Charts and tables throughout.\n\n${REPORT_URL}`,
    },
  ],
}

const SECTION_B = {
  title: "Section B: Datum Labs X profile",
  notes:
    "Agency profile: declarative, third person, snapshot-dated figures. Post as standalone tweets or as a launch thread in this order.",
  clips: [
    {
      id: "B.1",
      title: "Opening",
      text:
        "Datum Labs Issue 003 is live. June 2026 across Ethereum's six largest lending protocols: consolidation under yield compression.\n\nAave V3 grew $845 million while its USDC book contracted; the Real Yield Spread closed at −37.1 bps; two protocols absorbed 94.5% of sector inflow.",
      attach: "twitter-promo-concentration-94-5.png",
    },
    {
      id: "B.2",
      title: "Sector +$1.33B",
      text:
        "Sector constant-price flow, June 2026: +$1.33 billion, five of six protocols positive.\n\nAave V3 +$845M. SparkLend +$415M. Compound V3 +$59M. Morpho +$20M. Fluid +$16M. Euler V2 −$21M.\n\nNominal supply fell $3.41 billion over the same window; the gap is mark-to-market on ETH-family collateral.",
      attach: "twitter-promo-sector-paradox.png",
    },
    {
      id: "B.3",
      title: "Aave V3 composition",
      text:
        "Aave V3's June inflow by asset, constant prices: wstETH +$452M, cbBTC +$143M, USDTB +$104M, USDT +$99M, USDC −$162M.\n\nUSDC supply APY ran 41 bps below the 4-week T-bill through the month. The book that grew is collateral against the sector's largest borrow market.",
      attach: "twitter-promo-aave-wrong-asset.png",
    },
    {
      id: "B.4",
      title: "Fluid rate leadership",
      text:
        "Fluid closed June 2026 with the sector's only positive real yield spread on USDC: 6.41% supply APY, 281 bps above the 4-week T-bill.\n\nNet constant-price inflow for the month: $16 million, against $845 million at Aave V3. Rate leadership did not convert to scale flow.",
    },
    {
      id: "B.6",
      title: "June 5 as trigger",
      text:
        "June 5, 2026: $128.31 million of collateral seized across 1,766 liquidation events, 10.25x the trailing seven-day median, distributed across five of six covered protocols.\n\nThe Real Yield Spread printed +42.0 bps on June 4 and held negative from June 5 through month-end.",
    },
    {
      id: "B.7",
      title: "Closing and report link",
      text:
        "Issue 003, State of DeFi Lending on Ethereum, June 2026: six protocol deep dives, the LRT reprice decomposition, and falsifiable calls for July.\n\nFull analysis at datumlab.xyz.",
    },
  ],
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ font: "Georgia", size: 32, bold: true, color: "0E1B2C", text })],
    spacing: { before: 400, after: 200 },
  })
}

function clipBlock(clip) {
  const paras = [
    new Paragraph({
      children: [
        new TextRun({ ...BODY, bold: true, color: "C5511A", text: `${clip.id}  ` }),
        new TextRun({ ...BODY, bold: true, text: clip.title }),
      ],
      spacing: { before: 280, after: 120 },
    }),
  ]
  for (const line of clip.text.split("\n\n")) {
    paras.push(
      new Paragraph({
        children: [new TextRun({ ...BODY, text: line })],
        indent: { left: 360 },
        shading: { type: ShadingType.CLEAR, fill: "F7F4ED" },
        spacing: { after: 120 },
      })
    )
  }
  const meta = [`${clip.text.length} characters`]
  if (clip.attach) meta.push(`attach: ${clip.attach}`)
  paras.push(
    new Paragraph({
      children: [new TextRun({ ...BODY, size: 18, italics: true, color: "595959", text: meta.join("  ·  ") })],
      indent: { left: 360 },
      spacing: { after: 160 },
    })
  )
  return paras
}

function build() {
  const children = [
    new Paragraph({
      children: [
        new TextRun({
          font: "Georgia",
          size: 40,
          bold: true,
          color: "0E1B2C",
          text: "Issue 003 Clip Pack: Consolidation Under Yield Compression",
        }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          ...BODY,
          italics: true,
          color: "404040",
          text:
            "Twelve clips across two profiles for the June 2026 report. Section A runs on the personal profile, Section B on the Datum Labs profile. Character counts and card attachments noted under each clip. Promo cards live in public/reports/charts-social/.",
        }),
      ],
      spacing: { after: 240 },
    }),
  ]

  for (const section of [SECTION_A, SECTION_B]) {
    children.push(h1(section.title))
    children.push(
      new Paragraph({
        children: [new TextRun({ ...BODY, italics: true, color: "595959", text: section.notes })],
        spacing: { after: 160 },
      })
    )
    for (const clip of section.clips) {
      children.push(...clipBlock(clip))
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(OUT, buf)
    const clips = [...SECTION_A.clips, ...SECTION_B.clips]
    const lens = clips.map((c) => c.text.length)
    console.log(
      `wrote ${OUT} (${(buf.length / 1024).toFixed(1)} KB, ${clips.length} clips, ` +
        `chars ${Math.min(...lens)}-${Math.max(...lens)})`
    )
  })
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
