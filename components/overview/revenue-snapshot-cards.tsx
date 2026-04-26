"use client"

import { formatUSD, formatPercent } from "@/lib/utils"
import type { ProtocolRevenueSnapshot } from "@/lib/overview"

interface Props {
  rows: ProtocolRevenueSnapshot[]
}

export function RevenueSnapshotCards({ rows }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {rows.map((r) => (
        <div
          key={r.slug}
          className="tui-card bg-card-bg border border-card-border rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden"
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-[2px]"
            style={{ backgroundColor: r.color }}
          />
          <div className="pl-2">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: r.color }}>
                {r.name}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-lg font-semibold tabular-nums">{formatUSD(r.fees30d)}</span>
              <span className="text-[10px] text-text-muted">30d fees</span>
            </div>
            <div className="flex items-baseline justify-between text-[10px] text-text-muted">
              <span>
                Rev/TVL{" "}
                <span style={{ color: "var(--text-secondary)" }}>
                  {formatPercent(r.revPerTvlAnnualized, 2)}
                </span>
              </span>
              <span>Cum. {formatUSD(r.cumulativeFees)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
