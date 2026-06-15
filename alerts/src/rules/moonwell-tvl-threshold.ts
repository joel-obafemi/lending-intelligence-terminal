import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_TVL_THRESHOLDS_USD,
} from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import {
  detectCrossings,
  fmtUsdCompact,
  moonwellUrl,
  trimTweet,
} from "./moonwell-helpers";

export interface TvlThresholdDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellTvlThresholdRule(deps: TvlThresholdDeps = {}): AlertRule {
  return {
    id: "moonwell_tvl_threshold",
    name: "Moonwell TVL threshold",
    description: `Fires when ${MOONWELL_DISPLAY_NAME}'s combined TVL (lending + vaults) crosses one of the configured USD thresholds upward.`,
    schedule: "hourly",
    // Per-threshold one-shot — cooldown only matters as a backstop. 168h
    // prevents a flapping value from re-firing at the same threshold.
    cooldownHours: 168,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MoonwellDefiLlamaClient();
      const current = await client.getTotalTvlUsd();
      if (current == null) {
        console.log("moonwell_tvl_threshold: no TVL from DefiLlama");
        return [];
      }

      const { crossed, previous } = await detectCrossings(
        ctx.env,
        "tvl_total",
        MOONWELL_TVL_THRESHOLDS_USD,
        current,
      );
      if (crossed.length === 0) return [];

      // Multiple thresholds can be crossed in a single tick (e.g. an
      // overnight $70M → $82M jump). Fire one event per threshold so the
      // cooldown handles them independently.
      const dashboardUrl = moonwellUrl(ctx.env);
      const events: AlertEvent[] = [];
      for (const threshold of crossed) {
        const headline = `${MOONWELL_DISPLAY_NAME} TVL crossed ${fmtUsdCompact(threshold)}`;
        const priorTxt = previous == null ? "n/a" : fmtUsdCompact(previous);
        const body = [
          `Prior: ${priorTxt}`,
          `Now:   ${fmtUsdCompact(current)}`,
          `Crossing threshold: ${fmtUsdCompact(threshold)}`,
        ].join("\n");
        const tweet = trimTweet([
          `${MOONWELL_DISPLAY_NAME} just crossed ${fmtUsdCompact(threshold)} in TVL.`,
          ``,
          `Prior: ${priorTxt}`,
          `Now:   ${fmtUsdCompact(current)}`,
          ``,
          dashboardUrl,
        ]);
        events.push({
          ruleId: "moonwell_tvl_threshold",
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
