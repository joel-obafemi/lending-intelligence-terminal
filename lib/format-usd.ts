/**
 * Shared numeric formatters for report chart tooltips.
 *
 * Convention: the data key names carry no unit suffix ("Net flow", not
 * "Net flow ($M)"); the formatter renders the unit. Negative values use
 * U+2212 MINUS SIGN to match the report body's typography.
 */

const MINUS = "−"

export type ChartUnit = "usdm" | "percent" | "bps"

/** "$43M" / "−$162M" / "$1.33B" / "$0". Values are USD millions. */
export function formatUsdMillions(value: number): string {
  if (value === 0) return "$0"
  const sign = value < 0 ? MINUS : ""
  const abs = Math.abs(value)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}B`
  // Sub-$10M readings (e.g. quiet liquidation days) keep two decimals so
  // "$0.04M" doesn't collapse to a misleading "$0M".
  if (abs < 10) return `${sign}$${parseFloat(abs.toFixed(2))}M`
  return `${sign}$${Math.round(abs)}M`
}

/** "85%" / "31.23%" / "−1.6%" */
export function formatPercent(value: number): string {
  const sign = value < 0 ? MINUS : ""
  return `${sign}${parseFloat(Math.abs(value).toFixed(2))}%`
}

/** "+42 bps" style is left to prose; tooltips render "−37 bps" / "0 bps". */
export function formatBps(value: number): string {
  if (value === 0) return "0 bps"
  const sign = value < 0 ? MINUS : ""
  return `${sign}${parseFloat(Math.abs(value).toFixed(1))} bps`
}

export function formatChartValue(value: number, unit?: ChartUnit): string {
  switch (unit) {
    case "usdm":
      return formatUsdMillions(value)
    case "percent":
      return formatPercent(value)
    case "bps":
      return formatBps(value)
    default:
      return String(value)
  }
}

/** Fallback for legacy data keys that still carry a unit suffix. */
export function detectUnitFromKey(key: string): ChartUnit | undefined {
  if (/\(\$M\)\s*$/.test(key)) return "usdm"
  if (/\(bps\)\s*$/.test(key)) return "bps"
  if (/(\(%\)|%)\s*$/.test(key)) return "percent"
  return undefined
}

/** Strips a trailing unit suffix from a series name for display. */
export function cleanSeriesName(key: string): string {
  return key.replace(/\s*(\(\$M\)|\(bps\)|\(%\)|%)\s*$/, "")
}
