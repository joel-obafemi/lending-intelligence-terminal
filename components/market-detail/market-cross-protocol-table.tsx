import Link from "next/link"
import { formatPercent, formatUSD } from "@/lib/utils"
import type { MarketSibling } from "@/lib/market-detail"

interface Props {
  asset: string
  /** The market we're looking at — rendered first, highlighted. */
  current: {
    poolId: string
    protocolName: string
    protocolColor: string
    subLabel: string | null
    totalSupplyUsd: number
    totalBorrowUsd: number
    utilizationPct: number | null
    supplyApy: number | null
    borrowApy: number | null
  }
  siblings: MarketSibling[]
}

export function MarketCrossProtocolTable({ asset, current, siblings }: Props) {
  const rows = [{ ...current, isCurrent: true }, ...siblings.map((s) => ({ ...s, isCurrent: false }))]

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div
        className="border-b border-card-border flex items-center justify-between"
        style={{ padding: "10px 16px" }}
      >
        <span
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {asset} Across Protocols
        </span>
        <span className="text-[10px] text-text-muted">
          {rows.length === 1 ? "Only on this protocol" : "Live snapshot"}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Protocol</th>
              <th className="text-right">Total Supply</th>
              <th className="text-right">Borrowed</th>
              <th className="text-right">Util</th>
              <th className="text-right">Supply APY</th>
              <th className="text-right">Borrow APY</th>
              <th style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cellStyle = r.isCurrent
                ? { background: "var(--card-hover)" }
                : undefined
              return (
                <tr key={r.poolId} style={cellStyle}>
                  <td>
                    <div className="flex flex-col">
                      <span
                        className="inline-flex items-center gap-1.5"
                        style={{ color: r.protocolColor, fontWeight: r.isCurrent ? 600 : 500 }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: r.protocolColor }}
                        />
                        {r.protocolName}
                        {r.isCurrent && (
                          <span
                            className="text-[9px] uppercase tracking-[0.08em] ml-1 px-1 py-0.5 rounded"
                            style={{
                              background: "var(--card-border)",
                              color: "var(--text-muted)",
                            }}
                          >
                            Viewing
                          </span>
                        )}
                      </span>
                      {r.subLabel && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {r.subLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right tabular-nums">{formatUSD(r.totalSupplyUsd)}</td>
                  <td className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatUSD(r.totalBorrowUsd)}
                  </td>
                  <td className="text-right tabular-nums">
                    {r.utilizationPct != null ? formatPercent(r.utilizationPct, 1) : "—"}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {r.supplyApy != null ? formatPercent(r.supplyApy, 2) : "—"}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: "var(--danger)" }}>
                    {r.borrowApy != null ? formatPercent(r.borrowApy, 2) : "—"}
                  </td>
                  <td>
                    {!r.isCurrent && (
                      <Link
                        href={`/markets/${r.poolId}`}
                        className="text-[11px]"
                        style={{ color: "var(--accent-orange)" }}
                      >
                        ↗
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
