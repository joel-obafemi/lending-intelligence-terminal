/**
 * One-shot — resolve the governor (curator multisig) behind each active
 * Euler V2 (EVK) Ethereum vault, and aggregate curator concentration.
 * For Issue 004 §06.6.
 *
 *   npm run query:euler-vault-curators-july
 *   # or: npx tsx scripts/query-euler-vault-curators-july.ts
 *
 * ── Why on-chain (methodology: on_chain_governorAdmin) ──────────────────
 * The prior version resolved vault → governor via Goldsky's public Euler V2
 * subgraph. That endpoint has been persistently HTTP 404, and on-chain reads
 * are more authoritative anyway. This version derives everything from the
 * EVK GenericFactory + per-vault `governorAdmin()`:
 *
 *   1. Read the vault set the July capture already discovered
 *      (content/snapshots/2026-07-euler-vault-flows.json → all_pools), with
 *      per-vault supply USD (current_tvl_usd) and MoM flow deltas.
 *   2. Enumerate every EVK vault via the GenericFactory
 *      (getProxyListLength + getProxyListSlice), then multicall symbol() and
 *      name() so each DefiLlama poolMeta ("EVK Vault eUSDC-80") maps back to
 *      its on-chain vault address.
 *   3. multicall governorAdmin() for the matched vaults. Zero address ⇒ the
 *      vault is finalized (no governor).
 *   4. Label each governor via a hand-maintained known-curator registry,
 *      falling back to ENS reverse-resolution, else curator_name: null with
 *      the raw governor address preserved for verification.
 *   5. Aggregate per governor: vault count, total supply USD, share of the
 *      resolved Euler V2 TVL, plus an HHI over curator shares.
 *
 * If Goldsky ever recovers we still prefer this on-chain path — the subgraph
 * was only ever useful for the name mapping, which we now maintain ourselves.
 *
 * Labeling caveat: governorAdmin is the vault's GOVERNOR multisig, not the
 * depositor. We NEVER guess a name for an unrecognised governor (a Safe owned
 * by an unknown party stays curator_name: null); better an honest null than a
 * fabricated attribution.
 */
import * as dotenv from "dotenv"
dotenv.config()

import { readFileSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  type Address,
  type PublicClient,
} from "viem"
import { mainnet } from "viem/chains"
import { getEthClient } from "../lib/eth-rpc"

// ─── Constants ───────────────────────────────────────────────────────────
const INPUT_PATH = "content/snapshots/2026-07-euler-vault-flows.json"
const OUTPUT_PATH = "content/snapshots/2026-07-euler-vault-curators.json"

// EVK GenericFactory (Ethereum mainnet) — every EVK vault is a proxy it
// deployed. https://github.com/euler-xyz/euler-vault-kit
const GENERIC_FACTORY = "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e" as Address
const ZERO = "0x0000000000000000000000000000000000000000"

// Dedicated RPC chain. ETH_RPC_URL (Alchemy) is prepended when set — it reads
// the GenericFactory + EVK vaults cleanly where Ankr returns "Internal error".
const PUBLIC_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.merkle.io",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
]

// Hand-maintained registry of well-known Euler V2 governor multisigs.
// Lowercased keys. Each entry is here only because it was confirmed — via the
// Risk Manager badge on app.euler.finance/lend/<vault>?network=1, or an
// unambiguous ENS. The script always emits the raw governor address too, so a
// reader can verify on Etherscan. DO NOT add an entry you cannot confirm.
const KNOWN_CURATORS: Record<string, string> = {
  // Sentora — #1 Euler curator by TVL; also #1 Morpho curator. Governs the
  // Sentora USDC / PYUSD / RLUSD clusters (eUSDC-70, eUSDC-80, ePYUSD-6,
  // eRLUSD-7, …). Confirmed via app.euler.finance vault pages.
  "0x9453ee262d7c95955e690ae7abbd82a08b135685": "Sentora",
  // K3 Capital — runs both the K3 Prime (volatile collateral) and K3 Yield
  // (stables) product lines from a single Safe (eWETH-2, ewstETH-2, eUSDC-22,
  // etETH-3, …). Confirmed via app.euler.finance vault pages.
  "0x060db084bf41872861f175d83f3cb1b5566dfea3": "K3 Capital",
  // 0x81ad394C0Fa87e99Ca46E1aca093BEe020f203f4 — 9.3% of curated TVL, 3rd
  // largest. Governs 4 vaults, ALL Usual assets (eUSD0-4, eUSD0-6, eUSD0++-3,
  // ePT-USD0++-27NOV2025-1) — i.e. Usual's "Stability Loan" market on Euler.
  // Governor org identity UNVERIFIED at Aug 2026 (contract, no ENS, no
  // Etherscan nametag retrievable, Euler app is an SPA shell): could be Usual's
  // own multisig or a delegated risk curator (Re7 Labs / MEV Capital are the
  // Euler USD0 candidates). Left null per the no-guess rule; revisit Issue 005.
}

