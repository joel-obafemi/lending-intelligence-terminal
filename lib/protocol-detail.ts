/**
 * Per-protocol detail for the Protocol Deep Dive page (`/protocols`).
 *
 * Current snapshot comes from DefiLlama's Yields API (`/pools` +
 * `/lendBorrow` merged). Historical TVL is derived from the existing
 * overview series so we share one fetch. Each protocol's architecture
 * dictates the shape of the markets table — see `architecture` on the
 * returned object.
 *
 * Notes by protocol:
 *  - **Aave V3 / Spark**: one pool per reserve. `poolMeta` occasionally
 *    flags E-mode or Prime variants.
 *  - **Morpho Blue**: the DefiLlama view lists MetaMorpho vaults (supply
 *    side, aggregator yield) — not raw isolated markets. Those with
 *    `apyBase` set are vault deposits; the large `apyBase === null` rows
 *    are the collateral-market primitives and are excluded from the V1
 *    table because suppliers don't interact with them directly.
 *  - **Fluid**: one pool per supply-debt pairing. Reward APY is common
 *    (incentive programs), so we expose `apyReward` alongside base.
 */
import { PROTOCOLS, PROTOCOL_BY_SLUG, type ProtocolConfig } from "./protocols"
import {
  fetchAllYieldPools,
  fetchProtocolHistory,
  type DayPoint,
  type YieldPool,
} from "./defillama"
import { YIELDS_PROJECT_BY_PROTOCOL } from "./rates"
import type { AssetTimeseriesPoint } from "./overview"
import { loadAllAaveReservesLive, type AaveReserveLive } from "./aave-onchain"
import { loadAllSparkReservesLive } from "./spark-onchain"
import { loadCompoundEthereumOnChain } from "./compound-onchain"
import { loadEulerEthereumOnChain } from "./euler-onchain"

/** 24h-delta + 30d sparkline for the four headline counters. */
export interface ProtocolDelta {
  /** Most-recent observed value (USD). */
  current: number
  /** 24h absolute-USD change (latest − T-1d). 0 if a yesterday-day data point isn't available. */
  change24h: number
  /** Last ~30 daily observations, used to draw the sparkline. */
  sparkline: Array<{ timestamp: number; value: number }>
  /** Full daily history available for the metric. Used by the metric
   *  card's peak-to-current drawdown sub-line, which needs a longer
   *  window than the 30-day sparkline. Same data, deeper retention. */
  history: Array<{ timestamp: number; value: number }>
}

export interface MarketRow {
  poolId: string
  asset: string
  /** Architecture-specific subtitle (E-mode tag, vault curator, debt pair, etc.) */
  subLabel?: string
  /** Unborrowed liquidity (DefiLlama /pools tvlUsd). */
  tvlUsd: number
  /** Total supplied = TVL + borrowed. The market-table sort key. */
  totalSupplyUsd: number
  borrowedUsd: number | null
  utilizationPct: number | null
  supplyApy: number | null
  supplyApyReward: number | null
  borrowApy: number | null
  ltv: number | null
  /** True when this row has incentive/reward APY on top of the base. */
  hasRewards: boolean
}

export interface ProtocolDetail {
  slug: string
  name: string
  color: string
  description: string
  architecture: ProtocolConfig["architecture"]
  website: string
  totalTvl: number
  totalBorrowed: number
  totalSupplied: number
  utilizationPct: number
  marketCount: number
  /** Daily 24h-delta + 30d sparkline for the headline counters. */
  tvlDelta: ProtocolDelta
  borrowedDelta: ProtocolDelta
  suppliedDelta: ProtocolDelta
  markets: MarketRow[]
  /** Per-asset supplied (TVL + borrowed) USD over time, top-N + Other */
  supplyByAssetSeries: AssetTimeseriesPoint[]
  /** Per-asset borrowed USD over time, top-N + Other */
  borrowedByAssetSeries: AssetTimeseriesPoint[]
  /** Top asset symbols included as named series. */
  topAssets: string[]
  /** Per-chain Available Liquidity in USD across every chain the protocol is
   *  deployed on. Powers the Multi-Chain Footprint module on the Aave V3
   *  page (and any other multi-chain protocol that ships there later). */
  multiChainTvl: Record<string, number>
  /** Per-chain active Borrows in USD. Same key shape as `multiChainTvl` so
   *  the Multi-Chain Footprint toggle pairs them cleanly. */
  multiChainBorrowed: Record<string, number>
  /** Where the headline Total Supply / Borrows / Available numbers
   *  came from. "on-chain" = fresh UiPoolDataProviderV3 read (≤30s
   *  old); "defillama" = DefiLlama Yields aggregate (≤a few hours old).
   *  Visible to readers via a small badge on the protocol stat strip. */
  livenessSource: "on-chain" | "defillama"
  /** Human-readable scope label when the headline numbers come from
   *  a specific deployment (e.g. "Aave V3 Core deployment"). Null when
   *  the numbers cover the protocol's full DefiLlama scope. */
  livenessScope: string | null
}

