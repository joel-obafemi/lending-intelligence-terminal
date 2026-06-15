import type { AlertContext, AlertEvent, AlertRule } from "../types";
import { MOONWELL_DISPLAY_NAME, MOONWELL_HANDLE } from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import { getRevenueAth, setRevenueAth } from "../state/moonwell-d1";
import { fmtUsdCompact, moonwellUrl, trimTweet } from "./moonwell-helpers";

const METRIC_KEY = "daily_protocol_revenue_usd";

/** Don't fire ATH alerts unless the new peak is at least this much higher than the prior peak. */
const MIN_DELTA_USD = 100;

export interface RevenueAthDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellRevenueDailyAthRule(deps: RevenueAthDeps = {}): AlertRule {
  return {
    id: "moonwell_revenue_daily_ath",
    name: "Moonwell daily revenue ATH",
    description: "Fires when Moonwell's daily protocol revenue hits a new all-time high.",
    schedule: "daily",
    cooldownHours: 24,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MoonwellDefiLlamaClient();
      const latest = await client.getLatestDailyRevenueUsd();
      if (!latest) return [];

      const prior = await getRevenueAth(ctx.env, METRIC_KEY);
      const events: AlertEvent[] = [];

      if (!prior) {
        // Seed silently. The first reading isn't a tweet-worthy "new ATH".
        await setRevenueAth(ctx.env, {
          metric_key: METRIC_KEY,
          peak_value: latest.usd,
          peak_date: latest.date,
          updated_at: ctx.now.getTime(),
        });
        return [];
      }

      // Don't re-fire on the same calendar day; the dailyChart values for
      // the current day can drift slightly across runs as DefiLlama
      // refreshes its 24h window.
      if (latest.date === prior.peak_date) return [];

      if (latest.usd <= prior.peak_value + MIN_DELTA_USD) {
        // Not a new peak; just update peak_date timestamp metadata.
        await setRevenueAth(ctx.env, {
          ...prior,
          updated_at: ctx.now.getTime(),
        });
        return [];
      }

      const dashboardUrl = moonwellUrl(ctx.env, "/financials");
      const headline = `${MOONWELL_DISPLAY_NAME} daily revenue ATH: ${fmtUsdCompact(latest.usd)}`;
      const body = [
        `Date:        ${latest.date}`,
        `New ATH:     ${fmtUsdCompact(latest.usd)}`,
        `Prior peak:  ${fmtUsdCompact(prior.peak_value)} on ${prior.peak_date}`,
      ].join("\n");

      const tweet = trimTweet([
        `${MOONWELL_DISPLAY_NAME} hit a new daily protocol-revenue high: ${fmtUsdCompact(latest.usd)}.`,
        ``,
        `Prior peak: ${fmtUsdCompact(prior.peak_value)} on ${prior.peak_date}.`,
        ``,
        dashboardUrl,
      ]);

      events.push({
        ruleId: "moonwell_revenue_daily_ath",
        key: latest.date,
        severity: "NORMAL",
        headline,
        body,
        suggestedTweet: tweet,
        suggestedHandle: MOONWELL_HANDLE,
        dashboardUrl,
        data: {
          date: latest.date,
          newAth: latest.usd,
          priorAth: prior.peak_value,
          priorDate: prior.peak_date,
        },
        firedAt: ctx.now,
      });

      await setRevenueAth(ctx.env, {
        metric_key: METRIC_KEY,
        peak_value: latest.usd,
        peak_date: latest.date,
        updated_at: ctx.now.getTime(),
      });

      return events;
    },
  };
}
