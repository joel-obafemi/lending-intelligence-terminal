import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_MONTHLY_REVENUE_THRESHOLDS_USD,
} from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import {
  detectCrossings,
  fmtUsdCompact,
  moonwellUrl,
  trimTweet,
} from "./moonwell-helpers";

export interface MonthlyRevenueDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellMonthlyRevenueThresholdRule(
  deps: MonthlyRevenueDeps = {},
): AlertRule {
  return {
    id: "moonwell_monthly_revenue_threshold",
    name: "Moonwell monthly revenue threshold",
    description:
      "Fires when Moonwell's trailing-30d protocol revenue crosses one of the configured USD thresholds. Mirrors OKR KR2.1.",
    schedule: "daily",
    cooldownHours: 168,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MoonwellDefiLlamaClient();
      const current = await client.getTrailing30dRevenueUsd();
      if (current == null) return [];

      const { crossed, previous } = await detectCrossings(
        ctx.env,
        "revenue_30d",
        MOONWELL_MONTHLY_REVENUE_THRESHOLDS_USD,
        current,
      );
      if (crossed.length === 0) return [];

      const dashboardUrl = moonwellUrl(ctx.env, "/financials");
      const events: AlertEvent[] = [];
      for (const threshold of crossed) {
        const priorTxt = previous == null ? "n/a" : fmtUsdCompact(previous);
        const headline = `${MOONWELL_DISPLAY_NAME} 30d revenue crossed ${fmtUsdCompact(threshold)}`;
        const body = [
          `Prior: ${priorTxt}`,
          `Now:   ${fmtUsdCompact(current)}`,
          `Threshold: ${fmtUsdCompact(threshold)}`,
        ].join("\n");
        const tweet = trimTweet([
          `${MOONWELL_DISPLAY_NAME} just crossed ${fmtUsdCompact(threshold)} in trailing-30d protocol revenue.`,
          ``,
          `30d ago: ${priorTxt}`,
          `Now:     ${fmtUsdCompact(current)}`,
          ``,
          dashboardUrl,
        ]);
        events.push({
          ruleId: "moonwell_monthly_revenue_threshold",
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
