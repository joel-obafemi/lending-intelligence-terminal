import { ASSET_TYPE_LABEL, type AssetType } from "@/lib/assets"
import { formatPercent, formatUSD } from "@/lib/utils"

interface Props {
  protocolName: string
  protocolArchitecture: string
  protocolWebsite: string
  chain: string
  asset: string
  assetType: AssetType
  poolId: string
  defillamaProject: string
  subLabel: string | null
  // Risk
  collateralFactor: number | null   // 0-1
  liquidationThreshold: number | null
  reserveFactor: number | null
  fee: number | null
  // APYs
  apyMean30d: number | null         // already in percent
  apyBaseInception: number | null
  // Caps
  supplyCapUsd: number | null
  borrowCapUsd: number | null
  // Misc
  underlyingPriceUsd: number | null
}

interface Row {
  label: string
  value: React.ReactNode
}

const N_A: React.ReactNode = <span style={{ color: "var(--text-muted)" }}>—</span>

function pct(v: number | null, decimals = 0): React.ReactNode {
  return v == null ? N_A : formatPercent(v, decimals)
}

function fracAsPct(v: number | null, decimals = 0): React.ReactNode {
  return v == null ? N_A : formatPercent(v * 100, decimals)
}

function usd(v: number | null): React.ReactNode {
  return v == null ? N_A : formatUSD(v)
}

export function MarketParametersCard(p: Props) {
  const ltvLabel = p.protocolArchitecture === "isolated" ? "LLTV" : "Collateral Factor"
  const rows: Row[] = [
    { label: "Protocol", value: p.protocolName },
    { label: "Architecture", value: p.protocolArchitecture },
    { label: "Chain", value: p.chain },
    { label: "Asset", value: p.asset },
    { label: "Asset Type", value: ASSET_TYPE_LABEL[p.assetType] },
    { label: "Sub-label", value: p.subLabel ?? N_A },
    {
      label: "Underlying Price",
      value:
        p.underlyingPriceUsd != null
          ? `$${p.underlyingPriceUsd >= 1 ? p.underlyingPriceUsd.toFixed(2) : p.underlyingPriceUsd.toFixed(4)}`
          : N_A,
    },
    { label: ltvLabel, value: fracAsPct(p.collateralFactor) },
    { label: "Liquidation Threshold", value: fracAsPct(p.liquidationThreshold) },
    { label: "Reserve Factor", value: fracAsPct(p.reserveFactor, 2) },
    { label: "Performance Fee", value: fracAsPct(p.fee, 2) },
    { label: "Supply Cap", value: usd(p.supplyCapUsd) },
    { label: "Borrow Cap", value: usd(p.borrowCapUsd) },
    { label: "30d Mean Supply APY", value: pct(p.apyMean30d, 2) },
    { label: "Inception Base APY", value: pct(p.apyBaseInception, 2) },
    {
      label: "DefiLlama Project",
      value: (
        <a
          href={`https://defillama.com/yields/pool/${p.poolId}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent-orange)" }}
        >
          {p.defillamaProject} ↗
        </a>
      ),
    },
    {
      label: "Pool ID",
      value: (
        <code
          className="text-[10px]"
          style={{
            background: "var(--card-hover)",
            padding: "1px 4px",
            borderRadius: "3px",
            color: "var(--text-muted)",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {p.poolId.slice(0, 12)}…
        </code>
      ),
    },
    {
      label: "Protocol Site",
      value: (
        <a
          href={p.protocolWebsite}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent-orange)" }}
        >
          {p.protocolWebsite.replace(/^https?:\/\//, "")} ↗
        </a>
      ),
    },
  ]

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden flex flex-col">
      <div className="border-b border-card-border" style={{ padding: "10px 16px" }}>
        <span
          className="text-accent"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Market Parameters
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6" style={{ padding: "12px 18px" }}>
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between py-2 border-b border-card-border/30 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            style={{ minHeight: "32px" }}
          >
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {r.label}
            </span>
            <span className="text-[11px] font-medium text-right" style={{ color: "var(--text-primary)" }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