/** Table column label for the "market" column, varies by architecture. */
export function marketColumnLabel(arch: ProtocolConfig["architecture"]): string {
  switch (arch) {
    case "pool":
      return "Reserve"
    case "isolated":
      return "Vault"
    case "vault":
      return "Vault"
  }
}

/**
 * Build a `ProtocolDelta` from a daily DayPoint series:
 *  - `current` = the most-recent observation
 *  - `change24h` = current − value at (latest_ts - 1 day), within a 2-day
 *    tolerance window (covers DefiLlama's occasional missing days)
 *  - `sparkline` = the last ~30 days of values
 *
 * Returns a zeroed shell for empty/short input rather than throwing — the
 * UI degrades gracefully (no delta pill, flat sparkline).
 */
function buildProtocolDelta(series: DayPoint[]): ProtocolDelta {
  if (series.length === 0) {
    return { current: 0, change24h: 0, sparkline: [], history: [] }
  }
  const sorted = [...series].sort((a, b) => a.timestamp - b.timestamp)
  const latest = sorted[sorted.length - 1]
  const target = latest.timestamp - 86400
  const tolerance = 2 * 86400
  let prior: DayPoint | undefined
  let bestDist = Infinity
  for (const p of sorted) {
    if (p.timestamp >= latest.timestamp) break
    const d = Math.abs(p.timestamp - target)
    if (d < bestDist && d <= tolerance) {
      bestDist = d
      prior = p
    }
  }
  const change24h = prior && prior.usd > 0 ? latest.usd - prior.usd : 0
  const sparkCutoff = latest.timestamp - 30 * 86400
  const sparkline = sorted
    .filter((p) => p.timestamp >= sparkCutoff)
    .map((p) => ({ timestamp: p.timestamp, value: p.usd }))
  // Full history for downstream peak-to-current drawdown computation —
  // same shape as `sparkline` but every point, not just the trailing 30
  // days. The metric card needs depth to find a meaningful peak (rsETH
  // week happened in early 2025; 30 days isn't enough).
  const history = sorted.map((p) => ({ timestamp: p.timestamp, value: p.usd }))
  return { current: latest.usd, change24h, sparkline, history }
}

/** Per-day supplied = tvl + borrowed. Aligns the two daily series by timestamp. */
function buildSuppliedSeries(tvl: DayPoint[], borrowed: DayPoint[]): DayPoint[] {
  const borrowByTs = new Map<number, number>()
  for (const b of borrowed) borrowByTs.set(b.timestamp, b.usd)
  return tvl.map((t) => ({
    timestamp: t.timestamp,
    usd: t.usd + (borrowByTs.get(t.timestamp) ?? 0),
  }))
}

/** Minimum TVL cutoff per protocol — silences the long tail of tiny markets. */
const MIN_TVL_USD: Record<string, number> = {
  "aave-v3": 1_000_000,
  spark: 100_000,
  "morpho-blue": 1_000_000,
  fluid: 100_000,
}

/** Cap how many rows we surface to the markets table. The component then
 *  paginates them 20 at a time. 200 covers Aave V3's full reserve list and
 *  the long tail of Morpho vaults without flooding the server response. */
