/**
 * Shared helpers for Moonwell rules. The threshold-crossing logic in
 * particular is reused by TVL, OEV revenue, monthly revenue, and vault
 * TVL rules — keeping it here avoids drift between rule files.
 */

import type { Env } from "../types";

/**
 * Return thresholds the value has crossed since the last evaluation.
 *
 *   - Uses KV to remember the last-seen value per metricKey, so we fire
 *     ONLY on the upward crossing, not every time `value >= threshold`.
 *   - First evaluation seeds the last-seen value (so we don't tweet a
 *     fake "just crossed" the moment the worker turns on).
 *   - `direction = "up"` (default): fires when prev < t <= current.
 *     `direction = "down"`: fires when prev > t >= current.
 */
export async function detectCrossings(
  env: Env,
  metricKey: string,
  thresholds: number[],
  current: number,
  direction: "up" | "down" = "up",
): Promise<{ crossed: number[]; previous: number | null }> {
  const kvKey = `moonwell:lastvalue:${metricKey}`;
  const prevRaw = await env.ALERTS_KV.get(kvKey);
  const previous = prevRaw === null ? null : Number(prevRaw);

  // Persist current value regardless — even when no crossing fires, the
  // next run still needs an updated baseline.
  await env.ALERTS_KV.put(kvKey, String(current), {
    // Keep this around for a year; rule-defined cooldowns prevent re-fires
    // even if KV evicts and we accidentally re-seed against a stale baseline.
    expirationTtl: 365 * 24 * 3600,
  });

  if (previous === null || !Number.isFinite(previous)) {
    return { crossed: [], previous: null };
  }

  const crossed: number[] = [];
  for (const t of thresholds) {
    if (direction === "up" && previous < t && current >= t) crossed.push(t);
    if (direction === "down" && previous > t && current <= t) crossed.push(t);
  }
  return { crossed, previous };
}

/**
 * Compose the dashboard base URL with a path. Defaults to the prod
 * domain when MOONWELL_DASHBOARD_BASE_URL is unset in dev.
 */
export function moonwellUrl(env: Env, path = ""): string {
  const base = env.MOONWELL_DASHBOARD_BASE_URL ?? "https://joelobafemi.xyz/moonwell";
  if (!path) return base;
  const trimmedBase = base.replace(/\/$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

/** Compact USD: $1.23B / $456.7M / $12.3K. Mirrors dispatchers/format.ts. */
export function fmtUsdCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Compact token amounts: 18.40M / 23.72K. */
export function fmtTokenCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

/** Percent change between two numbers, sign-aware. Returns null if prev is 0. */
export function pctChange(prev: number, current: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

/** "+29%" / "-5%". */
export function fmtPct(value: number, digits = 0): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Trim a tweet to ≤280 chars by dropping trailing lines first, then truncating. */
export function trimTweet(lines: string[]): string {
  let text = lines.join("\n");
  while (text.length > 280 && lines.length > 1) {
    lines.pop();
    text = lines.join("\n");
  }
  if (text.length > 280) text = text.slice(0, 277) + "...";
  return text;
}
