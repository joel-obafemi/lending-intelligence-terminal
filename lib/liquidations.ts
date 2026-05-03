/**
 * Liquidation aggregations for the Stress Events page (Section 6 of
 * The Lending Pulse) and the Revenue page's liquidation-volume column.
 *
 * Source of truth: the liquidator-economy Neon DB's `liquidation_events`
 * table. Protocol slugs in that table are underscore-separated
 * (`aave_v3`, `morpho_blue`) — we translate to our dash-separated canonical
 * slugs on the way out.
 */
import { PROTOCOLS, PROTOCOL_BY_LIQUIDATOR_SLUG } from "./protocols"
import { liquidatorSql, hasLiquidatorDb } from "./liquidator-db"
import { getEthClient } from "./eth-rpc"

export interface LiquidationPeriodSnapshot {
  /** Unix seconds — inclusive lower bound */
  periodStart: number
  totalVolumeUsd: number
  totalCount: number
  totalGrossProfitUsd: number
}

export interface ProtocolLiquidationRow {
  slug: string
  name: string
  color: string
  volumeUsd: number
  count: number
  grossProfitUsd: number
  /** Average event size in USD */
  avgEventUsd: number
}

export interface LiquidationTimeseriesPoint {
  /** Week start (Mon 00:00 UTC) */
  timestamp: number
  [protocolSlug: string]: number
}

export interface LargestEvent {
  id: number
  timestamp: number
  protocolSlug: string
  liquidator: string
  borrower: string
  collateralSymbol: string | null
  debtSymbol: string | null
  debtUsd: number
  collateralUsd: number
  grossProfitUsd: number
  netProfitUsd: number
  txHash: string
  isFlashLoan: boolean
}

export interface CollateralRankRow {
  symbol: string
  volumeUsd: number
  count: number
  /** USD share of total in this period */
  sharePct: number
  /** Per-protocol volume breakdown */
  byProtocol: Record<string, number>
}

export interface LiquidatorLeaderboardRow {
  /** Liquidator wallet (lowercase 0x). */
  liquidator: string
  /** Best-effort ENS name for the wallet, null when unset. */
  ensName: string | null
  /** Trailing-window debt repaid USD (sum across events). */
  debtRepaidUsd: number
  /** Trailing-window gross profit USD (collat seized − debt repaid). */
  grossProfitUsd: number
  /** Event count in the window. */
  eventCount: number
  /** Distinct protocols this liquidator was active on (canonical
   *  dash-separated slugs). */
  protocols: string[]
}

export interface LiquidationResponse {
  available: boolean
  /** Period filter used (days lookback, 0 = all time) */
  periodDays: number
  snapshot: LiquidationPeriodSnapshot
  protocols: ProtocolLiquidationRow[]
  weeklyVolume: LiquidationTimeseriesPoint[]
  largestEvents: LargestEvent[]
  topCollateralAssets: CollateralRankRow[]
  fetchedAt: number
}

function mapSlug(liquidatorSlug: string): string | null {
  return PROTOCOL_BY_LIQUIDATOR_SLUG[liquidatorSlug] ?? null
}