const MAX_ROWS_PER_PROTOCOL = 200

function utilization(totalSupplyUsd: number | null | undefined, totalBorrowUsd: number | null | undefined): number | null {
  // For the per-row utilization, /lendBorrow's `totalSupplyUsd` IS the full
  // supplied amount (unborrowed + borrowed), so the naïve ratio is correct.
  // That's different from the aggregate computed above (which uses /pools'
  // `tvlUsd` — unborrowed only — and so has to add borrowed back in).
  if (!totalSupplyUsd || totalSupplyUsd <= 0) return null
  if (totalBorrowUsd == null) return null
  return (totalBorrowUsd / totalSupplyUsd) * 100
}

function toMarketRow(
  p: YieldPool,
  arch: ProtocolConfig["architecture"],
  slug: string,
  allPools: YieldPool[],
): MarketRow {
  // Some Fluid pools have reward APY (e.g. FLUID-token incentives); display both.
  const hasRewards = (p.apyReward ?? 0) > 0
  // Sub-label: for Morpho the symbol IS the vault name (e.g. steakUSDC); try
  // to infer the underlying loan asset from the ticker prefix. For pool-based
  // protocols, fall back to `poolMeta` (e.g. "E-mode: stablecoins"). For
  // Fluid (vaults), surface the loan asset and a "Lending pool" tag for
  // single-underlying lending-layer fTokens — so duplicate symbols
  // disambiguate by what they're actually paired with.
  let subLabel: string | undefined
  if (arch === "isolated") {
    subLabel = morphoVaultSubLabel(p.symbol)
  } else if (slug === "fluid") {
    subLabel = fluidPoolSubLabel(p, allPools)
  } else if (p.poolMeta && p.poolMeta.length > 0) {
    subLabel = p.poolMeta
  }
  const tvlUsd = p.tvlUsd ?? 0
  const borrowedUsd = p.totalBorrowUsd ?? null
  // Total Supply: prefer /lendBorrow's totalSupplyUsd when available
  // (already includes borrowed). Fallback to tvlUsd + borrowedUsd, since
  // DefiLlama's /pools tvlUsd is unborrowed-only.
  const totalSupplyUsd =
    p.totalSupplyUsd != null && p.totalSupplyUsd > 0
      ? p.totalSupplyUsd
      : tvlUsd + (borrowedUsd ?? 0)
  return {
    poolId: p.pool,
    asset: p.symbol,
    subLabel,
    tvlUsd,
    totalSupplyUsd,
    borrowedUsd,
    utilizationPct: utilization(p.totalSupplyUsd, p.totalBorrowUsd),
    supplyApy: p.apyBase,
    supplyApyReward: p.apyReward,
    borrowApy: p.apyBaseBorrow,
    ltv: p.ltv,
    hasRewards,
  }
}

/** Top-N + Other bucketing for a per-asset USD time series. */
function bucketTopAssets(
  series: Array<{ timestamp: number; tokens: Record<string, number> }>,
  topAssets: string[],
): AssetTimeseriesPoint[] {
  const topSet = new Set(topAssets.map((s) => s.toUpperCase()))
  return series.map((pt) => {
    const point: AssetTimeseriesPoint = { timestamp: pt.timestamp }
    let other = 0
    for (const sym of topAssets) point[sym] = 0
    for (const [rawSym, usd] of Object.entries(pt.tokens || {})) {
      if (!Number.isFinite(usd) || usd <= 0) continue
      const sym = rawSym.toUpperCase()
      if (topSet.has(sym)) point[sym] = usd
      else other += usd
    }
    if (other > 0) point["Other"] = other
    return point
  })
}

/** Try to extract the underlying asset from a MetaMorpho vault ticker. */
function morphoVaultSubLabel(symbol: string): string | undefined {
  const upper = symbol.toUpperCase()
  // Common patterns: GTUSDC → Gauntlet / USDC, STEAKUSDC → Steakhouse / USDC.
  const suffixes = [
    "USDC", "USDT", "DAI", "PYUSD", "USDS", "GHO", "WETH", "ETH", "WBTC", "CBBTC", "WSTETH", "USDE",
  ]
  for (const s of suffixes) {
    if (upper.endsWith(s)) {
      const prefix = upper.slice(0, upper.length - s.length)
      if (!prefix) return undefined
      return prettyCurator(prefix) + " · " + s
    }
  }
  return undefined
}

