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
  /** USD TVL we successfully matched between DefiLlama + on-chain. */
  matchedTvlUsd: number
  /** Total Fluid TVL per DefiLlama (used as the denominator when one or two
   *  vaults didn't match). Falls back to `matchedTvlUsd` when DefiLlama has
   *  the same coverage as on-chain. */
  totalTvlUsd: number

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

  /** % of Fluid TVL in vaults with at least one smart flag. */
  smartAnyPct: number
  /** % of Fluid TVL in pure smart-collateral vaults. */
  smartColPct: number
  /** % of Fluid TVL in pure smart-debt vaults. */
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

  const fluidPools = pools.filter(
    (p) =>
      p.chain === "Ethereum" &&
      (p.project === "fluid-lending" || p.project === "fluid") &&
      (p.underlyingTokens?.length ?? 0) >= 2,
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

  for (const p of fluidPools) {
    const col = p.underlyingTokens?.[0] ?? ""
    const loan = p.underlyingTokens?.[1] ?? ""
    const flags = flagsByPair.get(pairKey(col, loan))
    if (!flags) continue  // Unmatched — typically a Liquidity-Layer-only fToken.
    const tvl = poolTvl(p)
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

  // Use the LARGER of (DefiLlama total, matched total) as the denominator —
  // matched ≤ total, but DefiLlama's pool list can include rows we couldn't
  // join (Liquidity-Layer-only fTokens). Either way we're showing the share
  // of Fluid TVL that's verifiably smart vs. the rest.
  const denom = Math.max(totalTvlUsd, matchedTvlUsd)
  const smartAnyTvl = smartColTvlUsd + smartDebtTvlUsd + smartBothTvlUsd
  const pct = (n: number) => (denom > 0 ? (n / denom) * 100 : 0)

  return {
    totalVaults: vaults.length,
    matchedTvlUsd,
    totalTvlUsd: denom,
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
