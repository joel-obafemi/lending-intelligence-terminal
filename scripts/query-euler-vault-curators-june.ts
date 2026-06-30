/**
 * One-shot — identify the governor (curator multisig) behind each Euler
 * V2 vault in the bleeding-vaults list. For Issue 003 §06.6.
 *
 *   npm run query:euler-vault-curators
 *   # or: npx tsx scripts/query-euler-vault-curators.ts
 *
 * Source ladder (final pick: d):
 *   a. Euler public app/index API — checked; every probed URL returned
 *      the SPA shell, no documented JSON endpoint for vault metadata.
 *   b. On-chain enumeration via the EVK GenericFactory — attempted at
 *      0x29a5…cc8e; `getProxyListLength` reverts with "Internal error"
 *      from public RPCs (rate-limit + ABI uncertainty). Rejected.
 *   c. Manually pasted vault addresses + on-chain governorAdmin() reads
 *      — works but requires the user to look up addresses by hand
 *      first. Kept as a fallback when the subgraph is unreachable.
 *   d. Goldsky's public Euler V2 mainnet subgraph (used by the
 *      DefiLlama Yields adapter for vault discovery). The `eulerVaults`
 *      entity carries `symbol`, `evault` (contract address), and
 *      `governonAdmin` (yes, typo in their schema). Public, no key.
 *      Used as the primary path.
 *
 * After resolving vault → governor via subgraph, ENS-reverse-resolves
 * the governor and applies a small hand-maintained known-curator
 * registry. Each row is emitted with its raw address so a reader can
 * always verify on Etherscan.
 *
 * The §06.6 punchline this enables: was the same governor behind
 * multiple bleeding vaults? Aggregated in `governor_concentrations`.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { readFileSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { getAddress, type Address } from "viem"
import { getEthClient } from "../lib/eth-rpc"

// ─── Constants ───────────────────────────────────────────────────────────
const INPUT_PATH = "content/snapshots/2026-06-euler-vault-flows.json"
const OUTPUT_PATH = "content/snapshots/2026-06-euler-vault-curators.json"

// Goldsky public Euler V2 mainnet subgraph (the one DefiLlama uses).
const SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn"

// Hand-maintained registry of well-known Euler V2 curator / operator
// multisigs. Lowercased keys. Best-effort; the script always emits the
// raw address + ENS too so a reader can verify. Each entry is here
// because it was confirmed via the Risk Manager badge on the Euler app's
// vault page (app.euler.finance/lend/<vault>?network=1).
const KNOWN_CURATORS: Record<string, string> = {
  // Sentora — runs Sentora PYUSD + Sentora RLUSD + Sentora USDC clusters.
  // Verified Jun 2026 via app.euler.finance/lend/<ePYUSD-6 / eRLUSD-7 /
  // eUSDC-80 / eUSDC-70>. Same multisig is the #1 Morpho curator
  // ($509.7M / 37.9% share per the May 31 sector snapshot).
  "0x9453ee262d7c95955e690ae7abbd82a08b135685": "Sentora",
  // K3 Capital — runs both K3 Capital Prime Market (volatile collateral:
  // wstETH, WBTC, WETH …) and K3 Capital Yield Market (stables +
  // tokenized strategy collateral: USDC, USDe …). Verified via
  // app.euler.finance/lend/<ewstETH-2 / eWBTC-3 / eWETH-2 / eUSDC-22 /
  // eUSDe-6>. Single Safe (1.4.1) governs both product lines.
  "0x060db084bf41872861f175d83f3cb1b5566dfea3": "K3 Capital",
}

// ─── Input/output types ─────────────────────────────────────────────────
interface FlowsFile {
  top_outflows: Array<{ display_name: string; symbol: string; pool_meta: string | null }>
  top_inflows: Array<{ display_name: string; symbol: string; pool_meta: string | null }>
}

interface CuratorResult {
  /** "EVK Vault eUSDC-80" — verbatim from DefiLlama poolMeta. */
  display_name: string
  /** Underlying-asset DefiLlama symbol (USDC, PYUSD, …). */
  underlying_symbol: string
  /** Suffix used to match subgraph rows (e.g. "eUSDC-80"). */
  expected_symbol: string | null
  category: "outflow" | "inflow"
  vault_address: Address | null
  vault_name: string | null
  governor_admin: Address | null
  /** True when governorAdmin == zero address (vault is finalized). */
  is_finalized: boolean
  governor_ens: string | null
  curator_hint: string | null
  match_status: "ok" | "no_match_in_subgraph" | "subgraph_unreachable"
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** "EVK Vault eUSDC-80"  →  "eUSDC-80"  so it matches subgraph.symbol. */
function expectedSymbolFromPoolMeta(poolMeta: string | null): string | null {
  if (!poolMeta) return null
  const m = poolMeta.match(/^EVK Vault (.+)$/)
  return m ? m[1].trim() : poolMeta.trim()
}

interface SubgraphVault {
  id: string
  evault: string
  name: string
  symbol: string
  governonAdmin: string // sic — Goldsky schema spelling
}

