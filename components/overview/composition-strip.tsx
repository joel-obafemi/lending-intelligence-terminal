/**
 * Composition Strip — Zone 3 of the Sector Overview rebuild.
 *
 * Four dense per-protocol cards (one per protocol) showing TVL / Borrows /
 * Utilization / Revenue 30d / Net deposits 30d, plus a single auto-generated
 * "biggest mover" line beneath the strip.
 *
 * Server component — pure shape, no interactivity.
 */
import Link from "next/link"
import { formatUSD, formatPercent } from "@/lib/utils"
import { PROTOCOLS } from "@/lib/protocols"
import { formatUsdShort } from "@/lib/headline-sentence"
import type {
  OverviewProtocolRow,
  ProtocolRevenueSnapshot,
} from "@/lib/overview"

interface Props {
  protocols: OverviewProtocolRow[]
  revenueSnapshot: ProtocolRevenueSnapshot[]
  /** Trailing-30d net deposits per protocol slug. */
  netDeposits30d: Record<string, number>
  biggestMover: { slug: string; name: string; usd: number } | null
}

interface MetricRowProps {
  label: string
  value: string
  tone?: "default" | "positive" | "negative" | "muted"
}

function MetricRow({ label, value, tone = "default" }: MetricRowProps) {
  const color =
    tone === "positive"
      ? "var(--success)"
      : tone === "negative"
      ? "var(--danger)"
      : tone === "muted"
      ? "var(--text-muted)"
      : "var(--text-primary)"
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="text-[12px] tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

export function CompositionStrip({
  protocols,
  revenueSnapshot,
  netDeposits30d,
  biggestMover,
}: Props) {
  const revBySlug = new Map(revenueSnapshot.map((r) => [r.slug, r]))
  // Render in the canonical PROTOCOLS order so cards stay in a stable
  // left-to-right sequence regardless of latest TVL ordering.
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PROTOCOLS.map((p) => {
          const row = protocols.find((r) => r.slug === p.slug)
          const rev = revBySlug.get(p.slug)
          const net = netDeposits30d[p.slug] ?? 0
          return (
            <div
              key={p.slug}
              className="tui-card bg-card-bg border border-card-border rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center justify-between"
                style={{ padding: "8px 12px", borderBottom: "1px solid var(--card-border)", background: "var(--panel-header)" }}
              >
                <Link
                  href={`/protocols?p=${p.slug}`}
                  className="flex items-center gap-2"
                  style={{ textDecoration: "none" }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span
                    className="text-[11px] font-bold uppercase tracking-[0.1em]"
                    style={{ color: p.color }}
                  >
                    {p.name}
                  </span>
                </Link>
                <span
                  className="text-[9px] uppercase tracking-[0.08em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {p.architecture}
                </span>
              </div>
              <div className="px-3 py-2 divide-y" style={{ borderColor: "var(--card-border)" }}>
                <MetricRow label="TVL" value={formatUSD(row?.tvl ?? 0)} />
                <MetricRow label="Borrows" value={formatUSD(row?.borrowed ?? 0)} />
                <MetricRow
                  label="Utilization"
                  value={formatPercent(row?.utilizationPct ?? 0, 1)}
                />
                <MetricRow
                  label="Fees 24h"
                  value={formatUSD(row?.fees24h ?? 0)}
                  tone="muted"
                />
                <MetricRow
                  label="Fees 7d"
                  value={formatUSD(row?.fees7d ?? 0)}
                  tone="muted"
                />
                <MetricRow
                  label="Revenue 30d"
                  value={formatUSD(rev?.fees30d ?? 0)}
                />
                <MetricRow
                  label="Net deposits 30d"
                  value={`${net >= 0 ? "+" : "−"}${formatUSD(Math.abs(net))}`}
                  tone={net >= 0 ? "positive" : "negative"}
                />
              </div>
            </div>
          )
        })}
      </div>
      {biggestMover && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          <span style={{ color: "var(--accent-orange)", fontWeight: 600 }}>
            {biggestMover.name}
          </span>{" "}
          {biggestMover.usd >= 0 ? "led the sector" : "led outflows"} with{" "}
          {biggestMover.usd >= 0 ? "+" : "−"}
          {formatUsdShort(Math.abs(biggestMover.usd))} of net{" "}
          {biggestMover.usd >= 0 ? "deposits" : "withdrawals"} over the past
          30 days.
        </p>
      )}
    </div>
  )
}
