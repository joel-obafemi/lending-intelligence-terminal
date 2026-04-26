import { loadOverview } from "@/lib/overview"
import { loadLiquidations } from "@/lib/liquidations"
import { loadRevenueDecomp } from "@/lib/revenue-decomp"
import { RevenueSnapshotCards } from "@/components/overview/revenue-snapshot-cards"
import { RevenueBarChart } from "@/components/overview/revenue-bar-chart"
import { CumulativeRevenueChart } from "@/components/overview/cumulative-revenue-chart"
import { RevenueDecompCards } from "@/components/overview/revenue-decomp-cards"
import { RevenueByRecipientChart } from "@/components/overview/revenue-by-recipient-chart"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function RevenuePage() {
  const [data, liq, decomp] = await Promise.all([
    loadOverview(),
    loadLiquidations(90),
    loadRevenueDecomp(90),
  ])

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <div>
        <h1 className="text-[13px] uppercase tracking-[0.15em] text-text-muted mb-1">
          Revenue &amp; Protocol Economics
        </h1>
        <p className="text-xs text-text-muted">
          Daily fees, cumulative revenue, and who keeps what across {data.protocols.length}{" "}
          Ethereum lending protocols. Authoritative recipient split from DefiLlama, with the
          liquidation source-split estimated from the Liquidator Economy DB.
        </p>
      </div>

      {/* Top-line 30d snapshot (existing) */}
      <RevenueSnapshotCards rows={data.revenueSnapshot} />

      {/* Decomposition cards — per-protocol captive share + est. liquidation share */}
      <RevenueDecompCards rows={decomp.protocols} windowDays={decomp.windowDays} />

      {/* Weekly revenue bars + cumulative line */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueBarChart title="Weekly Fees by Protocol" data={data.feesWeeklySeries} />
        <CumulativeRevenueChart
          title="Cumulative Fees by Protocol"
          data={data.cumulativeFeesSeries}
        />
      </div>

      {/* Per-protocol revenue-by-recipient stacked bars */}
      <h2 className="text-[11px] uppercase tracking-[0.15em] text-text-muted pt-2">
        Revenue by Recipient · per protocol
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {decomp.protocols.map((p) => (
          <RevenueByRecipientChart
            key={p.slug}
            title={`${p.name} · Weekly Revenue`}
            subtitle="Supply-side / Protocol / Holders"
            color={p.color}
            data={p.weekly}
          />
        ))}
      </div>

      {/* Liquidation volume comparison (existing) + methodology note */}
      {liq.available && (
        <RevenueBarChart
          title="Weekly Liquidation Volume by Protocol (for comparison)"
          data={liq.weeklyVolume}
        />
      )}

      <div
        className="text-[11px] leading-relaxed border border-card-border rounded px-4 py-3"
        style={{ background: "var(--card-bg)", color: "var(--text-muted)" }}
      >
        <span
          className="text-[10px] uppercase tracking-[0.12em] mr-2"
          style={{ color: "var(--accent-orange)", fontWeight: 700 }}
        >
          Methodology
        </span>
        {decomp.methodology}
      </div>
    </div>
  )
}
