import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_VAULT_TVL_THRESHOLDS_USD,
} from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import {
  detectCrossings,
  fmtUsdCompact,
  moonwellUrl,
  trimTweet,
} from "./moonwell-helpers";

export interface VaultTvlDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellVaultTvlThresholdRule(deps: VaultTvlDeps = {}): AlertRule {
  return {
    id: "moonwell_vault_tvl_threshold",
    name: "Moonwell vault TVL threshold",
    description:
      "Fires when combined Moonwell Morpho-vault TVL crosses one of the configured USD thresholds. Mirrors OKR KR4.3.",
    schedule: "hourly",
    cooldownHours: 168,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MoonwellDefiLlamaClient();
      const current = await client.getVaultsTvlUsd();
      if (current == null) return [];

      const { crossed, previous } = await detectCrossings(
        ctx.env,
        "vault_tvl_total",
        MOONWELL_VAULT_TVL_THRESHOLDS_USD,
        current,
      );
      if (crossed.length === 0) return [];

      const dashboardUrl = moonwellUrl(ctx.env, "/vaults");
      const events: AlertEvent[] = [];
      for (const threshold of crossed) {
        const priorTxt = previous == null ? "n/a" : fmtUsdCompact(previous);
        const headline = `${MOONWELL_DISPLAY_NAME} vault TVL crossed ${fmtUsdCompact(threshold)}`;
        const body = [
          `Prior: ${priorTxt}`,
          `Now:   ${fmtUsdCompact(current)}`,
          `Threshold: ${fmtUsdCompact(threshold)}`,
        ].join("\n");
        const tweet = trimTweet([
          `${MOONWELL_DISPLAY_NAME} vaults just crossed ${fmtUsdCompact(threshold)} in combined TVL.`,
          ``,
          `Prior: ${priorTxt}`,
          `Now:   ${fmtUsdCompact(current)}`,
          ``,
          dashboardUrl,
        ]);
        events.push({
          ruleId: "moonwell_vault_tvl_threshold",
          key: String(threshold),
          severity: "NORMAL",
          headline,
          body,
          suggestedTweet: tweet,
          suggestedHandle: MOONWELL_HANDLE,
          dashboardUrl,
          data: { threshold, previous, current },
          firedAt: ctx.now,
        });
      }
      return events;
    },
  };
}
