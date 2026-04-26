import Link from "next/link"
import { notFound } from "next/navigation"
import { loadMarketDetail, type MarketDetail } from "@/lib/market-detail"
import { MarketHeroStats } from "@/components/market-detail/market-hero-stats"
import { MarketKpiCards } from "@/components/market-detail/market-kpi-cards"
import { MarketMultiLineChart } from "@/components/market-detail/market-multi-line-chart"
import { MarketVaultAllocation } from "@/components/market-detail/market-vault-allocation"
import { MarketCrossProtocolTable } from "@/components/market-detail/market-cross-protocol-table"
import { MarketParametersCard } from "@/components/market-detail/market-parameters-card"
import { MarketDataSourceFooter } from "@/components/market-detail/market-data-source-footer"
import { MarketIrmCurve } from "@/components/market-detail/market-irm-curve"
import { VaultHeroCards } from "@/components/market-detail/vault-hero-cards"
import { VaultMarketAllocationTable } from "@/components/market-detail/vault-market-allocation-table"
import { VaultDetailsPanel } from "@/components/market-detail/vault-details-panel"
import { VaultActivityTable } from "@/components/market-detail/vault-activity-table"
import { VaultLiquidationEventsTable } from "@/components/market-detail/vault-liquidation-events-table"
import { VaultTopDepositorsList } from "@/components/market-detail/vault-top-depositors-list"
import { FluidVaultInfoCard } from "@/components/market-detail/fluid-vault-info-card"

export const dynamic = "force-dynamic"
// First-render cold load can hit 15-20s (DefiLlama Yields full pool list +
// `/protocol/<slug>` history + on-chain `getReservesData` + per-vault Morpho
// queries). Vercel Hobby's default function timeout is 10s; bump to 60s.
export const maxDuration = 60

interface PageProps {
  params: { poolId: string }
}