function emptyResponse(periodDays: number): LiquidationResponse {
  return {
    available: false,
    periodDays,
    snapshot: {
      periodStart: 0,
      totalVolumeUsd: 0,
      totalCount: 0,
      totalGrossProfitUsd: 0,
    },
    protocols: [],
    weeklyVolume: [],
    largestEvents: [],
    topCollateralAssets: [],
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}

export async function loadLiquidations(periodDays: number = 90): Promise<LiquidationResponse> {
  if (!hasLiquidatorDb()) return emptyResponse(periodDays)

  const now = Math.floor(Date.now() / 1000)
  const periodStart = periodDays <= 0 ? 0 : now - periodDays * 86400

  // ─── Snapshot + per-protocol rollup ──────────────────────────────────────
  const perProtocol = await liquidatorSql<{
    protocol: string
    n: string
    volume: number | null
    gross_profit: number | null
  }>`
    SELECT
      protocol,
      COUNT(*)::bigint AS n,
      COALESCE(SUM(debt_amount_usd), 0) AS volume,
      COALESCE(SUM(gross_profit_usd), 0) AS gross_profit
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
    GROUP BY protocol
  `

  const protocols: ProtocolLiquidationRow[] = PROTOCOLS.map((p) => {
    const row = perProtocol.find((r) => mapSlug(r.protocol) === p.slug)
    const count = Number(row?.n ?? 0)
    const volumeUsd = Number(row?.volume ?? 0)
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      volumeUsd,
      count,
      grossProfitUsd: Number(row?.gross_profit ?? 0),
      avgEventUsd: count > 0 ? volumeUsd / count : 0,
    }
  }).sort((a, b) => b.volumeUsd - a.volumeUsd)

  const snapshot: LiquidationPeriodSnapshot = {
    periodStart,
    totalVolumeUsd: protocols.reduce((s, r) => s + r.volumeUsd, 0),
    totalCount: protocols.reduce((s, r) => s + r.count, 0),
    totalGrossProfitUsd: protocols.reduce((s, r) => s + r.grossProfitUsd, 0),
  }

  // ─── Weekly volume by protocol ───────────────────────────────────────────
  // Bucket by calendar week (Mon 00:00 UTC). Use date_trunc on a timestamp
  // reconstructed from block_timestamp seconds.
  const weeklyRows = await liquidatorSql<{
    week: Date
    protocol: string
    volume: number
  }>`
    SELECT
      date_trunc('week', to_timestamp(block_timestamp)) AS week,
      protocol,
      COALESCE(SUM(debt_amount_usd), 0) AS volume
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
    GROUP BY week, protocol
    ORDER BY week ASC
  `
  const weeklyMap = new Map<number, LiquidationTimeseriesPoint>()
  for (const r of weeklyRows) {
    const slug = mapSlug(r.protocol)
    if (!slug) continue
    const ts = Math.floor(new Date(r.week).getTime() / 1000)
    const volPoint = weeklyMap.get(ts) ?? ({ timestamp: ts } as LiquidationTimeseriesPoint)
    volPoint[slug] = (volPoint[slug] ?? 0) + Number(r.volume)
    weeklyMap.set(ts, volPoint)
  }
  const weeklyVolume = [...weeklyMap.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((pt) => {
      for (const p of PROTOCOLS) if (pt[p.slug] == null) pt[p.slug] = 0
      return pt
    })

  // ─── Largest 20 events in the period ─────────────────────────────────────
  const largestRows = await liquidatorSql<{
    id: number
    block_timestamp: string
    protocol: string
    liquidator: string
    borrower: string
    collateral_symbol: string | null
    debt_symbol: string | null
    debt_amount_usd: number | null
    collateral_amount_usd: number | null
    gross_profit_usd: number | null
    net_profit_usd: number | null
    tx_hash: string
    is_flash_loan: boolean | null
  }>`
    SELECT
      id, block_timestamp, protocol, liquidator, borrower,
      collateral_symbol, debt_symbol,
      debt_amount_usd, collateral_amount_usd,
      gross_profit_usd, net_profit_usd,
      tx_hash, is_flash_loan
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
      AND debt_amount_usd IS NOT NULL
    ORDER BY debt_amount_usd DESC
    LIMIT 20
  `
  const largestEvents: LargestEvent[] = largestRows
    .map((r) => {
      const slug = mapSlug(r.protocol)
      if (!slug) return null
      return {
        id: r.id,
        timestamp: Number(r.block_timestamp),
        protocolSlug: slug,
        liquidator: r.liquidator,
        borrower: r.borrower,
        collateralSymbol: r.collateral_symbol,
        debtSymbol: r.debt_symbol,
        debtUsd: Number(r.debt_amount_usd ?? 0),
        collateralUsd: Number(r.collateral_amount_usd ?? 0),
        grossProfitUsd: Number(r.gross_profit_usd ?? 0),
        netProfitUsd: Number(r.net_profit_usd ?? 0),
        txHash: r.tx_hash,
        isFlashLoan: !!r.is_flash_loan,
      }
    })
    .filter((x): x is LargestEvent => x !== null)

  // ─── Top collateral assets by liquidation volume ─────────────────────────
  const collateralRows = await liquidatorSql<{
    collateral_symbol: string | null
    protocol: string
    volume: number
    n: string
  }>`
    SELECT
      collateral_symbol,
      protocol,
      COALESCE(SUM(debt_amount_usd), 0) AS volume,
      COUNT(*)::bigint AS n
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
      AND collateral_symbol IS NOT NULL
    GROUP BY collateral_symbol, protocol
  `
  const collateralAgg = new Map<string, { volumeUsd: number; count: number; byProtocol: Record<string, number> }>()
  for (const r of collateralRows) {
    const slug = mapSlug(r.protocol)
    if (!slug || !r.collateral_symbol) continue
    const key = r.collateral_symbol.toUpperCase()
    const entry = collateralAgg.get(key) ?? { volumeUsd: 0, count: 0, byProtocol: {} }
    entry.volumeUsd += Number(r.volume)
    entry.count += Number(r.n)
    entry.byProtocol[slug] = (entry.byProtocol[slug] ?? 0) + Number(r.volume)
    collateralAgg.set(key, entry)
  }
  const totalCollateralVolume = [...collateralAgg.values()].reduce((s, e) => s + e.volumeUsd, 0)
  const topCollateralAssets: CollateralRankRow[] = [...collateralAgg.entries()]
    .map(([symbol, entry]) => ({
      symbol,
      volumeUsd: entry.volumeUsd,
      count: entry.count,
      sharePct: totalCollateralVolume > 0 ? (entry.volumeUsd / totalCollateralVolume) * 100 : 0,
      byProtocol: entry.byProtocol,
    }))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, 12)

  return {
    available: true,
    periodDays,
    snapshot,
    protocols,
    weeklyVolume,
    largestEvents,
    topCollateralAssets,
    fetchedAt: Math.floor(Date.now() / 1000),
  }
}

