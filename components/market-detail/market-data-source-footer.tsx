import type { DataSourceProvenance } from "@/lib/market-detail"

interface Props {
  poolId: string
  sources: DataSourceProvenance
}

const LABEL: Record<string, string> = {
  morpho: "Morpho API",
  aave: "Aave V3 on-chain",
  spark: "SparkLend on-chain",
  fluid: "Fluid on-chain",
  defillama: "DefiLlama (borrow APY derived from util)",
  "rate-snapshots": "Datum daily snapshot",
  "morpho-vault": "Morpho vault allocation",
  "morpho-market": "Morpho market collateral",
  none: "—",
}

function lbl(k: string): string {
  return LABEL[k] ?? k
}

/**
 * Small attribution strip at the bottom of the market detail page. Lays out
 * which provider supplied each section so users can read the page with
 * appropriate calibration (e.g. "history is ~3y from DefiLlama vs ~90d from
 * Morpho — they're showing you different windows for the same metric").
 */
export function MarketDataSourceFooter({ poolId, sources }: Props) {
  return (
    <div
      className="text-[10px] border-t border-card-border pt-3 pb-1 flex items-center justify-between flex-wrap gap-2"
      style={{ color: "var(--text-muted)" }}
    >
      <span className="flex items-center gap-3 flex-wrap">
        <span>State: <strong style={{ color: "var(--text-secondary)" }}>{lbl(sources.state)}</strong></span>
        <span style={{ color: "var(--card-border)" }}>·</span>
        <span>History: <strong style={{ color: "var(--text-secondary)" }}>{lbl(sources.history)}</strong></span>
        <span style={{ color: "var(--card-border)" }}>·</span>
        <span>IRM curve: <strong style={{ color: "var(--text-secondary)" }}>{lbl(sources.irm)}</strong></span>
        <span style={{ color: "var(--card-border)" }}>·</span>
        <span>Composition: <strong style={{ color: "var(--text-secondary)" }}>{lbl(sources.composition)}</strong></span>
      </span>
      <span style={{ fontFamily: "JetBrains Mono, monospace" }}>Pool {poolId.slice(0, 8)}…</span>
    </div>
  )
}
