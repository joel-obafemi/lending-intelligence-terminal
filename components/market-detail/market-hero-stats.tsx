import { ASSET_TYPE_COLOR, ASSET_TYPE_LABEL, type AssetType } from "@/lib/assets"
import { formatUSD } from "@/lib/utils"

interface Props {
  asset: string
  subLabel: string | null
  assetType: AssetType
  protocolName: string
  protocolColor: string
  protocolArchitecture: string
  chain: string
  underlyingPriceUsd: number | null

  totalSupplyUsd: number
  totalSupplyToken: number | null
  totalBorrowUsd: number
  totalBorrowToken: number | null
  availableLiquidityUsd: number
  availableLiquidityToken: number | null
  reservesUsd: number | null
  reservesToken: number | null
  /** Reserve factor 0-1 fraction, used to caption the Reserves card. */
  reserveFactor: number | null
  /** Optional loan asset for cross-asset vaults (Fluid wstETH/ETH etc).
   *  When set AND different from `asset`, the hero swaps to a paired
   *  layout: identity reads "<collateral> / <loan>", borrow tokens are
   *  denominated in `loanSymbol`, and the third stat becomes "Net
   *  Collateral" (supply USD − borrow USD) since "Available Liquidity"
   *  doesn't apply when supply and borrow are different assets. */
  loanSymbol?: string | null
  loanPriceUsd?: number | null
  /** Optional vault id to show next to the pair (Fluid vaults are
   *  numbered: #13, #14…). Surfaced after the pair when set. */
  vaultId?: number | null
}

/** Compact token-amount formatter — "14.79M USDC", "2.13K WSTETH". */
function formatTokenAmount(qty: number | null, symbol: string): string | null {
  if (qty == null || !Number.isFinite(qty)) return null
  const abs = Math.abs(qty)
  let v: string
  if (abs >= 1e9) v = `${(qty / 1e9).toFixed(2)}B`
  else if (abs >= 1e6) v = `${(qty / 1e6).toFixed(2)}M`
  else if (abs >= 1e3) v = `${(qty / 1e3).toFixed(2)}K`
  else if (abs >= 1) v = qty.toFixed(2)
  else v = qty.toFixed(4)
  return `${v} ${symbol}`
}

function formatPrice(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—"
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (p >= 1) return `$${p.toFixed(2)}`
  return `$${p.toFixed(4)}`
}

interface StatProps {
  label: string
  usd: number | null
  tokenAmount: string | null
  emptyHint?: string
  /** Optional methodology line rendered as a small italic note beneath
   *  the token amount. Used on the Reserves cell to frame reserve-factor
   *  context — e.g. why Spark's reserves are tiny ($10K) compared to
   *  Aave's ($500K+). */
  context?: string
}

function Stat({ label, usd, tokenAmount, emptyHint, context }: StatProps) {
  const hasValue = usd != null && Number.isFinite(usd) && usd > 0
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-2xl font-semibold tabular-nums"
        style={{ color: hasValue ? "var(--text-primary)" : "var(--text-muted)" }}
      >
        {hasValue ? formatUSD(usd) : "—"}
      </span>
      <span
        className="text-[11px] tabular-nums"
        style={{ color: "var(--text-muted)" }}
      >
        {hasValue && tokenAmount ? tokenAmount : (hasValue ? "" : emptyHint ?? "")}
      </span>
      {context && hasValue && (
        <span
          className="text-[10px] leading-snug"
          style={{ color: "var(--text-muted)", fontStyle: "italic" }}
        >
          {context}
        </span>
      )}
    </div>
  )
}

/** Build a one-line context note for the Reserves cell. Frames the
 *  reserve-factor story so a reader doesn't read a small reserves USD as
 *  a data bug — Spark's 5% reserve factor leaves only $10K in protocol
 *  reserves on a $200M market, which is by design. */
function reservesContext(reserveFactor: number | null): string | undefined {
  if (reserveFactor == null || !Number.isFinite(reserveFactor)) return undefined
  const pct = reserveFactor * 100
  // Round to a clean integer when the on-chain value isn't perfectly
  // round (Aave / Spark sometimes set 7.5% etc).
  const display = pct.toFixed(pct < 10 && Math.abs(pct - Math.round(pct)) > 0.01 ? 1 : 0)
  if (pct <= 5) {
    return `${display}% reserve factor — most borrow interest flows to depositors.`
  }
  if (pct >= 25) {
    return `${display}% reserve factor — protocol retains an above-average cut.`
  }
  return `${display}% reserve factor — protocol's cut of borrow interest.`
}

