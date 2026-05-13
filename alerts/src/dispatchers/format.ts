import type { Severity } from "../types";

export const SEVERITY_EMOJI: Record<Severity, string> = {
  INFO: "ℹ️",
  NORMAL: "📊",
  WARNING: "⚠️",
  CRITICAL: "🚨",
};

/**
 * Compact USD formatter: $1.23B / $456.7M / $12.3K.
 * Used both in headlines and in suggested-tweet bodies, so it must stay
 * under the 280-char tweet ceiling.
 */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatUsdShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(0)}M`;
  return formatUsd(value);
}

/**
 * Telegram Markdown V2 escape. Telegram's Markdown V2 reserves a long list
 * of characters; escape them before they reach the API or messages with
 * dollar signs and parentheses get rejected.
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}
