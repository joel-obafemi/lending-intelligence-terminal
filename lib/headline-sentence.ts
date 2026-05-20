/**
 * Auto-generated headline-sentence helpers for Verdict bands.
 *
 * Each page's Verdict strip ends with a one-line summary that reads naturally
 * out loud — see the Sector / Risk specs. The numbers come from the live
 * snapshot; the sentence templates live here so we have one place to tweak
 * voice/phrasing.
 *
 * Helpers are pure (no DOM / fetch) so they can run on the server during
 * SSR and produce identical output to the client.
 */

import { formatPercent, formatUSD } from "./utils"

// ─────────────────────────────────────────────────────────────────────────
// Number formatting helpers — small layer over `lib/utils` for the voice
// the Verdict bands want (e.g. "$32.8 billion" vs "$32.80B").
// ─────────────────────────────────────────────────────────────────────────

/** Compact USD with verbal scale: $32.8 billion / $586 million / $1.2 trillion. */
export function formatUsdProse(v: number, fractionDigits = 1): string {
  if (!Number.isFinite(v)) return "—"
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(fractionDigits)} trillion`
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(fractionDigits)} billion`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(fractionDigits)} million`
  return formatUSD(v)
}

/** Same as formatUsdProse but defaults to a reading-friendly precision. */
export function formatUsdShort(v: number): string {
  return formatUsdProse(v, v >= 1e9 ? 1 : 0)
}

/** Render a delta as a phrase like "up 4% vs last month" / "down 12% vs last month". */
export function formatDeltaPhrase(
  pctChange: number | null | undefined,
  windowLabel: string,
): string {
  if (pctChange == null || !Number.isFinite(pctChange)) return `relative to ${windowLabel} not available`
  if (Math.abs(pctChange) < 0.005) return `flat vs ${windowLabel}`
  const dir = pctChange > 0 ? "up" : "down"
  return `${dir} ${formatPercent(Math.abs(pctChange) * 100, pctChange < 0.05 ? 1 : 0)} vs ${windowLabel}`
}

/** Basis-points-over-X phrase: "+217 bps over T-bills" / "−42 bps under T-bills". */
export function formatSpreadBpsPhrase(spreadPct: number, vs: string): string {
  if (!Number.isFinite(spreadPct)) return `spread vs ${vs} not available`
  const bps = Math.round(spreadPct * 100)
  if (bps === 0) return `at par with ${vs}`
  const sign = bps > 0 ? "+" : "−"
  const dir = bps > 0 ? "over" : "under"
  return `${sign}${Math.abs(bps)} bps ${dir} ${vs}`
}
