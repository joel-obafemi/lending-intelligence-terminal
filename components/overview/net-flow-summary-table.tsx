/**
 * Net Flow Summary Table — replaces the v1 horizontal bar chart for Zone 4.
 *
 * The v1 stacked-bar chart broke when one protocol's flow was 30× larger
 * than the others (Aave's −$14.28B drowned out the other three). A small
 * table with the four numbers and a takeaway sentence reads cleaner and
 * stays honest at any flow magnitude. Columns: protocol, total 30d net,
 * organic share, interest accrual, % of current TVL.
 */
import { formatUSD, formatPercent } from "@/lib/utils"
import { formatUsdShort } from "@/lib/headline-sentence"
import { MethodologyTooltip } from "./methodology-tooltip"
import { PROTOCOLS } from "@/lib/protocols"
import type { OverviewProtocolRow } from "@/lib/overview"

interface Props {
  netDeposits30d: Record<string, number>
  interest30d: Record<string, number>
  protocols: OverviewProtocolRow[]
  methodologyKey?: string
}

interface Row {
  slug: string
  name: string
  color: string
  total: number
  interest: number
  organic: number
  organicSharePct: number | null
  pctOfTvl: number | null
}

function buildRows(
  netDeps: Record<string, number>,
  interest: Record<string, number>,
  protocols: OverviewProtocolRow[],
): Row[] {
  return PROTOCOLS.map((p) => {
    const total = netDeps[p.slug] ?? 0
    const interestVal = interest[p.slug] ?? 0
    const organic = total - interestVal
    const protoRow = protocols.find((r) => r.slug === p.slug)
    const tvl = protoRow?.tvl ?? 0
    return {
      slug: p.slug,
      name: p.name,
      color: p.color,
      total,
      interest: interestVal,
      organic,
      // "Organic share" only really reads for inflows. For a negative total
      // we report the organic component's share of the ABSOLUTE flow.
      organicSharePct:
        Math.abs(total) > 0 ? (Math.abs(organic) / Math.abs(total)) * 100 : null,
      pctOfTvl: tvl > 0 ? (total / tvl) * 100 : null,
    }
  }).sort((a, b) => b.total - a.total)
}

function buildTakeaway(rows: Row[]): string | null {
  if (rows.length === 0) return null
  const inflows = rows.filter((r) => r.total > 0)
  const outflows = rows.filter((r) => r.total < 0)
  if (outflows.length === 0 && inflows.length === 0) return null

  // Largest outflow vs largest inflow + the "only positive" or "only negative"
  // language when one side dominates. Tries to read like a human-written lede.
  const biggestOut = outflows.length > 0 ? outflows.reduce((b, r) => (Math.abs(r.total) > Math.abs(b.total) ? r : b)) : null
  const biggestIn = inflows.length > 0 ? inflows.reduce((b, r) => (r.total > b.total ? r : b)) : null

  const parts: string[] = []
  if (biggestOut) {
    const organicShare = biggestOut.organicSharePct
    parts.push(
      `${biggestOut.name} saw ${formatUsdShort(Math.abs(biggestOut.total))} leave (${organicShare != null ? `${organicShare.toFixed(0)}% organic` : "organic share unavailable"})`,
    )
  }
  if (biggestIn) {
    const onlyPos = inflows.length === 1
    parts.push(
      `${biggestIn.name} added ${formatUsdShort(biggestIn.total)} of net new deposits${onlyPos ? " — the only protocol with positive flows this month" : ""}`,
    )
  }
  return parts.join(". ") + "."
}

export function NetFlowSummaryTable({
  netDeposits30d,
  interest30d,
  protocols,
  methodologyKey,
}: Props) {
  const rows = buildRows(netDeposits30d, interest30d, protocols)
  const takeaway = buildTakeaway(rows)

  return (
    <div className="space-y-2">
      <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
        <div
          className="border-b border-card-border flex items-center justify-between"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Net Supply Flows · Trailing 30 days
            <MethodologyTooltip methodologyKey={methodologyKey} />
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Organic = Total − Interest accrual
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th className="text-right">Total 30d</th>
                <th className="text-right">Organic deposits</th>
                <th className="text-right">Interest accrual</th>
                <th className="text-right">Organic share</th>
                <th className="text-right">% of current TVL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const totalColor =
                  r.total === 0
                    ? "var(--text-muted)"
                    : r.total > 0
                    ? "var(--success)"
                    : "var(--danger)"
                return (
                  <tr key={r.slug}>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5"
                        style={{ color: r.color }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.name}
                      </span>
                    </td>
                    <td className="text-right tabular-nums" style={{ color: totalColor, fontWeight: 600 }}>
                      {r.total >= 0 ? "+" : "−"}
                      {formatUSD(Math.abs(r.total))}
                    </td>
                    <td
                      className="text-right tabular-nums"
                      style={{ color: r.organic >= 0 ? "var(--success)" : "var(--danger)" }}
                    >
                      {r.organic >= 0 ? "+" : "−"}
                      {formatUSD(Math.abs(r.organic))}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      +{formatUSD(r.interest)}
                    </td>
                    <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {r.organicSharePct != null ? formatPercent(r.organicSharePct, 0) : "—"}
                    </td>
                    <td
                      className="text-right tabular-nums"
                      style={{ color: r.pctOfTvl != null && r.pctOfTvl < 0 ? "var(--danger)" : "var(--text-muted)" }}
                    >
                      {r.pctOfTvl != null
                        ? `${r.pctOfTvl >= 0 ? "+" : "−"}${Math.abs(r.pctOfTvl).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {takeaway && (
        <p
          className="text-[12px] leading-relaxed px-1"
          style={{ color: "var(--text-secondary)" }}
        >
          {takeaway}
        </p>
      )}
    </div>
  )
}