/** Aave V3 mainnet runs three separate Pool deployments — Core, Lido, and
 *  EtherFi (formerly "Prime") — and DefiLlama lists each under the same
 *  `aave-v3` project. The pool-meta string distinguishes them in DefiLlama's
 *  data, but it's lower-cased and doesn't always render cleanly. We also
 *  want the most-popular reserve (typically the Core deployment) to carry
 *  an explicit "Core" tag so a reader scanning duplicate-asset rows knows
 *  which deployment they're looking at.
 *
 *  Mutates `markets` in place: any asset symbol that appears more than once
 *  gets a deployment tag added to its `subLabel`. Rows whose poolMeta
 *  doesn't match a known tag default to "Core".
 */
function disambiguateDuplicateAssets(markets: MarketRow[], slug: string): void {
  // Fluid rows are already sub-labelled with their loan asset / lending-
  // pool tag via `fluidPoolSubLabel` — Aave V3's deployment-tag heuristic
  // doesn't apply.
  if (slug === "fluid") return
  const counts = new Map<string, number>()
  for (const m of markets) {
    const key = m.asset.toUpperCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const m of markets) {
    if ((counts.get(m.asset.toUpperCase()) ?? 0) <= 1) continue
    const tag = inferDeploymentTag(m.subLabel)
    m.subLabel = m.subLabel
      ? // Preserve any existing detail (e.g. "E-mode: stablecoins") and
        // prepend the deployment tag so it reads "Lido · E-mode: stablecoins".
        m.subLabel.toLowerCase().includes(tag.toLowerCase())
        ? capitalizeFirst(m.subLabel)
        : `${tag} · ${m.subLabel}`
      : tag
  }
}

/** Build a Fluid-specific row sub-label.
 *
 *  Two cases:
 *   - **Two underlyings** (vault): the row is a `(collateral, loan)` pair.
 *     Render the loan symbol so duplicate "WSTETH" rows distinguish by
 *     what they're borrowing against.
 *   - **One underlying** (lending pool): the row is a Liquidity Layer
 *     fToken — supplying only, no per-vault borrow side. Tag as
 *     "Lending pool" so the missing borrow columns aren't mistaken for
 *     a data error.
 */
function fluidPoolSubLabel(p: YieldPool, allPools: YieldPool[]): string | undefined {
  const tokens = p.underlyingTokens ?? []
  if (tokens.length >= 2) {
    const loanAddr = tokens[1]
    const loanSym = resolveLoanSymbol(loanAddr, allPools)
    return loanSym ? `vs ${loanSym}` : undefined
  }
  if (tokens.length === 1) return "Lending pool"
  return undefined
}

/** Look up an asset symbol by its address by scanning DefiLlama pools where
 *  it appears as `underlyingTokens[0]` (the primary underlying). This is a
 *  zero-cost reverse lookup that doesn't need an ERC20 metadata call. */
function resolveLoanSymbol(address: string, allPools: YieldPool[]): string | null {
  if (!address) return null
  const target = address.toLowerCase()
  if (
    target === "0x0000000000000000000000000000000000000000" ||
    target === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  )
    return "ETH"
  for (const p of allPools) {
    if (p.chain !== "Ethereum") continue
    const primary = p.underlyingTokens?.[0]?.toLowerCase()
    if (primary === target) return p.symbol
  }
  return null
}

function inferDeploymentTag(subLabel: string | undefined): string {
  if (!subLabel) return "Core"
  const lower = subLabel.toLowerCase()
  if (lower.includes("lido")) return "Lido"
  if (lower.includes("etherfi") || lower.includes("ether-fi")) return "EtherFi"
  if (lower.includes("prime")) return "Prime"
  if (lower.includes("core")) return "Core"
  return "Core"
}

function capitalizeFirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function prettyCurator(prefix: string): string {
  const map: Record<string, string> = {
    STEAK: "Steakhouse",
    GT: "Gauntlet",
    SEN: "Re7",
    BB: "B.Protocol",
    SKY: "Sky",
    VB: "Victory",
    SUM: "Summit",
    EUL: "Euler",
    PY: "PYUSD",
    MEV: "MEV Capital",
  }
  for (const [k, v] of Object.entries(map)) {
    if (prefix.startsWith(k)) return v
  }
  return prefix.slice(0, 10) // Fallback: first chars of ticker.
}

export async function loadProtocolDetail(slug: string): Promise<ProtocolDetail | null> {
  const cfg = PROTOCOL_BY_SLUG[slug]
  if (!cfg) return null

  const validProjects = YIELDS_PROJECT_BY_PROTOCOL[slug] ?? []
  // Pull the DefiLlama Yields snapshot AND the protocol's per-asset history
  // (for the Supply / Borrows by Asset charts on the deep-dive page).
  // For Aave V3 + Spark we also pull live UiPoolDataProviderV3 reads so the
  // Isolation Mode Watch module on the Aave page has on-chain debt-ceiling
  // and isolation-debt numbers to render.
  const [allPools, history, aaveStyleReserves] = await Promise.all([
    fetchAllYieldPools(),
    fetchProtocolHistory(cfg.defillamaSlug).catch(() => null),
    slug === "aave-v3"
      ? loadAllAaveReservesLive().catch((err) => {
          console.error("[protocol-detail] aave reserves load failed:", err?.message ?? err)
          return [] as AaveReserveLive[]
        })
      : slug === "spark"
      ? loadAllSparkReservesLive().catch((err) => {
          console.error("[protocol-detail] spark reserves load failed:", err?.message ?? err)
          return [] as AaveReserveLive[]
        })
      : Promise.resolve([] as AaveReserveLive[]),
  ])
  const pools = allPools.filter(
    (p) => p.chain === "Ethereum" && validProjects.includes(p.project),
  )

  const minTvl = MIN_TVL_USD[slug] ?? 100_000
  // Sort markets by TOTAL SUPPLY (TVL + borrowed) so heavily-borrowed reserves
  // rank above shallow-but-untouched ones. `totalSupplyUsd` from /lendBorrow
  // is the canonical total when present; otherwise fall back to tvl + borrow.
  function totalSupplyOf(p: YieldPool): number {
    if (p.totalSupplyUsd != null && p.totalSupplyUsd > 0) return p.totalSupplyUsd
    return (p.tvlUsd ?? 0) + (p.totalBorrowUsd ?? 0)
  }
  const visible = pools
    // Morpho: DefiLlama lists both MetaMorpho vaults (apyBase set, real
    // supply yield) and raw collateral-market rows (apyBase == null). Keep
    // only vaults in the V1 table so the rows are comparable.
    .filter((p) => {
      if (slug !== "morpho-blue") return true
      return p.apyBase != null
    })
    .filter((p) => totalSupplyOf(p) >= minTvl)
    .sort((a, b) => totalSupplyOf(b) - totalSupplyOf(a))

  const markets = visible
    .slice(0, MAX_ROWS_PER_PROTOCOL)
    .map((p) => toMarketRow(p, cfg.architecture, slug, allPools))
  disambiguateDuplicateAssets(markets, slug)

  // `tvlUsd` in DefiLlama's /pools is UNBORROWED liquidity. Utilization
  // must therefore use supplied = unborrowed + borrowed as the denominator,
  // not TVL alone — otherwise Aave V3 (which has many heavily-borrowed
  // reserves) reads ~95% when the real number is ~45%.
  let totalTvl = pools.reduce((s, p) => s + (p.tvlUsd ?? 0), 0)
  let totalBorrowed = pools.reduce((s, p) => s + (p.totalBorrowUsd ?? 0), 0)
  let totalSupplied = totalTvl + totalBorrowed

  // Liveness metadata for the page — defaults to DefiLlama (lagging by
  // a few hours) and gets upgraded to "on-chain" when we have a live
  // reserves snapshot from `UiPoolDataProviderV3`.
  let livenessSource: ProtocolDetail["livenessSource"] = "defillama"
  let livenessScope: string | null = null

  // On-chain override: when we have fresh `UiPoolDataProviderV3` reads
  // (Aave V3 Core or Spark Ethereum), sum reserve USD totals as the
  // headline numbers. These reads are ≤30 seconds old — orders of
  // magnitude fresher than DefiLlama's hourly refresh, and they match
  // the protocol's own UI exactly. The DefiLlama-sourced totals stay
  // available as a fallback when the on-chain read fails.
  if (aaveStyleReserves.length > 0) {
    const sum = aaveStyleReserves.reduce(
      (acc, r) => {
        acc.tvl += r.availableLiquidityUsd
        acc.borrowed += r.totalBorrowUsd
        acc.supplied += r.totalSupplyUsd
        return acc
      },
      { tvl: 0, borrowed: 0, supplied: 0 },
    )
    if (sum.supplied > 0) {
      totalTvl = sum.tvl
      totalBorrowed = sum.borrowed
      totalSupplied = sum.supplied
      livenessSource = "on-chain"
      // Aave V3 mainnet has 4 deployments (Core / Lido / EtherFi /
      // Prime). Our on-chain read targets the Core pool only — that's
      // also what Aave's app.aave.com defaults to. Spark has a single
      // Ethereum deployment so the scope label is just the protocol
      // name.
      livenessScope =
        slug === "aave-v3" ? "Aave V3 Core deployment" : cfg.name
    }
  } else if ((slug === "fluid" || slug === "morpho-blue") && history) {
    // Protocol-history override for Fluid + Morpho. The DefiLlama Yields
    // API doesn't index every market for these two — Fluid has Smart
    // Debt vaults + lending-pool fTokens that don't expose a clean APY,
    // and Morpho's `apyBase != null` filter (which we need for the
    // markets table) drops the raw isolated-market rows. Falling back to
    // `/protocol/{slug}` `chainTvls.Ethereum` matches each protocol's
    // own UI and reconciles with the per-asset chart on this page,
    // which already sources from this same endpoint.
    const ethTvl = history.currentTvl
    const ethBorrowed = history.currentBorrowed
    const ethSupplied = ethTvl + ethBorrowed
    if (ethSupplied > 0) {
      totalTvl = ethTvl
      totalBorrowed = ethBorrowed
      totalSupplied = ethSupplied
      // livenessSource stays "defillama" — both endpoints come from
      // DefiLlama with comparable freshness; no need to relabel.
    }
  } else if (slug === "compound-v3") {
    // Compound V3 override: DefiLlama's chainTvls.Ethereum semantics
    // diverge from on-chain Comet totals by roughly $180M today /
    // $340M at May 31, 2026. The pools-derived `totalTvl` from
    // line 445 sums per-asset deposited from /pools entries, which is
    // close but still off because DefiLlama prices some collateral
    // assets off-market. Read the four Comet markets directly and use
    // those canonical totals when available.
    const compoundData = await loadCompoundEthereumOnChain().catch((err) => {
      console.error("[protocol-detail] compound on-chain load failed:", err?.message ?? err)
      return null
    })
    if (compoundData && compoundData.supplied > 0) {
      totalTvl = compoundData.tvl
      totalBorrowed = compoundData.borrowed
      totalSupplied = compoundData.supplied
      livenessSource = "on-chain"
      livenessScope = "Compound V3 Comet markets (USDC, USDT, WETH, USDS bases)"
    }
  } else if (slug === "euler-v2") {
    // Euler V2 override: DefiLlama's chainTvls.Ethereum +
    // Ethereum-borrowed overstates the on-chain truth by roughly $70M
    // (verified June 2026 against per-vault totalAssets/totalBorrows
    // reads across all 53/57 priced active vaults). Same root cause as
    // the Compound case: DefiLlama's protocol-level adapter overcounts
    // collateral/asset USD vs the on-chain accounting. Read the active
    // EVK vaults directly and substitute.
    const eulerData = await loadEulerEthereumOnChain().catch((err) => {
      console.error("[protocol-detail] euler on-chain load failed:", err?.message ?? err)
      return null
    })
    if (eulerData && eulerData.supplied > 0) {
      totalTvl = eulerData.tvl
      totalBorrowed = eulerData.borrowed
      totalSupplied = eulerData.supplied
      livenessSource = "on-chain"
      livenessScope = `Euler V2 EVK vaults (${eulerData.perVault.length} of ${eulerData.activeVaultCount} active)`
    }
  }

  // Build per-asset Supply + Borrows series. Total Supply per asset = the
  // protocol's unborrowed deposits + borrowed amount of that asset.
  const TOP_N_ASSETS = 7
  let supplyByAssetSeries: AssetTimeseriesPoint[] = []
  let borrowedByAssetSeries: AssetTimeseriesPoint[] = []
  let topAssets: string[] = []

  if (history) {
    // For each day-point, sum supplied (unborrowed) + borrowed per asset to
    // reconstruct "Total Supply" per asset.
    const totalSuppliedByAssetRaw = history.suppliedByAsset.map((sup) => {
      const bor = history.borrowedByAsset.find((b) => b.timestamp === sup.timestamp)
      const tokens: Record<string, number> = { ...sup.tokens }
      if (bor) {
        for (const [sym, usd] of Object.entries(bor.tokens)) {
          tokens[sym] = (tokens[sym] ?? 0) + usd
        }
      }
      return { timestamp: sup.timestamp, tokens }
    })
    // Borrow-only days that have no supply entry (rare) still go in.
    for (const bor of history.borrowedByAsset) {
      if (!totalSuppliedByAssetRaw.find((p) => p.timestamp === bor.timestamp)) {
        totalSuppliedByAssetRaw.push({ timestamp: bor.timestamp, tokens: { ...bor.tokens } })
      }
    }
    totalSuppliedByAssetRaw.sort((a, b) => a.timestamp - b.timestamp)

    // Pick the top-N asset symbols by latest-day total supply.
    const latest = totalSuppliedByAssetRaw[totalSuppliedByAssetRaw.length - 1]
    if (latest) {
      topAssets = Object.entries(latest.tokens)
        .filter(([, v]) => Number.isFinite(v) && v > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, TOP_N_ASSETS)
        .map(([sym]) => sym.toUpperCase())
    }

    supplyByAssetSeries = bucketTopAssets(totalSuppliedByAssetRaw, topAssets)
    borrowedByAssetSeries = bucketTopAssets(history.borrowedByAsset, topAssets)
  }

  // Build 24h delta + 30d sparkline for the headline counters off the
  // protocol's daily history. Supplied is derived from tvl + borrowed
  // per day — the live snapshot above (totalSupplied) is the same math
  // applied to the latest observation, so the two values agree.
  const tvlDelta = history ? buildProtocolDelta(history.tvl) : buildProtocolDelta([])
  const borrowedDelta = history ? buildProtocolDelta(history.borrowed) : buildProtocolDelta([])
  const suppliedDelta = history
    ? buildProtocolDelta(buildSuppliedSeries(history.tvl, history.borrowed))
    : buildProtocolDelta([])

  return {
    slug: cfg.slug,
    name: cfg.name,
    color: cfg.color,
    description: cfg.description,
    architecture: cfg.architecture,
    website: cfg.website,
    totalTvl,
    totalBorrowed,
    totalSupplied,
    utilizationPct: totalSupplied > 0 ? (totalBorrowed / totalSupplied) * 100 : 0,
    marketCount: pools.length,
    tvlDelta,
    borrowedDelta,
    suppliedDelta,
    markets,
    supplyByAssetSeries,
    borrowedByAssetSeries,
    topAssets,
    multiChainTvl: history?.multiChainTvl ?? {},
    multiChainBorrowed: history?.multiChainBorrowed ?? {},
    livenessSource,
    livenessScope,
  }
}

/** List all configured protocols — used to populate the selector tabs. */
export function listProtocols(): ProtocolConfig[] {
  return PROTOCOLS
}