// ─── Input types (subset of the flows file we read) ──────────────────────
interface FlowPool {
  pool_id: string
  display_name: string
  symbol: string
  pool_meta: string | null
  underlying_token: string | null
  current_tvl_usd: number | null
  abs_delta_usd: number | null
  pct_delta: number | null
}
interface FlowsFile {
  all_pools?: FlowPool[]
  top_outflows?: Array<{ display_name: string }>
  top_inflows?: Array<{ display_name: string }>
}

// ─── viem client (multicall enabled for the enumeration) ─────────────────
function makeClient(): PublicClient {
  const override = process.env.ETH_RPC_URL?.trim()
  const urls = override ? [override, ...PUBLIC_RPCS] : PUBLIC_RPCS
  return createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((u) => http(u, { timeout: 30_000, retryCount: 1, retryDelay: 400 })),
      { rank: false },
    ),
    batch: { multicall: true },
  })
}

const factoryAbi = [
  { name: "getProxyListLength", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getProxyListSlice", type: "function", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "address[]" }] },
] as const

const vaultAbi = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "governorAdmin", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────

/** "EVK Vault eUSDC-80" → "eUSDC-80"; otherwise the trimmed meta itself. */
function extractVaultSymbol(poolMeta: string | null): string | null {
  if (!poolMeta) return null
  const m = poolMeta.match(/^EVK Vault (.+)$/)
  return m ? m[1].trim() : poolMeta.trim()
}

/** Run a multicall in address-count chunks so no single aggregate call gets
 *  oversized on the RPC. */
async function multicallChunked<T>(
  client: PublicClient,
  contracts: readonly { address: Address; abi: any; functionName: string }[],
  chunk = 250,
): Promise<Array<{ status: "success" | "failure"; result?: T }>> {
  const out: Array<{ status: "success" | "failure"; result?: T }> = []
  for (let i = 0; i < contracts.length; i += chunk) {
    const slice = contracts.slice(i, i + chunk)
    const res = (await client.multicall({ contracts: slice as any, allowFailure: true })) as any[]
    out.push(...res)
  }
  return out
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "       —"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}
function fmtAddr(a: string | null): string {
  if (!a) return "—"
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const inPath = join(process.cwd(), INPUT_PATH)
  let flows: FlowsFile
  try {
    flows = JSON.parse(readFileSync(inPath, "utf-8")) as FlowsFile
  } catch (err: any) {
    console.error(`Could not read ${INPUT_PATH}: ${err?.message ?? err}`)
    console.error("Run `npm run query:euler-vault-flows-july` first.")
    process.exit(1)
  }
  const pools = flows.all_pools ?? []
  if (pools.length === 0) {
    console.error(`${INPUT_PATH} has no all_pools[] — nothing to resolve.`)
    process.exit(1)
  }
  const outflowNames = new Set((flows.top_outflows ?? []).map((r) => r.display_name))
  const inflowNames = new Set((flows.top_inflows ?? []).map((r) => r.display_name))

  console.log(`Euler V2 curators via on-chain governorAdmin() — ${pools.length} active vaults`)
  console.log("")

  const client = makeClient()

  // ─── [1/4] Enumerate every EVK vault via the GenericFactory ────────────
  console.log("[1/4] Enumerating EVK vaults via GenericFactory …")
  const len = Number(
    await client.readContract({ address: GENERIC_FACTORY, abi: factoryAbi, functionName: "getProxyListLength" }),
  )
  const allVaults = (await client.readContract({
    address: GENERIC_FACTORY,
    abi: factoryAbi,
    functionName: "getProxyListSlice",
    args: [0n, BigInt(len)],
  })) as Address[]
  console.log(`  ${allVaults.length} EVK vault proxies deployed`)

  // ─── [2/4] Read symbol() + name() → build lookup maps ──────────────────
  console.log("[2/4] Reading symbol() + name() for all proxies …")
  const symCalls = allVaults.map((a) => ({ address: a, abi: vaultAbi, functionName: "symbol" as const }))
  const nameCalls = allVaults.map((a) => ({ address: a, abi: vaultAbi, functionName: "name" as const }))
  const [symRes, nameRes] = await Promise.all([
    multicallChunked<string>(client, symCalls),
    multicallChunked<string>(client, nameCalls),
  ])
  const addrBySymbol = new Map<string, Address>()
  const addrByName = new Map<string, Address>()
  allVaults.forEach((addr, i) => {
    const s = symRes[i]
    const n = nameRes[i]
    if (s?.status === "success" && typeof s.result === "string") {
      const k = s.result.toLowerCase()
      if (!addrBySymbol.has(k)) addrBySymbol.set(k, addr)
    }
    if (n?.status === "success" && typeof n.result === "string") {
      const k = n.result.toLowerCase()
      if (!addrByName.has(k)) addrByName.set(k, addr)
    }
  })
  console.log(`  resolved symbol() for ${addrBySymbol.size}, name() for ${addrByName.size}`)

  // ─── [3/4] Match each active pool → vault address, read governorAdmin ──
  console.log("[3/4] Matching pools + reading governorAdmin() …")
  interface Matched {
    pool: FlowPool
    expected_symbol: string | null
    vault_address: Address | null
    category: "outflow" | "inflow" | "other"
  }
  const matched: Matched[] = pools.map((p) => {
    const sym = extractVaultSymbol(p.pool_meta ?? p.display_name)
    let addr: Address | null = null
    if (sym) addr = addrBySymbol.get(sym.toLowerCase()) ?? null
    // Fallback: match the raw poolMeta against on-chain name() (catches
    // branded meta like "K3 Capital Earn USDC" that isn't "EVK Vault eX-N").
    if (!addr && p.pool_meta) addr = addrByName.get(p.pool_meta.toLowerCase()) ?? null
    const category = outflowNames.has(p.display_name)
      ? ("outflow" as const)
      : inflowNames.has(p.display_name)
        ? ("inflow" as const)
        : ("other" as const)
    return { pool: p, expected_symbol: sym, vault_address: addr, category }
  })

  const resolvable = matched.filter((m) => m.vault_address)
  const govCalls = resolvable.map((m) => ({
    address: m.vault_address as Address,
    abi: vaultAbi,
    functionName: "governorAdmin" as const,
  }))
  const govRes = await multicallChunked<string>(client, govCalls)
  const govByVault = new Map<string, Address | null>()
  resolvable.forEach((m, i) => {
    const r = govRes[i]
    govByVault.set(
      (m.vault_address as Address).toLowerCase(),
      r?.status === "success" && typeof r.result === "string" ? getAddress(r.result) : null,
    )
  })
  console.log(`  matched ${resolvable.length}/${pools.length} pools to vault addresses`)

  // ─── [4/4] ENS reverse-resolve distinct non-zero governors ─────────────
  console.log("[4/4] ENS reverse-resolving distinct governors …")
  const distinctGovs = [
    ...new Set(
      [...govByVault.values()]
        .filter((g): g is Address => !!g && g.toLowerCase() !== ZERO)
        .map((g) => g.toLowerCase()),
    ),
  ]
  const ensByGov = new Map<string, string | null>()
  const ec = getEthClient()
  for (const g of distinctGovs) {
    try {
      ensByGov.set(g, await ec.getEnsName({ address: getAddress(g) }))
    } catch {
      ensByGov.set(g, null)
    }
  }

  // ─── Per-vault rows ────────────────────────────────────────────────────
  function labelFor(govLc: string | null, finalized: boolean): string | null {
    if (finalized) return "finalized — no governor"
    if (!govLc) return null
    return KNOWN_CURATORS[govLc] ?? ensByGov.get(govLc) ?? null
  }
  const perVault = matched.map((m) => {
    const addrLc = m.vault_address ? (m.vault_address as Address).toLowerCase() : null
    const gov = addrLc ? govByVault.get(addrLc) ?? null : null
    const govLc = gov ? gov.toLowerCase() : null
    const finalized = govLc === ZERO
    return {
      display_name: m.pool.display_name,
      underlying_symbol: m.pool.symbol,
      expected_symbol: m.expected_symbol,
      category: m.category,
      vault_address: m.vault_address,
      governor_address: gov && !finalized ? gov : finalized ? ZERO : null,
      governor_ens: govLc && !finalized ? ensByGov.get(govLc) ?? null : null,
      curator_name: labelFor(govLc, finalized),
      is_finalized: finalized,
      supply_usd: m.pool.current_tvl_usd ?? 0,
      mom_flow_usd: m.pool.abs_delta_usd ?? null,
      mom_flow_pct: m.pool.pct_delta ?? null,
      match_status: m.vault_address ? "ok" : "no_onchain_match",
    }
  })

  // ─── Aggregate per governor (curator concentration) ────────────────────
  const totalResolvedSupply = perVault
    .filter((v) => v.vault_address && !v.is_finalized)
    .reduce((s, v) => s + v.supply_usd, 0)
  const buckets = new Map<
    string,
    { governor_address: string; curator_name: string | null; governor_ens: string | null; vaults: string[]; supply: number }
  >()
  for (const v of perVault) {
    if (!v.governor_address || v.is_finalized) continue
    const k = v.governor_address.toLowerCase()
    const b = buckets.get(k) ?? {
      governor_address: v.governor_address,
      curator_name: v.curator_name,
      governor_ens: v.governor_ens,
      vaults: [],
      supply: 0,
    }
    b.vaults.push(v.display_name)
    b.supply += v.supply_usd
    buckets.set(k, b)
  }
  const curators = [...buckets.values()]
    .map((b) => ({
      curator_name: b.curator_name,
      governor_address: b.governor_address,
      governor_ens: b.governor_ens,
      vault_count: b.vaults.length,
      total_supply_usd: b.supply,
      share_pct: totalResolvedSupply > 0 ? Number(((b.supply / totalResolvedSupply) * 100).toFixed(2)) : null,
      vaults: b.vaults,
    }))
    .sort((a, b) => b.total_supply_usd - a.total_supply_usd)

  const hhi = curators.reduce((s, c) => s + (c.share_pct ?? 0) ** 2, 0)
  const top3Share = curators.slice(0, 3).reduce((s, c) => s + (c.share_pct ?? 0), 0)
  const labeledCurators = curators.filter((c) => c.curator_name).length
  const labeledVaults = perVault.filter((v) => v.curator_name && !v.is_finalized).length
  const resolvableVaults = perVault.filter((v) => v.vault_address && !v.is_finalized).length
  const unmatched = perVault.filter((v) => !v.vault_address)

  // ─── Write JSON ────────────────────────────────────────────────────────
  const output = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    issue: "004 §06.6 (Euler curator-concentration analysis)",
    methodology: "on_chain_governorAdmin",
    source: {
      input: INPUT_PATH,
      generic_factory: GENERIC_FACTORY,
      method:
        "EVK GenericFactory getProxyListSlice → per-vault symbol()/name() to map DefiLlama poolMeta to vault address → governorAdmin() per vault → ENS reverse-resolve + hand-maintained known-curator registry. No Goldsky dependency.",
      caveat:
        "governorAdmin is the vault's GOVERNOR multisig, NOT the depositor. curator_name is null where the governor is neither in the known registry nor ENS-resolvable — the raw governor_address is always preserved for verification. Names are never guessed.",
    },
    summary: {
      active_pools: pools.length,
      resolved_vaults: resolvableVaults,
      unmatched_pools: unmatched.length,
      distinct_governors: curators.length,
      labeled_governors: labeledCurators,
      labeled_vaults: labeledVaults,
      total_resolved_supply_usd: totalResolvedSupply,
      labeled_supply_usd: curators.filter((c) => c.curator_name).reduce((s, c) => s + c.total_supply_usd, 0),
      hhi: Number(hhi.toFixed(2)),
      top_3_share_pct: Number(top3Share.toFixed(2)),
    },
    curators,
    per_vault: perVault,
    unmatched_pools: unmatched.map((v) => ({
      display_name: v.display_name,
      underlying_symbol: v.underlying_symbol,
      expected_symbol: v.expected_symbol,
      supply_usd: v.supply_usd,
      note: "poolMeta did not match any on-chain EVK symbol() or name(); governor unresolved.",
    })),
  }
  const outPath = join(process.cwd(), OUTPUT_PATH)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n")

  // ─── Console summary ───────────────────────────────────────────────────
  console.log("")
  console.log("── Euler V2 curator concentration (on-chain governorAdmin) ─")
  console.log(`  Curator                     Share    Supply     Vaults  Governor`)
  for (const c of curators) {
    console.log(
      `  ${(c.curator_name ?? "(unlabeled)").padEnd(26)}  ${fmtPct(c.share_pct).padStart(6)}  ` +
        `${fmtUsd(c.total_supply_usd).padStart(9)}  ${String(c.vault_count).padStart(5)}   ${fmtAddr(c.governor_address)}${c.governor_ens ? ` (${c.governor_ens})` : ""}`,
    )
  }
  console.log("")
  console.log(`  distinct governors : ${curators.length}  (labeled ${labeledCurators})`)
  console.log(`  vaults resolved    : ${resolvableVaults}/${pools.length}  (labeled ${labeledVaults})`)
  console.log(
    `  labeled TVL share  : ${totalResolvedSupply > 0 ? ((output.summary.labeled_supply_usd / totalResolvedSupply) * 100).toFixed(1) : "0"}%  ` +
      `(${fmtUsd(output.summary.labeled_supply_usd)} of ${fmtUsd(totalResolvedSupply)})`,
  )
  console.log(`  HHI                : ${output.summary.hhi}   top-3 share: ${fmtPct(output.summary.top_3_share_pct)}`)
  if (unmatched.length > 0) {
    console.log("")
    console.log(`  ${unmatched.length} pool(s) unmatched on-chain: ${unmatched.map((u) => u.display_name).join(", ")}`)
  }
  console.log("")
  console.log(`Wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
