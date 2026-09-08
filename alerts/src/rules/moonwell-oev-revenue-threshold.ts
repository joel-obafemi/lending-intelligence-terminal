import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_OEV_REVENUE_THRESHOLDS_USD,
} from "../config";
import { fetchOevCumulativeV2, hasMoonwellDb } from "../sources/moonwellNeon";
import {
  detectCrossings,
  fmtUsdCompact,
  moonwellUrl,
  trimTweet,
} from "./moonwell-helpers";

export function createMoonwellOevRevenueThresholdRule(): AlertRule {
  return {
    id: "moonwell_oev_revenue_threshold",
    name: "Moonwell OEV cumulative revenue threshold",
    description:
      "Fires when cumulative V2 OEV protocol revenue (post-MIP-X56) crosses one of the configured USD thresholds.",
    schedule: "hourly",
    cooldownHours: 168,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasMoonwellDb(ctx.env)) {
        console.log("moonwell_oev_revenue_threshold: MOONWELL_DATABASE_URL unset, skipping");
        return [];
      }
      const cumulative = await fetchOevCumulativeV2(ctx.env);
      const current = cumulative.protocolRevenueUsd;

      const { crossed, previous } = await detectCrossings(
        ctx.env,
        "oev_revenue_cumulative",
        MOONWELL_OEV_REVENUE_THRESHOLDS_USD,
        current,
      );
      if (crossed.length === 0) return [];

      const dashboardUrl = moonwellUrl(ctx.env, "/oev");
      const events: AlertEvent[] = [];
      for (const threshold of crossed) {
        const captureTxt =
          cumulative.captureRatePct == null
            ? "n/a"
            : `${cumulative.captureRatePct.toFixed(1)}%`;
        const headline = `Moonwell OEV cumulative revenue crossed ${fmtUsdCompact(threshold)}`;
        const body = [
          `Prior: ${previous == null ? "n/a" : fmtUsdCompact(previous)}`,
          `Now:   ${fmtUsdCompact(current)}`,
          `Liquidations: ${cumulative.liquidations}`,
          `Capture rate: ${captureTxt}`,
        ].join("\n");
        const tweet = trimTweet([
          `${MOONWELL_DISPLAY_NAME} OEV: cumulative V2 protocol revenue just crossed ${fmtUsdCompact(threshold)}.`,
          ``,
          `${cumulative.liquidations} liquidations, ${captureTxt} capture rate.`,
          ``,
          dashboardUrl,
        ]);
        events.push({
          ruleId: "moonwell_oev_revenue_threshold",
          key: String(threshold),
          severity: "NORMAL",
          headline,
          body,
          suggestedTweet: tweet,
          suggestedHandle: MOONWELL_HANDLE,
          dashboardUrl,
          data: {
            threshold,
            previous,
            current,
            captureRatePct: cumulative.captureRatePct,
            liquidations: cumulative.liquidations,
          },
          firedAt: ctx.now,
        });
      }
      return events;
    },
  };
}
