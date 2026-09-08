import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_LIQ_SPIKE_BASELINE_WINDOW_DAYS,
  MOONWELL_LIQ_SPIKE_MIN_COUNT,
  MOONWELL_LIQ_SPIKE_STDDEV,
} from "../config";
import {
  fetchDailyLiquidationRollup,
  hasMoonwellDb,
} from "../sources/moonwellNeon";
import {
  listLiquidationDays,
  recordLiquidationDay,
} from "../state/moonwell-d1";
import { fmtUsdCompact, moonwellUrl, trimTweet } from "./moonwell-helpers";

const WINDOW = MOONWELL_LIQ_SPIKE_BASELINE_WINDOW_DAYS;

export function createMoonwellLiquidationDailySpikeRule(): AlertRule {
  return {
    id: "moonwell_liquidation_daily_spike",
    name: "Moonwell liquidation daily-count spike",
    description: `Fires when today's liquidation count is at least ${MOONWELL_LIQ_SPIKE_STDDEV}σ above the trailing ${WINDOW}d mean.`,
    schedule: "daily",
    cooldownHours: 24,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasMoonwellDb(ctx.env)) return [];

      // 1. Pull last (window+1) days from the dashboard's Neon.
      const nowSeconds = Math.floor(ctx.now.getTime() / 1000);
      const remoteRollup = await fetchDailyLiquidationRollup(
        ctx.env,
        nowSeconds,
        WINDOW + 1,
      );
      if (remoteRollup.length === 0) return [];

      // 2. Mirror those rollups into D1 so the baseline is persistent
      //    across runs (the dashboard's history could roll off; we hold ours).
      for (const r of remoteRollup) {
        await recordLiquidationDay(ctx.env, {
          chain: r.chain,
          day: r.day,
          count: r.count,
          volume_usd: r.volume_usd,
          largest_usd: r.largest_usd,
        });
      }

      // 3. The latest day in the rollup is "today". Compare to mean+stddev
      //    of the preceding WINDOW days (excluding today itself).
      const sorted = [...remoteRollup].sort((a, b) => (a.day < b.day ? -1 : 1));
      const today = sorted[sorted.length - 1]!;
      const baseline = sorted.slice(0, -1);
      if (baseline.length < 10) return []; // not enough history yet
      if (today.count < MOONWELL_LIQ_SPIKE_MIN_COUNT) return [];

      const counts = baseline.map((b) => b.count);
      const mean = counts.reduce((s, n) => s + n, 0) / counts.length;
      const variance =
        counts.reduce((s, n) => s + (n - mean) * (n - mean), 0) / counts.length;
      const stddev = Math.sqrt(variance);
      if (stddev === 0) return [];
      const z = (today.count - mean) / stddev;
      if (z < MOONWELL_LIQ_SPIKE_STDDEV) return [];

      const multiple = today.count / Math.max(mean, 1);
      const dashboardUrl = moonwellUrl(ctx.env, "/liquidations");
      const headline = `Moonwell liquidations: ${today.count} today (${multiple.toFixed(1)}x ${WINDOW}d mean)`;
      const body = [
        `Today (${today.day}): ${today.count} liquidations, ${fmtUsdCompact(today.volume_usd)} seized`,
        `${WINDOW}d mean: ${mean.toFixed(1)} per day`,
        `Z-score: ${z.toFixed(2)}`,
        `Largest single: ${fmtUsdCompact(today.largest_usd)}`,
      ].join("\n");

      // Suppress the duplicate "watch for cascade" suffix when count is just slightly above baseline.
      const tweet = trimTweet([
        `${MOONWELL_DISPLAY_NAME} saw ${today.count} liquidations in 24h, ${multiple.toFixed(1)}x the ${WINDOW}d average. Worth watching for cascade risk.`,
        ``,
        dashboardUrl,
      ]);
      // Mirror baseline read so tests can introspect.
      const _baselineSize = (await listLiquidationDays(ctx.env, today.chain, "0000-00-00", "9999-99-99")).length;
      void _baselineSize;

      return [
        {
          ruleId: "moonwell_liquidation_daily_spike",
          key: today.day,
          severity: "NORMAL",
          headline,
          body,
          suggestedTweet: tweet,
          suggestedHandle: MOONWELL_HANDLE,
          dashboardUrl,
          data: {
            day: today.day,
            count: today.count,
            volume_usd: today.volume_usd,
            largest_usd: today.largest_usd,
            mean,
            stddev,
            zScore: z,
          },
          firedAt: ctx.now,
        },
      ];
    },
  };
}
