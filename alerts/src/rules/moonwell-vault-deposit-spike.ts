import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_VAULT_TX_SPIKE_USD,
} from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import { fmtUsdCompact, moonwellUrl, trimTweet } from "./moonwell-helpers";

/**
 * Vault deposit/withdrawal spike (proxy).
 *
 * Morpho's GraphQL surface doesn't expose per-tx vault events in a way
 * our existing client can read; rather than wire a second client just
 * for this, we treat a big swing in combined Moonwell-vault TVL between
 * two fast ticks (5 min apart) as a proxy. False positives possible
 * when prices move sharply, but the floor (default $1M) is set high
 * enough that random vol won't trip it.
 *
 * Per-vault attribution and direction (deposit vs withdraw) are inferred
 * from the sign of the delta — we report "inflow" or "outflow" rather
 * than naming individual depositors.
 */

const KV_KEY_PREV = "moonwell:vaultTvlLast";
const KV_KEY_PREV_AT = "moonwell:vaultTvlLastAt";
const MAX_TICK_GAP_MS = 30 * 60 * 1000; // Don't compare against a stale baseline.

export interface VaultDepositSpikeDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellVaultDepositSpikeRule(
  deps: VaultDepositSpikeDeps = {},
): AlertRule {
  return {
    id: "moonwell_vault_deposit_spike",
    name: "Moonwell vault deposit/withdraw spike",
    description: `Fires when combined Moonwell-vault TVL changes by ≥${fmtUsdCompact(
      MOONWELL_VAULT_TX_SPIKE_USD,
    )} between fast ticks (proxy for big single deposits/withdrawals).`,
    schedule: "fast",
    // Two-hour cooldown so a sustained flow doesn't pile up alerts.
    cooldownHours: 2,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MoonwellDefiLlamaClient();
      const current = await client.getVaultsTvlUsd();
      if (current == null) return [];
      const nowMs = ctx.now.getTime();

      const prevRaw = await ctx.env.ALERTS_KV.get(KV_KEY_PREV);
      const prevAtRaw = await ctx.env.ALERTS_KV.get(KV_KEY_PREV_AT);
      const prev = prevRaw == null ? null : Number(prevRaw);
      const prevAt = prevAtRaw == null ? null : Number(prevAtRaw);

      // Always persist the current reading.
      await ctx.env.ALERTS_KV.put(KV_KEY_PREV, String(current), {
        expirationTtl: 24 * 3600,
      });
      await ctx.env.ALERTS_KV.put(KV_KEY_PREV_AT, String(nowMs), {
        expirationTtl: 24 * 3600,
      });

      if (prev == null || prevAt == null) return []; // seeded
      if (nowMs - prevAt > MAX_TICK_GAP_MS) return []; // stale baseline
      const delta = current - prev;
      if (Math.abs(delta) < MOONWELL_VAULT_TX_SPIKE_USD) return [];

      const direction = delta >= 0 ? "inflow" : "outflow";
      const dashboardUrl = moonwellUrl(ctx.env, "/vaults");
      const headline = `${MOONWELL_DISPLAY_NAME} vaults ${direction}: ${fmtUsdCompact(Math.abs(delta))}`;
      const body = [
        `Prior: ${fmtUsdCompact(prev)}`,
        `Now:   ${fmtUsdCompact(current)}`,
        `Δ:     ${delta >= 0 ? "+" : "-"}${fmtUsdCompact(Math.abs(delta))}`,
      ].join("\n");
      const tweet = trimTweet([
        `${MOONWELL_DISPLAY_NAME} vaults: ${fmtUsdCompact(Math.abs(delta))} ${direction} in the last 5 minutes.`,
        ``,
        `Vault TVL: ${fmtUsdCompact(prev)} -> ${fmtUsdCompact(current)}.`,
        ``,
        dashboardUrl,
      ]);
      return [
        {
          ruleId: "moonwell_vault_deposit_spike",
          key: String(nowMs),
          severity: "NORMAL",
          headline,
          body,
          suggestedTweet: tweet,
          suggestedHandle: MOONWELL_HANDLE,
          dashboardUrl,
          data: { prev, current, delta, direction },
          firedAt: ctx.now,
        },
      ];
    },
  };
}