/**
 * Top liquidator wallets ranked by trailing-window gross profit.
 *
 * Pulls from the same `liquidation_events` table the rest of this
 * file uses; reads gross_profit_usd directly when populated, falls
 * back to (collateral_amount_usd − debt_amount_usd) otherwise.
 *
 * Best-effort ENS lookup via the public RPC client. Each ENS lookup
 * is wrapped in a try/catch — wallets without ENS, or RPC blips,
 * just resolve to null and fall through to the truncated address.
 */
export async function loadLiquidatorLeaderboard(
  periodDays: number = 90,
  limit: number = 10,
): Promise<LiquidatorLeaderboardRow[]> {
  if (!hasLiquidatorDb()) return []
  const periodStart =
    periodDays <= 0 ? 0 : Math.floor(Date.now() / 1000) - periodDays * 86400

  const rows = await liquidatorSql<{
    liquidator: string
    debt: number
    profit: number
    n: string
    protocols: string[]
  }>`
    SELECT
      lower(liquidator) AS liquidator,
      COALESCE(SUM(debt_amount_usd), 0) AS debt,
      COALESCE(
        SUM(
          COALESCE(
            gross_profit_usd,
            collateral_amount_usd - debt_amount_usd
          )
        ),
        0
      ) AS profit,
      COUNT(*)::bigint AS n,
      array_agg(DISTINCT protocol) AS protocols
    FROM liquidation_events
    WHERE block_timestamp >= ${periodStart}
      AND liquidator IS NOT NULL
    GROUP BY lower(liquidator)
    HAVING COALESCE(
      SUM(
        COALESCE(
          gross_profit_usd,
          collateral_amount_usd - debt_amount_usd
        )
      ),
      0
    ) > 0
    ORDER BY profit DESC
    LIMIT ${limit}
  `

  // Map liquidator-DB protocol slugs back to canonical dash-form, then
  // dedupe + filter unmapped.
  const base: LiquidatorLeaderboardRow[] = rows.map((r) => ({
    liquidator: r.liquidator,
    ensName: null,
    debtRepaidUsd: Number(r.debt ?? 0),
    grossProfitUsd: Number(r.profit ?? 0),
    eventCount: Number(r.n ?? 0),
    protocols: Array.from(
      new Set(
        (r.protocols ?? [])
          .map((p) => PROTOCOL_BY_LIQUIDATOR_SLUG[p])
          .filter((p): p is string => !!p),
      ),
    ).sort(),
  }))

  // Best-effort ENS resolution. Run in parallel with a per-call
  // try/catch so a single rate-limited / unmapped wallet doesn't
  // poison the whole batch.
  try {
    const client = getEthClient()
    await Promise.all(
      base.map(async (row, i) => {
        try {
          const name = await client.getEnsName({
            address: row.liquidator as `0x${string}`,
          })
          if (name) base[i].ensName = name
        } catch {
          /* leave ensName null */
        }
      }),
    )
  } catch (err: any) {
    console.error("[liquidations] ENS lookup batch failed:", err?.message ?? err)
  }
  return base
}
