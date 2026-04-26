export function formatUSD(value: number): string {
  if (!Number.isFinite(value)) return "—"
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

export function formatUSDFull(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function formatDateFull(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatPercent(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return "—"
  return `${value.toFixed(decimals)}%`
}

/** Chart color palette — reused across protocol comparison charts */
const CHART_COLORS = [
  "#FF6B35",
  "#5B7FFF",
  "#10B981",
  "#B44AFF",
  "#F59E0B",
  "#00D4FF",
  "#EC4899",
  "#6366F1",
]

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

/** Aave V3 math: convert RAY (1e27) APR to percentage */
export function rayToPercent(ray: bigint): number {
  return Number(ray) / 1e25
}

/** Oracle price (8 decimals) → USD */
export function oraclePriceToUSD(price: bigint): number {
  return Number(price) / 1e8
}
