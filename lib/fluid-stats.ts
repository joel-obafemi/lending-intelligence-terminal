/**
 * Fluid-specific cross-source aggregates.
 *
 * Joins Fluid on-chain vault data (which knows `isSmartCol` / `isSmartDebt`)
 * with DefiLlama's Yields pool data (which knows USD TVL per pool) to
 * produce TVL-by-category breakdowns we can't get from either source alone.
 *
 * The Smart Collateral / Smart Debt features are Fluid's headline
 * differentiator vs. Aave V3 forks — collateral/debt can be a Fluid DEX
 * position rather than a single token. Tracking what fraction of Fluid TVL
 * runs through these "smart" vaults is a useful adoption metric.
 */
import { fetchAllYieldPools, type YieldPool } from "./defillama"
import { loadAllFluidVaultsLive, type FluidVaultLive } from "./fluid-onchain"

const ETH_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
])

function normalize(addr: string | undefined): string {
  if (!addr) return ""
  const lower = addr.toLowerCase()
  return ETH_SENTINELS.has(lower) ? "ETH" : lower
}

export interface FluidSmartVaultStats {
  /** Number of vaults that returned from `getVaultsEntireData()`. */
  totalVaults: number
  /** USD TVL we successfully matched between DefiLlama + on-chain
   *  (i.e. vault-based TVL — the smart-vault headline denominator). */
  matchedTvlUsd: number
  /** Total Fluid TVL across every DefiLlama Fluid pool on Ethereum,
   *  including the lending-pool side that isn't vault-classified. Equal
   *  to `matchedTvlUsd + lendingOnlyTvlUsd` (modulo rounding). Use this
   *  when reconciling against the protocol-page Total Supply. */
  totalTvlUsd: number
  /** Residual TVL on DefiLlama Fluid pools that don't pair to a vault
   *  on-chain — i.e. Liquidity Layer / DEX-mode lending pools. */
  lendingOnlyTvlUsd: number
  /** Number of DefiLlama Fluid pools without an on-chain vault pair. */
  lendingOnlyPoolCount: number

  /** TVL in vaults flagged `isSmartCol`. */
  smartColTvlUsd: number
  /** TVL in vaults flagged `isSmartDebt`. */
  smartDebtTvlUsd: number
  /** TVL in vaults flagged both flags. */
  smartBothTvlUsd: number
  /** TVL in vaults with neither smart flag. */
  regularTvlUsd: number

  /** Counts of vaults in each category (count, not TVL). */
  smartColCount: number
  smartDebtCount: number
  smartBothCount: number
  regularCount: number

  /** % of vault TVL in vaults with at least one smart flag (denom =
   *  matchedTvlUsd, i.e. vault-based TVL only). */
  smartAnyPct: number
  /** % of vault TVL in pure smart-collateral vaults. */
  smartColPct: number
  /** % of vault TVL in pure smart-debt vaults. */
  smartDebtPct: number
}

/** Shape of a DefiLlama Yields pool we'll match against. */
type FluidPool = Pick<YieldPool, "totalSupplyUsd" | "tvlUsd" | "underlyingTokens" | "totalBorrowUsd">

function poolTvl(p: FluidPool): number {
  // Prefer total supply (TVL + borrowed); fall back to tvlUsd alone.
  if (p.totalSupplyUsd != null && p.totalSupplyUsd > 0) return p.totalSupplyUsd
  return (p.tvlUsd ?? 0) + (p.totalBorrowUsd ?? 0)
}

/** Build a `(collateral, loan)` key for matching DefiLlama pool ↔ Fluid vault. */
function pairKey(col: string, loan: string): string {
  return normalize(col) + "::" + normalize(loan)
}

/**
 * Aggregate Fluid TVL by Smart Collateral / Smart Debt classification.
 *
 * Strategy: pull DefiLlama Fluid pools (USD-denominated TVL) and Fluid
 * on-chain vaults (smart flags) in parallel, build a `pairKey` index of
 * vaults, and tag each DefiLlama pool by looking up its underlying-token
 * pair. Multiple vaults may share the same pair with different LTVs — we
 * sum across all of them, matching DefiLlama's convention of one pool per
 * asset pair.
 *
 * Failures: if either source is unavailable, returns `null`. Callers should
 * not render the stats card in that case.
 */
