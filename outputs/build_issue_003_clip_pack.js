// Issue 003 clip pack: fourteen clips across two voices.
//
//   node outputs/build_issue_003_clip_pack.js
//   -> content/reports/distribution/Issue_003_Clip_Pack_Consolidation.docx
//
// Section A: Joel's personal X profile (first person, show-your-work,
// plain-language teach on technical terms, warm and direct).
// Section B: Datum Labs X profile (declarative, third person,
// snapshot-dated figures, analytical register).
// All findings adapted from content/reports/2026-06-june.mdx; no new claims.

const fs = require("fs")
const path = require("path")
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ShadingType } = require("docx")

const REPO = path.resolve(__dirname, "..")
const OUT = path.join(REPO, "content/reports/distribution/Issue_003_Clip_Pack_Consolidation.docx")

const REPORT_URL = "https://lending-intelligence-terminal.vercel.app/reports/2026-06-june"

const BODY = { font: "Georgia", size: 22 } // 11pt

const SECTION_A = {
  title: "Section A: Personal X profile (Joel's voice)",
  notes:
    "First person, show-your-work cadence, plain-language teach on technical terms at first use. Warm and direct, not stiff. Post as standalone tweets or as a thread in this order.",
  clips: [
    {
      id: "A.1",
      title: "Opening tweet: the paradox in one sentence",
      text:
        "Aave V3 grew $845 million in June. Almost none of it was USDC. USDC on Aave V3 actually fell $162 million.\n\nWhat arrived was collateral: wstETH, cbBTC, and stablecoins that aren't USDC.\n\nThat tells us something important about who's still active on the biggest lending protocol on Ethereum. New report out now.",
    },
    {
      id: "A.2",
      title: "Sector story: shrank in dollars, grew in tokens",
      text:
        "On paper, DeFi lending on Ethereum shrank $3.4 billion in June. But when I broke down the numbers, depositors actually ADDED $1.33 billion worth of tokens across the six major protocols.\n\nThe gap is just prices: ETH fell 21% and dragged the dollar value of collateral down with it. Hold prices fixed and count tokens, and five of six protocols grew. Only Euler V2 saw outflow, and a small one at $21 million.",
      attach: "twitter-promo-sector-paradox.png",
    },
    {
      id: "A.3",
      title: "Aave V3 wrong-asset finding",
      text:
        "The $845 million that flowed into Aave V3 in June wasn't chasing yield. It couldn't have been: Aave paid 41 bps LESS than a US T-bill on USDC all month.\n\nThe inflow list: $452M wstETH, $143M cbBTC, $104M USDTB, $99M USDT. That's collateral, not savings. People post collateral where they can borrow deepest, and no venue has a deeper borrow book than Aave. The growth is the borrow side pulling assets in.",
      attach: "twitter-promo-aave-wrong-asset.png",
    },
    {
      id: "A.4",
      title: "Fluid rate leadership and the 50-to-1 ratio",
      text:
        "Here's the strongest single signal in the June data.\n\nFluid paid 6.41% on USDC, a full 281 bps ABOVE the T-bill and the only positive real yield on USDC in the sector. Aave V3 paid 3.19%, 41 bps below.\n\nFlow: Fluid took in $16 million. Aave took in $845 million. That's 50-to-1 in favor of the venue paying less. Depth beats rate right now, and it isn't close.",
    },
    {
      id: "A.5",
      title: "Morpho methodology correction (personal and honest)",
      text:
        "Worth flagging: we got Morpho's concentration wrong in Issue 002, and the June report corrects it.\n\nOur May reading (HHI 3,103, top three curators at 93.9%; HHI is a standard concentration score, lower means less concentrated) only counted V1 vaults. Morpho runs two vault systems in parallel, and V2 was already the bigger one. Count both and Morpho is LESS concentrated than we reported, not more: HHI 2,095, top three at 74.6%. Sentora is still the largest curator.\n\nCorrections are part of the job. The thresholds are in the report so you can check our work.",
    },
    {
      id: "A.6",
      title: "June 5 liquidation mechanism",
      text:
        "The Real Yield Spread printed positive on June 4. One day later it flipped, and it stayed negative for the rest of the month.\n\nJune 5 is why: $128 million of collateral got liquidated across the sector in a single day, about 10x the trailing week's median. Forced repayments retire loans, utilization drops, borrow rates fall, and deposit yields compress right behind them. One bad day for borrowers set the yield regime for the month.",
    },
    {
      id: "A.7",
      title: "Closing and report link",
      text:
        `Full breakdown of June's DeFi lending picture is live: the yield inversion, where the $1.33 billion went, the Morpho correction, and what we're watching for July. Charts, tables, everything.\n\n${REPORT_URL}`,
    },
  ],
}