export default async function MarketDetailPage({ params }: PageProps) {
  const detail = await loadMarketDetail(params.poolId)
  if (!detail) {
    notFound()
  }

  // Per-protocol layout dispatch:
  //  - Morpho vaults  → VaultLayout (Moonwell-vault-style: activity, depositors, allocation)
  //  - Fluid vaults   → FluidLayout (collateral→loan pair model, no cap-util, no IRM curve)
  //  - Aave V3 / Spark → MarketLayout (single-reserve pool model with cap-util + IRM)
  const isMorphoVault = detail.dataSources.composition === "morpho-vault"
  const isFluidVault = detail.dataSources.state === "fluid"

  return (
    <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 space-y-5">
      <Breadcrumb detail={detail} isVault={isMorphoVault || isFluidVault} />
      {isMorphoVault ? (
        <VaultLayout detail={detail} />
      ) : isFluidVault ? (
        <FluidLayout detail={detail} />
      ) : (
        <MarketLayout detail={detail} />
      )}
      <MarketDataSourceFooter poolId={detail.poolId} sources={detail.dataSources} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Breadcrumb (shared)
// ─────────────────────────────────────────────────────────────────────────

function Breadcrumb({ detail, isVault }: { detail: MarketDetail; isVault: boolean }) {
  const rootLabel = isVault ? "Vaults" : "Protocols"
  return (
    <nav className="flex items-center gap-2 text-[11px] flex-wrap">
      <Link
        href={`/protocols?p=${detail.protocolSlug}`}
        className="text-text-muted hover:text-accent transition-colors"
      >
        {rootLabel}
      </Link>
      <span style={{ color: "var(--card-border)" }}>/</span>
      <Link
        href={`/protocols?p=${detail.protocolSlug}`}
        className="text-text-muted hover:text-accent transition-colors uppercase tracking-[0.1em]"
      >
        {detail.protocolName}
      </Link>
      <span style={{ color: "var(--card-border)" }}>/</span>
      <span
        style={{ color: "var(--text-primary)", fontWeight: 600 }}
        className="uppercase tracking-[0.1em]"
      >
        {detail.asset}
      </span>
      {detail.subLabel && (
        <span style={{ color: "var(--text-muted)" }}>— {detail.subLabel}</span>
      )}
      {isVault && detail.vaultMeta && (
        <span
          className="ml-auto text-[10px] tabular-nums"
          style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}
        >
          {shortAddr(detail.vaultMeta.vaultAddress)}
        </span>
      )}
    </nav>
  )
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ─────────────────────────────────────────────────────────────────────────
// Vault layout (Morpho — Moonwell-vault-inspired)
// ─────────────────────────────────────────────────────────────────────────

function VaultLayout({ detail }: { detail: MarketDetail }) {
  // Build a lookup of collateral logo URIs from the allocation rows so the
  // hero "Exposure" pills can render the real token icons.
  const exposureLogoMap: Record<string, string | null> = {}
  for (const a of detail.vaultAllocation ?? []) {
    if (a.collateralSymbol) exposureLogoMap[a.collateralSymbol] = a.collateralLogoURI
  }
  const exposureSymbols = detail.exposureSymbols ?? []

  return (
    <>
      {/* Hero — 4 cards: Total Deposits / Total Liquidity / Exposure / Net APY */}
      <VaultHeroCards
        totalDepositsUsd={detail.totalSupplyUsd}
        totalDeposits24hChangeUsd={detail.totalSupply24hChangeUsd}
        liquidityUsd={detail.availableLiquidityUsd}
        exposureSymbols={exposureSymbols}
        exposureLogoMap={exposureLogoMap}
        netApy={detail.netSupplyApy}
      />

      {/* Charts row 1 — Supply History + Net APY history (Moonwell shows
          Supply / Liquidity, but our liquidity history requires extra
          plumbing; pair Supply with Net APY instead — both rich Morpho data). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarketMultiLineChart
          title="Supply History"
          format="usd"
          bucketMode="last"
          series={[
            {
              key: "supply",
              label: "Total Deposits",
              color: "#5B7FFF",
              data: detail.supplyUsdHistory,
            },
          ]}
          emptyMessage="Vault history is being indexed by Morpho."
        />
        <MarketMultiLineChart
          title="Net APY"
          format="percent"
          bucketMode="avg"
          decimals={2}
          series={[
            {
              key: "apy",
              label: "Net APY",
              color: "#EC4899",
              data: detail.supplyApyHistory,
            },
          ]}
          emptyMessage="APY history is being indexed by Morpho."
        />
      </div>

      {/* Allocation donut + breakdown table */}
      {detail.vaultAllocation && detail.vaultAllocation.length > 0 && (
        <MarketVaultAllocation
          allocation={detail.vaultAllocation}
          asset={detail.asset}
        />
      )}

      {/* Full per-market breakdown — wider table with all market state */}
      {detail.vaultAllocation && (
        <VaultMarketAllocationTable allocation={detail.vaultAllocation} />
      )}

      {/* Vault Activity — most-recent deposits + withdrawals */}
      {detail.vaultActivity && (
        <VaultActivityTable
          activity={detail.vaultActivity}
          assetSymbol={detail.underlyingAssetSymbol}
        />
      )}

      {/* Liquidation Events on this vault's allocated markets */}
      {detail.vaultLiquidations && (
        <VaultLiquidationEventsTable liquidations={detail.vaultLiquidations} />
      )}

      {/* Top Depositors + Vault Details panel side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {detail.vaultTopDepositors && (
          <VaultTopDepositorsList depositors={detail.vaultTopDepositors} />
        )}
        {detail.vaultMeta && <VaultDetailsPanel meta={detail.vaultMeta} />}
      </div>

      {/* Cross-Protocol comparison — same underlying asset on other protocols */}
      <MarketCrossProtocolTable
        asset={detail.siblings[0]?.asset ?? detail.asset}
        current={{
          poolId: detail.poolId,
          protocolName: detail.protocolName,
          protocolColor: detail.protocolColor,
          subLabel: detail.subLabel,
          totalSupplyUsd: detail.totalSupplyUsd,
          totalBorrowUsd: detail.totalBorrowUsd,
          utilizationPct: detail.utilizationPct,
          supplyApy: detail.supplyApy,
          borrowApy: detail.borrowApy,
        }}
        siblings={detail.siblings}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Market layout (Aave V3 / Spark / Fluid — DefiLlama-fed)
// ─────────────────────────────────────────────────────────────────────────

function MarketLayout({ detail }: { detail: MarketDetail }) {
  const borrowEmpty =
    detail.borrowApy == null && detail.totalBorrowUsd === 0
      ? "This market has no borrow side — supply only."
      : "Borrow APY and utilization history accumulates daily for the 10 major " +
        "assets (USDC/USDT/DAI/USDS/GHO/WETH/WSTETH/WEETH/WBTC/CBBTC). Coverage " +
        "for this pool will appear here as it builds up."

  return (
    <>
      <MarketHeroStats
        asset={detail.asset}
        subLabel={detail.subLabel}
        assetType={detail.assetType}
        protocolName={detail.protocolName}
        protocolColor={detail.protocolColor}
        protocolArchitecture={detail.protocolArchitecture}
        chain={detail.chain}
        underlyingPriceUsd={detail.underlyingPriceUsd}
        totalSupplyUsd={detail.totalSupplyUsd}
        totalSupplyToken={detail.totalSupplyToken}
        totalBorrowUsd={detail.totalBorrowUsd}
        totalBorrowToken={detail.totalBorrowToken}
        availableLiquidityUsd={detail.availableLiquidityUsd}
        availableLiquidityToken={detail.availableLiquidityToken}
        reservesUsd={detail.reservesUsd}
        reservesToken={detail.reservesToken}
      />

      <MarketKpiCards
        protocolColor={detail.protocolColor}
        protocolArchitecture={detail.protocolArchitecture}
        supplyApy={detail.supplyApy}
        supplyApyReward={detail.supplyApyReward}
        borrowApy={detail.borrowApy}
        borrowApyReward={detail.borrowApyReward}
        utilizationPct={detail.utilizationPct}
        collateralFactor={detail.ltv}
        fee={detail.fee}
        reserveFactor={detail.reserveFactor}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarketMultiLineChart
          title="Supply & Borrow Cap Utilization"
          format="percent"
          bucketMode="last"
          decimals={1}
          series={[
            {
              key: "supplyCap",
              label: "Supply Cap",
              color: "#10B981",
              data: detail.supplyCapUtilHistory,
            },
            {
              key: "borrowCap",
              label: "Borrow Cap",
              color: "#FF8A3D",
              data: detail.borrowCapUtilHistory,
            },
          ]}
          emptyMessage={
            "Cap utilization history requires both an on-chain cap and historical " +
            "supply/borrow USD. Available for Aave V3 + SparkLend reserves where caps " +
            "are configured; not yet wired for this pool."
          }
        />
        <MarketMultiLineChart
          title="Interest Rate History"
          format="percent"
          bucketMode="avg"
          decimals={2}
          series={[
            { key: "supply", label: "Supply APY", color: "#10B981", data: detail.supplyApyHistory },
            { key: "borrow", label: "Borrow APY", color: "#FF8A3D", data: detail.borrowApyHistory },
          ]}
          emptyMessage={borrowEmpty}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarketMultiLineChart
          title="Utilization History"
          format="percent"
          bucketMode="avg"
          decimals={1}
          series={[
            { key: "util", label: "Utilization", color: "#8B5CF6", data: detail.utilizationHistory },
          ]}
          emptyMessage={borrowEmpty}
        />
        {/* When the source supplies an IRM curve (Aave V3 right now), render
            it here. Otherwise fall back to the cross-protocol comparison so
            the row stays balanced. */}
        {detail.irmCurve && detail.irmCurve.length > 0 ? (
          <MarketIrmCurve
            curve={detail.irmCurve}
            currentUtilizationPct={detail.utilizationPct}
            kink={detail.irmKink ?? 0.9}
          />
        ) : (
          <MarketCrossProtocolTable
            asset={detail.siblings[0]?.asset ?? detail.asset}
            current={{
              poolId: detail.poolId,
              protocolName: detail.protocolName,
              protocolColor: detail.protocolColor,
              subLabel: detail.subLabel,
              totalSupplyUsd: detail.totalSupplyUsd,
              totalBorrowUsd: detail.totalBorrowUsd,
              utilizationPct: detail.utilizationPct,
              supplyApy: detail.supplyApy,
              borrowApy: detail.borrowApy,
            }}
            siblings={detail.siblings}
          />
        )}
      </div>

      {/* Cross-protocol comparison gets its own row when IRM curve took its
          slot above. Skip when it was already rendered. */}
      {detail.irmCurve && detail.irmCurve.length > 0 && (
        <MarketCrossProtocolTable
          asset={detail.siblings[0]?.asset ?? detail.asset}
          current={{
            poolId: detail.poolId,
            protocolName: detail.protocolName,
            protocolColor: detail.protocolColor,
            subLabel: detail.subLabel,
            totalSupplyUsd: detail.totalSupplyUsd,
            totalBorrowUsd: detail.totalBorrowUsd,
            utilizationPct: detail.utilizationPct,
            supplyApy: detail.supplyApy,
            borrowApy: detail.borrowApy,
          }}
          siblings={detail.siblings}
        />
      )}

      <MarketParametersCard
        protocolName={detail.protocolName}
        protocolArchitecture={detail.protocolArchitecture}
        protocolWebsite={detail.protocolWebsite}
        chain={detail.chain}
        asset={detail.asset}
        assetType={detail.assetType}
        poolId={detail.poolId}
        defillamaProject={detail.defillamaProject}
        subLabel={detail.subLabel}
        collateralFactor={detail.ltv}
        liquidationThreshold={detail.liquidationThreshold}
        reserveFactor={detail.reserveFactor}
        fee={detail.fee}
        apyMean30d={detail.apyMean30d}
        apyBaseInception={detail.apyBaseInception}
        supplyCapUsd={detail.supplyCapUsd}
        borrowCapUsd={detail.borrowCapUsd}
        underlyingPriceUsd={detail.underlyingPriceUsd}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Fluid layout (vault-based, collateral→loan pair model)
//
// Deliberately divergent from MarketLayout:
//  - No cap-utilization chart (Fluid's cap model is per-vault on the
//    Liquidity Layer, not per-asset reserve cap — different concept).
//  - No IRM curve (Fluid uses a different rate model than Aave's
//    piecewise-linear; sampling it would need separate research).
//  - No derived borrow-APY history chart (per-asset DefiLlama numbers
//    aggregate across vaults, so derivation is wrong for Fluid).
//  - Adds a Fluid-specific Vault Info card surfacing collateral/loan asset
//    pair, vault id/type, smart-vault flags, liquidation penalty.
//
// What stays the same as MarketLayout: the hero stats grid, KPI cards,
// supply APY history, cross-protocol comparison, market parameters card —
// these all degrade cleanly for Fluid's data shape.
// ─────────────────────────────────────────────────────────────────────────

function FluidLayout({ detail }: { detail: MarketDetail }) {
  return (
    <>
      <MarketHeroStats
        asset={detail.asset}
        subLabel={detail.subLabel}
        assetType={detail.assetType}
        protocolName={detail.protocolName}
        protocolColor={detail.protocolColor}
        protocolArchitecture={detail.protocolArchitecture}
        chain={detail.chain}
        underlyingPriceUsd={detail.underlyingPriceUsd}
        totalSupplyUsd={detail.totalSupplyUsd}
        totalSupplyToken={detail.totalSupplyToken}
        totalBorrowUsd={detail.totalBorrowUsd}
        totalBorrowToken={detail.totalBorrowToken}
        availableLiquidityUsd={detail.availableLiquidityUsd}
        availableLiquidityToken={detail.availableLiquidityToken}
        reservesUsd={detail.reservesUsd}
        reservesToken={detail.reservesToken}
      />

      <MarketKpiCards
        protocolColor={detail.protocolColor}
        protocolArchitecture={detail.protocolArchitecture}
        supplyApy={detail.supplyApy}
        supplyApyReward={detail.supplyApyReward}
        borrowApy={detail.borrowApy}
        borrowApyReward={detail.borrowApyReward}
        utilizationPct={detail.utilizationPct}
        collateralFactor={detail.ltv}
        fee={detail.fee}
        reserveFactor={detail.reserveFactor}
      />

      {/* Single chart row — supply APY history (DefiLlama, pool-specific).
          Borrow APY history isn't reliably derivable for Fluid because per-
          asset DefiLlama numbers aggregate across all vaults using that
          asset; the derived borrow APY comes out wildly off. */}
      <MarketMultiLineChart
        title="Supply APY History"
        format="percent"
        bucketMode="avg"
        decimals={2}
        series={[
          {
            key: "supplyApy",
            label: "Supply APY",
            color: "#10B981",
            data: detail.supplyApyHistory,
          },
        ]}
        emptyMessage="DefiLlama hasn't returned chart data for this Fluid vault yet."
      />

      {/* Fluid Vault Info + Cross-Protocol Comparison side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {detail.fluidVaultInfo && <FluidVaultInfoCard info={detail.fluidVaultInfo} />}
        <MarketCrossProtocolTable
          asset={detail.siblings[0]?.asset ?? detail.asset}
          current={{
            poolId: detail.poolId,
            protocolName: detail.protocolName,
            protocolColor: detail.protocolColor,
            subLabel: detail.subLabel,
            totalSupplyUsd: detail.totalSupplyUsd,
            totalBorrowUsd: detail.totalBorrowUsd,
            utilizationPct: detail.utilizationPct,
            supplyApy: detail.supplyApy,
            borrowApy: detail.borrowApy,
          }}
          siblings={detail.siblings}
        />
      </div>

      <MarketParametersCard
        protocolName={detail.protocolName}
        protocolArchitecture={detail.protocolArchitecture}
        protocolWebsite={detail.protocolWebsite}
        chain={detail.chain}
        asset={detail.asset}
        assetType={detail.assetType}
        poolId={detail.poolId}
        defillamaProject={detail.defillamaProject}
        subLabel={detail.subLabel}
        collateralFactor={detail.ltv}
        liquidationThreshold={detail.liquidationThreshold}
        reserveFactor={detail.reserveFactor}
        fee={detail.fee}
        apyMean30d={detail.apyMean30d}
        apyBaseInception={detail.apyBaseInception}
        supplyCapUsd={detail.supplyCapUsd}
        borrowCapUsd={detail.borrowCapUsd}
        underlyingPriceUsd={detail.underlyingPriceUsd}
      />
    </>
  )
}
