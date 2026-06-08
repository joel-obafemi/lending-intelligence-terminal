/**
 * Capture screenshots of the on-chain evidence behind the §06.6
 * Sentora-to-Morpho reallocation claim. Run this whenever you want
 * fresh visual proof of:
 *
 *   - The Sentora governor multisig on Etherscan
 *   - Each of the four Sentora-governed Euler V2 vaults (events log)
 *   - Each vault on the Euler app (showing "Risk manager: Sentora")
 *   - Each of the three Sentora MetaMorpho vaults on the Morpho app
 *   - The K3 Capital multisig + foil vaults for the comparison
 *
 *   npm exec tsx scripts/screenshot-sentora-evidence.ts
 *   npm exec tsx scripts/screenshot-sentora-evidence.ts -- --out=tmp/my-evidence
 *
 * Output PNGs land under `tmp/sentora-evidence/` by default (or the
 * directory passed via --out). The pack mirrors the link list in
 * content/snapshots/SENTORA_EVIDENCE_PACK.md so cross-referencing is
 * one-to-one.
 *
 * Notes:
 *   - Etherscan, the Euler app, and the Morpho app are external sites.
 *     Each is rate-limited and may require a one-time consent click on
 *     first visit. The script logs misses so individual URLs can be
 *     re-run by hand.
 *   - Some pages render most of their content behind JS — the script
 *     waits for `domcontentloaded` plus a short hydration pause. If a
 *     specific page renders blank, bump the per-target delay.
 */
import path from "node:path"
import { promises as fs } from "node:fs"

interface Target {
  slug: string
  label: string
  url: string
  delayMs?: number
}

const SENTORA_MULTISIG = "0x9453ee262d7C95955e690AE7aBBD82a08B135685"
const K3_MULTISIG = "0x060DB084bF41872861f175d83f3cb1B5566dfEA3"

const SENTORA_EULER_VAULTS = [
  { symbol: "ePYUSD-6",  address: "0xba98fC35C9dfd69178AD5dcE9FA29c64554783b5" },
  { symbol: "eRLUSD-7",  address: "0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2" },
  { symbol: "eUSDC-80",  address: "0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30" },
  { symbol: "eUSDC-70",  address: "0x9bD52F2805c6aF014132874124686e7b248c2Cbb" },
]

const SENTORA_MORPHO_VAULTS = [
  { symbol: "senRLUSD",     address: "0x71cb2F8038B2C5D65ddc740B2F3268890CD2A89C" },
  { symbol: "senPYUSD",     address: "0x19b3cD7032B8C062E8d44EaCad661a0970DD8c55" },
  { symbol: "senPYUSDcore", address: "0x2C793f5cB25B35A99648783c01E6cCCC200D2096" },
]

const K3_VAULTS = [
  { symbol: "ewstETH-2", address: "0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1" },
  { symbol: "eWBTC-3",   address: "0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4" },
  { symbol: "eUSDC-22",  address: "0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2" },
  { symbol: "eUSDe-6",   address: "0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6" },
]

function buildTargets(): Target[] {
  const t: Target[] = []

  // Sentora multisig
  t.push({
    slug: "00-sentora-multisig-etherscan-overview",
    label: "Sentora multisig — Etherscan overview",
    url: `https://etherscan.io/address/${SENTORA_MULTISIG}`,
  })
  t.push({
    slug: "01-sentora-multisig-etherscan-tokentxns",
    label: "Sentora multisig — Etherscan token transfers",
    url: `https://etherscan.io/address/${SENTORA_MULTISIG}#tokentxns`,
  })
  t.push({
    slug: "02-sentora-multisig-safe-ui",
    label: "Sentora multisig — Safe UI",
    url: `https://app.safe.global/home?safe=eth:${SENTORA_MULTISIG}`,
    delayMs: 6000,
  })

  // Sentora Euler vaults (events tab + Euler app)
  for (const [i, v] of SENTORA_EULER_VAULTS.entries()) {
    const idx = (10 + i * 2).toString().padStart(2, "0")
    t.push({
      slug: `${idx}-sentora-${v.symbol.toLowerCase()}-etherscan-events`,
      label: `Sentora ${v.symbol} — Etherscan events`,
      url: `https://etherscan.io/address/${v.address}#events`,
    })
    const idx2 = (11 + i * 2).toString().padStart(2, "0")
    t.push({
      slug: `${idx2}-sentora-${v.symbol.toLowerCase()}-euler-app`,
      label: `Sentora ${v.symbol} — Euler app (Risk manager badge)`,
      url: `https://app.euler.finance/lend/${v.address}?network=1`,
      delayMs: 6000,
    })
  }

  // Sentora Morpho vaults (Morpho app + Etherscan events)
  for (const [i, v] of SENTORA_MORPHO_VAULTS.entries()) {
    const idx = (30 + i * 2).toString().padStart(2, "0")
    t.push({
      slug: `${idx}-sentora-${v.symbol.toLowerCase()}-morpho-app`,
      label: `Sentora ${v.symbol} — Morpho app (curator field)`,
      url: `https://app.morpho.org/ethereum/vault/${v.address}`,
      delayMs: 6000,
    })
    const idx2 = (31 + i * 2).toString().padStart(2, "0")
    t.push({
      slug: `${idx2}-sentora-${v.symbol.toLowerCase()}-etherscan-events`,
      label: `Sentora ${v.symbol} — Etherscan events`,
      url: `https://etherscan.io/address/${v.address}#events`,
    })
  }

  // K3 Capital comparison
  t.push({
    slug: "40-k3-multisig-etherscan-overview",
    label: "K3 Capital multisig — Etherscan overview",
    url: `https://etherscan.io/address/${K3_MULTISIG}`,
  })
  for (const [i, v] of K3_VAULTS.entries()) {
    const idx = (41 + i).toString().padStart(2, "0")
    t.push({
      slug: `${idx}-k3-${v.symbol.toLowerCase()}-euler-app`,
      label: `K3 ${v.symbol} — Euler app`,
      url: `https://app.euler.finance/lend/${v.address}?network=1`,
      delayMs: 6000,
    })
  }

  return t
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length)
  const outDir = (outArg && path.isAbsolute(outArg))
    ? outArg
    : path.join(process.cwd(), outArg ?? "tmp/sentora-evidence")
  await fs.mkdir(outDir, { recursive: true })

  const { chromium } = await import("playwright")
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1200 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  })
  const page = await ctx.newPage()

  const targets = buildTargets()
  let captured = 0
  for (const target of targets) {
    try {
      console.log(`[sentora] Loading ${target.url}`)
      await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 60_000 })
      await page.waitForTimeout(target.delayMs ?? 3500)
      const outPath = path.join(outDir, `${target.slug}.png`)
      await page.screenshot({ path: outPath, fullPage: false })
      console.log(`[sentora] ${target.label} → ${outPath}`)
      captured++
    } catch (err: any) {
      console.warn(`[sentora] MISS · ${target.slug} · ${err?.message ?? err}`)
    }
  }
  await browser.close()
  console.log(`[sentora] Done · ${captured} / ${targets.length} captured · ${outDir}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