export function MarketHeroStats({
  asset,
  subLabel,
  assetType,
  protocolName,
  protocolColor,
  protocolArchitecture,
  chain,
  underlyingPriceUsd,
  totalSupplyUsd,
  totalSupplyToken,
  totalBorrowUsd,
  totalBorrowToken,
  availableLiquidityUsd,
  availableLiquidityToken,
  reservesUsd,
  reservesToken,
  reserveFactor,
  loanSymbol,
  loanPriceUsd,
  vaultId,
}: Props) {
  const typeColor = ASSET_TYPE_COLOR[assetType]
  const typeLabel = ASSET_TYPE_LABEL[assetType]
  // Cross-asset vault when caller provides a loan asset distinct from
  // the collateral. Fluid wstETH/ETH lands here; same-asset Fluid vaults
  // (USDC supplied, USDC borrowed) take the standard layout.
  const isCrossAsset = !!loanSymbol && loanSymbol.toUpperCase() !== asset.toUpperCase()
  // For vaults, "Total Borrowed" really means "Currently Deployed into markets".
  // Keep the label uniform but disambiguate via the secondary line if needed.
  const borrowLabel =
    protocolArchitecture === "isolated"
      ? "Currently Deployed"
      : isCrossAsset
      ? "Loan Borrowed"
      : "Total Borrow"
  const supplyLabel = isCrossAsset ? "Collateral Supplied" : "Total Supply"
  const thirdLabel = isCrossAsset ? "Net Collateral" : "Available Liquidity"
  const thirdValueUsd = isCrossAsset
    ? Math.max(0, totalSupplyUsd - totalBorrowUsd)
    : availableLiquidityUsd
  // Token amount for borrow side: use loan symbol on cross-asset vaults.
  const borrowSymbol = isCrossAsset && loanSymbol ? loanSymbol : asset

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      {/* Identity strip */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap border-b border-card-border"
        style={{ padding: "16px 20px" }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {isCrossAsset ? `${asset} / ${loanSymbol}` : asset}
          </span>
          {vaultId != null && (
            <span
              className="text-[11px] tabular-nums"
              style={{ color: "var(--text-muted)" }}
              title={`Fluid vault id ${vaultId}`}
            >
              #{vaultId}
            </span>
          )}
          {subLabel && !isCrossAsset && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {subLabel}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              background: `${protocolColor}22`,
              color: protocolColor,
              border: `1px solid ${protocolColor}44`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: protocolColor }} />
            {protocolName}
          </span>
          <span
            className="inline-flex items-center text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{
              background: `${typeColor}22`,
              color: typeColor,
              border: `1px solid ${typeColor}44`,
            }}
          >
            {typeLabel}
          </span>
          <span
            className="inline-flex items-center text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded"
            style={{ color: "var(--text-muted)", border: "1px solid var(--card-border)" }}
          >
            {protocolArchitecture}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
            {chain}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
            {/* On cross-asset vaults show both prices (collateral / loan)
                so a reader can see the per-side oracle price. */}
            {isCrossAsset && loanPriceUsd != null
              ? `${formatPrice(underlyingPriceUsd)} / ${formatPrice(loanPriceUsd)}`
              : formatPrice(underlyingPriceUsd)}
          </span>
        </div>
      </div>

      {/* 4 stat cells */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5"
        style={{ padding: "20px" }}
      >
        <Stat
          label={supplyLabel}
          usd={totalSupplyUsd}
          tokenAmount={formatTokenAmount(totalSupplyToken, asset)}
        />
        <Stat
          label={borrowLabel}
          usd={totalBorrowUsd}
          tokenAmount={formatTokenAmount(totalBorrowToken, borrowSymbol)}
        />
        <Stat
          label={thirdLabel}
          usd={thirdValueUsd}
          tokenAmount={
            isCrossAsset
              ? null
              : formatTokenAmount(availableLiquidityToken, asset)
          }
          context={
            isCrossAsset
              ? "Supplied USD − Borrowed USD. Available borrow capacity is rate-limit gated by the Liquidity Layer; see Vault Info."
              : undefined
          }
        />
        <Stat
          label="Reserves"
          usd={reservesUsd}
          tokenAmount={formatTokenAmount(reservesToken, asset)}
          emptyHint="Requires on-chain SDK"
          context={reservesContext(reserveFactor)}
        />
      </div>
    </div>
  )
}