export async function loadFluidSmartVaultStats(): Promise<FluidSmartVaultStats | null> {
  let pools: YieldPool[] = []
  let vaults: FluidVaultLive[] = []
  try {
    ;[pools, vaults] = await Promise.all([fetchAllYieldPools(), loadAllFluidVaultsLive()])
  } catch (err: any) {
    console.error("[fluid-stats] source fetch failed:", err?.message ?? err)
    return null
  }

  // DefiLlama splits Fluid into multiple projects:
  //   - `fluid-lending`: the lending-pool side (single-token, fToken deposits)
  //   - `fluid-dex` / `fluid-lite`: the vault-side (collateral, loan) pairs
  // Older revisions of this loader filtered to >=2 underlying tokens, which
  // dropped every fluid-lending pool (they're single-token by design) AND
  // ignored fluid-dex entirely → all categories collapsed to 0%. We now
  // include all four buckets and let the downstream pair-matching classify.
  const FLUID_PROJECTS = new Set(["fluid-lending", "fluid-dex", "fluid-lite", "fluid"])
  const fluidPools = pools.filter(
    (p) => p.chain === "Ethereum" && FLUID_PROJECTS.has(p.project),
  )
  const totalTvlUsd = fluidPools.reduce((s, p) => s + poolTvl(p), 0)

  // Index vaults by `(collateral, loan)` pair. Multiple vaults can share a
  // pair (different LTVs); we keep the union of their smart flags.
  const flagsByPair = new Map<string, { isSmartCol: boolean; isSmartDebt: boolean; count: number }>()
  for (const v of vaults) {
    const key = pairKey(v.collateralAsset, v.loanAsset)
    const cur = flagsByPair.get(key) ?? { isSmartCol: false, isSmartDebt: false, count: 0 }
    cur.isSmartCol = cur.isSmartCol || v.isSmartCol
    cur.isSmartDebt = cur.isSmartDebt || v.isSmartDebt
    cur.count += 1
    flagsByPair.set(key, cur)
  }

  let smartColTvlUsd = 0
  let smartDebtTvlUsd = 0
  let smartBothTvlUsd = 0
  let regularTvlUsd = 0
  let matchedTvlUsd = 0
  let lendingOnlyTvlUsd = 0
  let lendingOnlyPoolCount = 0

  for (const p of fluidPools) {
    const tokens = p.underlyingTokens ?? []
    const tvl = poolTvl(p)
    // Single-token pools are always lending-pool deposits (fluid-lending's
    // fTokens), never vault-pair entries — short-circuit them straight into
    // the lending-only bucket without attempting a pair-match.
    if (tokens.length < 2) {
      lendingOnlyTvlUsd += tvl
      lendingOnlyPoolCount += 1
      continue
    }
    const col = tokens[0] ?? ""
    const loan = tokens[1] ?? ""
    const flags = flagsByPair.get(pairKey(col, loan))
    if (!flags) {
      // 2-token pool that doesn't pair to an on-chain vault — treat as
      // lending-only too (DEX-mode pools without a smart-flag classifier).
      lendingOnlyTvlUsd += tvl
      lendingOnlyPoolCount += 1
      continue
    }
    matchedTvlUsd += tvl
    if (flags.isSmartCol && flags.isSmartDebt) smartBothTvlUsd += tvl
    else if (flags.isSmartCol) smartColTvlUsd += tvl
    else if (flags.isSmartDebt) smartDebtTvlUsd += tvl
    else regularTvlUsd += tvl
  }

  // Counts come from the full vault list (not the matched DefiLlama subset).
  let smartColCount = 0
  let smartDebtCount = 0
  let smartBothCount = 0
  let regularCount = 0
  for (const v of vaults) {
    if (v.isSmartCol && v.isSmartDebt) smartBothCount += 1
    else if (v.isSmartCol) smartColCount += 1
    else if (v.isSmartDebt) smartDebtCount += 1
    else regularCount += 1
  }

  // Smart-vault percentage uses VAULT TVL as the denominator (matched
  // vault pools only) so the headline reads "of vault-based capital, X%
  // is in smart vaults". The lending-pool residual is exposed
  // separately so the table reconciles to the protocol-level total.
  const vaultDenom = matchedTvlUsd
  const smartAnyTvl = smartColTvlUsd + smartDebtTvlUsd + smartBothTvlUsd
  const pct = (n: number) => (vaultDenom > 0 ? (n / vaultDenom) * 100 : 0)
  const total = matchedTvlUsd + lendingOnlyTvlUsd

  return {
    totalVaults: vaults.length,
    matchedTvlUsd,
    totalTvlUsd: total > 0 ? total : totalTvlUsd,
    lendingOnlyTvlUsd,
    lendingOnlyPoolCount,
    smartColTvlUsd,
    smartDebtTvlUsd,
    smartBothTvlUsd,
    regularTvlUsd,
    smartColCount,
    smartDebtCount,
    smartBothCount,
    regularCount,
    smartAnyPct: pct(smartAnyTvl),
    smartColPct: pct(smartColTvlUsd + smartBothTvlUsd),
    smartDebtPct: pct(smartDebtTvlUsd + smartBothTvlUsd),
  }
}
