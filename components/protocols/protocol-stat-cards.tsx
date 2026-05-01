import { TrendingUp, TrendingDown, Lock, Activity, Coins } from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import type { ProtocolDetail } from "@/lib/protocol-detail"

interface Props {
  detail: ProtocolDetail
}

/**
 * Per-protocol headline counters. The first three (Supply / Borrows /
 * Available Liquidity) carry a 24h delta pill + 30d sparkline derived
 * from DefiLlama's daily history. Utilization is a ratio so it shows
 * the live value only.
 *
 * Morpho gets a 5th card — Idle Ratio (Available Liquidity ÷ Total
 * Supply). This is one of Morpho's signature metrics: vaults
 * intentionally hold idle capital, and the protocol-wide ratio answers
 * "how much of the deposit base is sitting unallocated right now". The
 * other three protocols report this implicitly via Utilization, so
 * they don't need a separate card.
 */
export function ProtocolStatCards({ detail }: Props) {
  const isMorpho = detail.slug === "morpho-blue"
  const idleRatioPct =
    detail.totalSupplied > 0 ? (detail.totalTvl / detail.totalSupplied) * 100 : 0

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${
        isMorpho ? "lg:grid-cols-5" : "lg:grid-cols-4"
      } gap-4`}
    >
      <MetricCard
        label="Total Supply"
        value={detail.totalSupplied}
        change24h={detail.suppliedDelta.change24h}
        sparkline={detail.suppliedDelta.sparkline}
        historyForDrawdown={detail.suppliedDelta.history}
        icon={<TrendingUp size={12} strokeWidth={2.5} />}
        accentColor="#10B981"
      />
      <MetricCard
        label="Total Borrows"
        value={detail.totalBorrowed}
        change24h={detail.borrowedDelta.change24h}
        sparkline={detail.borrowedDelta.sparkline}
        historyForDrawdown={detail.borrowedDelta.history}
        icon={<TrendingDown size={12} strokeWidth={2.5} />}
        accentColor="#EC4899"
      />
      <MetricCard
        label="Available Liquidity"
        value={detail.totalTvl}
        change24h={detail.tvlDelta.change24h}
        sparkline={detail.tvlDelta.sparkline}
        historyForDrawdown={detail.tvlDelta.history}
        icon={<Lock size={12} strokeWidth={2.5} />}
        accentColor={detail.color}
      />
      <MetricCard
        label="Utilization"
        value={detail.utilizationPct}
        format="percent"
        caption={`${detail.marketCount.toLocaleString()} markets`}
        icon={<Activity size={12} strokeWidth={2.5} />}
        accentColor="#B44AFF"
      />
      {isMorpho && (
        <MetricCard
          label="Idle Ratio"
          value={idleRatioPct}
          format="percent"
          caption="vault capital sitting unallocated"
          icon={<Coins size={12} strokeWidth={2.5} />}
          accentColor="#F59E0B"
        />
      )}
    </div>
  )
}