const SECTION_B = {
  title: "Section B: Datum Labs X profile (agency voice)",
  notes:
    "Declarative, third person, snapshot-dated figures. Emphasis on the finding, not the analyst. Post as standalone tweets or as a launch thread in this order.",
  clips: [
    {
      id: "B.1",
      title: "Opening",
      text:
        "Datum Labs Issue 003 is live. The June 2026 reading across Ethereum's six largest lending protocols: consolidation under yield compression.\n\nAave V3 grew $845 million while its USDC book contracted. The Real Yield Spread closed at −37.1 bps. Two protocols absorbed 94.5% of sector inflow.",
      attach: "twitter-promo-concentration-94-5.png",
    },
    {
      id: "B.2",
      title: "Sector +$1.33B",
      text:
        "Sector constant-price flow, June 2026: +$1.33 billion across six protocols, five positive.\n\nAave V3 +$845M. SparkLend +$415M. Compound V3 +$59M. Morpho +$20M. Fluid +$16M. Euler V2 −$21M.\n\nNominal supply fell $3.41 billion across the same window. The wedge is mark-to-market on ETH-family collateral, not depositor exit.",
      attach: "twitter-promo-sector-paradox.png",
    },
    {
      id: "B.3",
      title: "Aave V3 composition",
      text:
        "Aave V3's June inflow arrived as collateral, not stablecoin yield-seeking.\n\nComposition of the +$845M at constant prices: wstETH +$452M, cbBTC +$143M, USDTB +$104M, USDT +$99M. USDC: −$162M.\n\nThe protocol's USDC supply APY ran 41 bps below the 4-week T-bill through June.",
      attach: "twitter-promo-aave-wrong-asset.png",
    },
    {
      id: "B.4",
      title: "Fluid rate leadership",
      text:
        "Fluid closed June 2026 as the sector's only positive real yield spread on USDC: 6.41% supply APY, 281 bps above the 4-week T-bill.\n\nNet constant-price inflow for the month: $16 million, against Aave V3's $845 million protocol total. Rate leadership did not convert to scale flow in June.",
    },
    {
      id: "B.5",
      title: "Morpho methodology correction (agency voice)",
      text:
        "Datum Labs Issue 003 files an erratum on Issue 002's Morpho curator reading.\n\nThe May 31 figure (HHI 3,103, top-three share 93.9%) measured the V1 vault system only. Measured across V1 and V2 combined, June 30 reads HHI 2,095 with a top-three share of 74.6%; May 31 re-measured reads 2,144. Morpho's curator layer is less concentrated than previously reported. Forward readings run on the combined methodology.",
    },
    {
      id: "B.6",
      title: "June 5 as trigger",
      text:
        "June 5, 2026: $128.31 million of collateral seized across 1,766 liquidation events, 10.25 times the trailing seven-day median, distributed across five of six covered protocols.\n\nThe mechanical trigger for the June Real Yield Spread inversion. The spread printed +42.0 bps on June 4 and stayed negative from June 5 through month-end.",
    },
    {
      id: "B.7",
      title: "Closing and report link",
      text:
        "Issue 003, State of DeFi Lending on Ethereum, June 2026: six protocol deep dives, the LRT reprice decomposition, and six falsifiable calls for July.\n\nFull analysis at datumlab.xyz.",
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
            "Fourteen clips across two voices for the June 2026 report. Section A runs on the personal profile, Section B on the Datum Labs profile. Both cover the same findings in different registers; character counts and card attachments noted under each clip. Promo cards live in public/reports/charts-social/.",
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
    const total = SECTION_A.clips.length + SECTION_B.clips.length
    console.log(`wrote ${OUT} (${(buf.length / 1024).toFixed(1)} KB, ${total} clips)`)
  })
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
