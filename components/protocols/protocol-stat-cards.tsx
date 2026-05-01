import { TrendingUp, TrendingDown, Lock, Activity } from "lucide-react"
import { MetricCard } from "@/components/metric-card"
import type { ProtocolDetail } from "@/lib/protocol-detail"

interface Props {
  detail: ProtocolDetail
}

/**
 * Per-protocol headline counters. The first three (Supply / Borrows / TVL)
 * carry a 24h delta pill + 30d sparkline derived from DefiLlama's daily
 * history. Utilization is a ratio, so it shows the live value only — a
 * delta there would be confusingly small (basis points day-over-day).
 */
export function ProtocolStatCards({ detail }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Total Supply"
        value={detail.totalSupplied}
        change24h={detail.suppliedDelta.change24h}
        sparkline={detail.suppliedDelta.sparkline}
        icon={<TrendingUp size={12} strokeWidth={2.5} />}
        accentColor="#10B981"
      />
      <MetricCard
        label="Total Borrows"
        value={detail.totalBorrowed}
        change24h={detail.borrowedDelta.change24h}
        sparkline={detail.borrowedDelta.sparkline}
        icon={<TrendingDown size={12} strokeWidth={2.5} />}
        accentColor="#EC4899"
      />
      <MetricCard
        label="Available Liquidity"
        value={detail.totalTvl}
        change24h={detail.tvlDelta.change24h}
        sparkline={detail.tvlDelta.sparkline}
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
    </div>
  )
}
