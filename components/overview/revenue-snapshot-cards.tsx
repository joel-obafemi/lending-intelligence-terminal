"use client"

import { LineChart, Line, ResponsiveContainer } from "recharts"
import { formatUSD, formatPercent } from "@/lib/utils"
import type { ProtocolRevenueSnapshot } from "@/lib/overview"
import type { RevenueVerdict } from "@/lib/revenue-verdict"

interface Props {
  rows: ProtocolRevenueSnapshot[]
  /** When provided, each card surfaces its protocol's MoM delta + a
   *  30-day fees sparkline. Built server-side from
   *  `computeRevenueVerdict.perProtocolMom`. */
  momByProtocol?: RevenueVerdict["perProtocolMom"]
}

/** Per-protocol explainer for cells that read confusingly without
 *  context. Currently only Morpho's 0% capture rate — pass-through
 *  design is intentional, not a data bug. */
const PROTOCOL_NOTE: Record<string, string> = {
  "morpho-blue":
    "Pass-through design: Morpho routes all fees to depositors and curators. Protocol-level capture is 0% by design.",
}

export function RevenueSnapshotCards({ rows, momByProtocol }: Props) {
  const momIndex = new Map<string, RevenueVerdict["perProtocolMom"][number]>()
  if (momByProtocol) {
    for (const m of momByProtocol) momIndex.set(m.slug, m)
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r) => {
        const mom = momIndex.get(r.slug)
        const note = PROTOCOL_NOTE[r.slug]
        const hasSpark = mom?.sparkline && mom.sparkline.length > 1
        const deltaPct = mom?.changePct ?? null
        const deltaPositive = (deltaPct ?? 0) >= 0
        return (
          <div
            key={r.slug}
            className="tui-card bg-card-bg border border-card-border rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-[2px]"
              style={{ backgroundColor: r.color }}
            />
            <div className="pl-2">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.12em] truncate"
                    style={{ color: r.color }}
                  >
                    {r.name}
                  </span>
                </div>
                {hasSpark && (
                  <div className="w-[60px] h-[18px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mom!.sparkline}>
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={r.color}
                          strokeWidth={1.25}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                <span className="text-lg font-semibold tabular-nums">
                  {formatUSD(r.fees30d)}
                </span>
                <span className="text-[10px] text-text-muted">30d fees</span>
                {deltaPct != null && (
                  <span
                    className="text-[10px] tabular-nums"
                    style={{
                      color: deltaPositive ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {deltaPositive ? "+" : ""}
                    {deltaPct.toFixed(0)}% MoM
                  </span>
                )}
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
              {note && (
                <div
                  className="text-[10px] leading-snug mt-1.5 italic"
                  style={{ color: "var(--text-muted)" }}
                  title={note}
                >
                  {note}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