/** Query the subgraph for vaults matching a set of symbols.
 *  Returns null when the subgraph itself errors (network / GraphQL). */
async function querySubgraphBySymbols(
  symbols: string[],
): Promise<SubgraphVault[] | null> {
  const query = /* GraphQL */ `
    query VaultsBySymbol($symbols: [String!]!) {
      eulerVaults(first: 200, where: { symbol_in: $symbols }) {
        id
        evault
        name
        symbol
        governonAdmin
      }
    }
  `
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { symbols } }),
    })
    if (!res.ok) {
      console.error(`Subgraph HTTP ${res.status}`)
      return null
    }
    const body = (await res.json()) as {
      data?: { eulerVaults?: SubgraphVault[] }
      errors?: Array<{ message: string }>
    }
    if (body.errors?.length) {
      console.error(
        "Subgraph errors: " + body.errors.map((e) => e.message).join("; "),
      )
      return null
    }
    return body.data?.eulerVaults ?? []
  } catch (err: any) {
    console.error(`Subgraph fetch failed: ${err?.message ?? err}`)
    return null
  }
}

/** Best-effort ENS reverse-resolve. Silently returns null on RPC error. */
async function reverseResolveEns(address: Address): Promise<string | null> {
  try {
    const name = await getEthClient().getEnsName({ address })
    return name ?? null
  } catch {
    return null
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ─── Read upstream flows JSON ─────────────────────────────────────
  const inPath = join(process.cwd(), INPUT_PATH)
  let flowsFile: FlowsFile
  try {
    flowsFile = JSON.parse(readFileSync(inPath, "utf-8")) as FlowsFile
  } catch (err: any) {
    console.error(`Could not read ${INPUT_PATH}: ${err?.message ?? err}`)
    console.error(`Run \`npm run query:euler-vault-flows\` first.`)
    process.exit(1)
  }

  const wanted: Array<{
    display_name: string
    underlying_symbol: string
    expected_symbol: string | null
    category: "outflow" | "inflow"
  }> = [
    ...flowsFile.top_outflows.map((r) => ({
      display_name: r.display_name,
      underlying_symbol: r.symbol,
      expected_symbol: expectedSymbolFromPoolMeta(r.pool_meta ?? r.display_name),
      category: "outflow" as const,
    })),
    ...flowsFile.top_inflows.map((r) => ({
      display_name: r.display_name,
      underlying_symbol: r.symbol,
      expected_symbol: expectedSymbolFromPoolMeta(r.pool_meta ?? r.display_name),
      category: "inflow" as const,
    })),
  ]

  console.log(
    `Resolving ${wanted.length} vaults via Goldsky subgraph + ENS reverse-resolve…`,
  )
  console.log("")

  // ─── Subgraph query for vault → governor ──────────────────────────
  const symbols = [
    ...new Set(wanted.map((w) => w.expected_symbol).filter((s): s is string => !!s)),
  ]
  console.log(`[1/2] Querying subgraph for ${symbols.length} symbols…`)
  const rows = await querySubgraphBySymbols(symbols)
  if (rows === null) {
    // Subgraph unreachable. Write a stub with explicit reason.
    const results: CuratorResult[] = wanted.map((w) => ({
      display_name: w.display_name,
      underlying_symbol: w.underlying_symbol,
      expected_symbol: w.expected_symbol,
      category: w.category,
      vault_address: null,
      vault_name: null,
      governor_admin: null,
      is_finalized: false,
      governor_ens: null,
      curator_hint: null,
      match_status: "subgraph_unreachable",
    }))
    writeOutput(results)
    console.error(
      "Subgraph unreachable. Re-run when it recovers, or fall back to " +
        "manually pasting vault addresses + on-chain governorAdmin() reads.",
    )
    process.exit(1)
  }
  console.log(`  ${rows.length} matching vaults returned`)

  // Index by symbol for O(1) lookup. Subgraph could return multiple rows
  // per symbol if Euler re-deployed a vault; we keep the first.
  const bySymbol = new Map<string, SubgraphVault>()
  for (const row of rows) {
    const key = row.symbol.toLowerCase()
    if (!bySymbol.has(key)) bySymbol.set(key, row)
  }

  // ─── Resolve each wanted vault, ENS the governor where set ────────
  console.log(`[2/2] ENS reverse-resolving governors…`)
  const results: CuratorResult[] = await Promise.all(
    wanted.map(async (w): Promise<CuratorResult> => {
      if (!w.expected_symbol) {
        return {
          display_name: w.display_name,
          underlying_symbol: w.underlying_symbol,
          expected_symbol: null,
          category: w.category,
          vault_address: null,
          vault_name: null,
          governor_admin: null,
          is_finalized: false,
          governor_ens: null,
          curator_hint: null,
          match_status: "no_match_in_subgraph",
        }
      }
      const row = bySymbol.get(w.expected_symbol.toLowerCase())
      if (!row) {
        return {
          display_name: w.display_name,
          underlying_symbol: w.underlying_symbol,
          expected_symbol: w.expected_symbol,
          category: w.category,
          vault_address: null,
          vault_name: null,
          governor_admin: null,
          is_finalized: false,
          governor_ens: null,
          curator_hint: null,
          match_status: "no_match_in_subgraph",
        }
      }
      // Normalise addresses through viem for EIP-55 checksums.
      const vaultAddr = getAddress(row.evault)
      const govAddr = getAddress(row.governonAdmin)
      const ZERO = "0x0000000000000000000000000000000000000000"
      const isFinalized = govAddr.toLowerCase() === ZERO
      const ens = isFinalized ? null : await reverseResolveEns(govAddr)
      const hint = isFinalized
        ? "finalized — no governor"
        : KNOWN_CURATORS[govAddr.toLowerCase()] ?? null
      return {
        display_name: w.display_name,
        underlying_symbol: w.underlying_symbol,
        expected_symbol: w.expected_symbol,
        category: w.category,
        vault_address: vaultAddr,
        vault_name: row.name,
        governor_admin: govAddr,
        is_finalized: isFinalized,
        governor_ens: ens,
        curator_hint: hint,
        match_status: "ok",
      }
    }),
  )

  writeOutput(results)
  printSummary(results)
}

function writeOutput(results: CuratorResult[]): void {
  const outflows = results.filter((r) => r.category === "outflow")
  const inflows = results.filter((r) => r.category === "inflow")

  // Group outflow vaults by governor — concentration is the §06.6 angle.
  const buckets = new Map<string, CuratorResult[]>()
  for (const r of outflows) {
    if (!r.governor_admin) continue
    const key = r.governor_admin.toLowerCase()
    const list = buckets.get(key) ?? []
    list.push(r)
    buckets.set(key, list)
  }
  const concentrations = [...buckets.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([governor, list]) => ({
      governor,
      governor_ens: list[0].governor_ens,
      curator_hint: list[0].curator_hint,
      vault_count: list.length,
      vaults: list.map((r) => r.display_name),
    }))
    .sort((a, b) => b.vault_count - a.vault_count)

  const output = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    issue: "002 §06.6 (curator-concentration analysis)",
    source: {
      input: INPUT_PATH,
      subgraph: SUBGRAPH_URL,
      method:
        "Goldsky public Euler V2 mainnet subgraph → eulerVaults → governonAdmin; " +
        "ENS reverse-resolved via mainnet RPC.",
      caveat:
        "governonAdmin is the vault's GOVERNOR multisig, NOT the depositor. " +
        "A shared governor across two outflowing vaults means one operator " +
        "controls those vaults' risk parameters — strong signal that the " +
        "outflows are correlated, but not proof a single LP withdrew.",
    },
    outflow_vault_curators: outflows,
    inflow_vault_curators: inflows,
    governor_concentrations: concentrations,
  }
  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n")
  console.log("")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

function fmtAddr(addr: Address | string | null): string {
  if (!addr) return "—".padEnd(13)
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function printSummary(results: CuratorResult[]): void {
  const outflows = results.filter((r) => r.category === "outflow")
  const inflows = results.filter((r) => r.category === "inflow")

  console.log("")
  console.log("── Outflow vault governors ─────────────────────────────────")
  for (const r of outflows) {
    const label =
      r.curator_hint ?? r.governor_ens ?? (r.governor_admin ? "(unlabeled)" : "—")
    console.log(
      `  ${r.display_name.padEnd(26)}  ` +
        `vault=${fmtAddr(r.vault_address)}  ` +
        `gov=${fmtAddr(r.governor_admin)}  ` +
        `${label}  [${r.match_status}]`,
    )
  }
  console.log("")
  console.log("── Inflow vault governors ──────────────────────────────────")
  for (const r of inflows) {
    const label =
      r.curator_hint ?? r.governor_ens ?? (r.governor_admin ? "(unlabeled)" : "—")
    console.log(
      `  ${r.display_name.padEnd(26)}  ` +
        `vault=${fmtAddr(r.vault_address)}  ` +
        `gov=${fmtAddr(r.governor_admin)}  ` +
        `${label}  [${r.match_status}]`,
    )
  }

  // Concentration recap.
  const buckets = new Map<string, CuratorResult[]>()
  for (const r of outflows) {
    if (!r.governor_admin) continue
    const key = r.governor_admin.toLowerCase()
    buckets.set(key, [...(buckets.get(key) ?? []), r])
  }
  const concentrations = [...buckets.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
  console.log("")
  console.log("── Governor concentration across outflow vaults ───────────")
  if (concentrations.length === 0) {
    console.log(
      "  No single governor controlled more than one of the top outflow " +
        "vaults. The bleeders are governance-distinct.",
    )
  } else {
    for (const [governor, list] of concentrations) {
      const label =
        list[0].curator_hint ?? list[0].governor_ens ?? "(unlabeled)"
      console.log(
        `  ${list.length}× governed by ${governor} (${label}) → ` +
          list.map((r) => r.display_name).join(", "),
      )
    }
    console.log("")
    console.log(
      "  → Story: governance is concentrated across the bleeders. Worth " +
        "reaching out to that operator or auditing their public statements " +
        "before the issue ships.",
    )
  }
  console.log("")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
