import type { AlertContext, AlertEvent, AlertRule, Severity } from "../types";
import {
  fetchBlockBursts,
  fetchHourlyEventCount,
  hasLiquidatorDb,
} from "../sources/neon";
import { formatUsdShort } from "../dispatchers/format";

const BLOCK_BURST_THRESHOLD = 10; // events in a single block
const HOURLY_BURST_THRESHOLD = 50; // events in a 1-hour window

export interface CascadeBurstDeps {
  fetchBlocks?: typeof fetchBlockBursts;
  fetchHourly?: typeof fetchHourlyEventCount;
}

export function createCascadeBurstRule(
  deps: CascadeBurstDeps = {},
): AlertRule {
  return {
    id: "cascade_burst",
    name: "Cascade burst",
    description:
      "Fires when >=10 liquidation events land in a single block, or >=50 events in a 1-hour window.",
    schedule: "fast",
    cooldownHours: 2,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasLiquidatorDb(ctx.env)) return [];

      const nowSec = Math.floor(ctx.now.getTime() / 1000);
      const lookback = nowSec - 600; // 10 min
      const events: AlertEvent[] = [];
      const dashboardUrl = "https://datumlab.xyz/liquidator-economy";

      // Check for single-block bursts
      const fetchBlocks = deps.fetchBlocks ?? fetchBlockBursts;
      const bursts = await fetchBlocks(ctx.env, lookback, BLOCK_BURST_THRESHOLD);

      for (const burst of bursts) {
        const severity: Severity = burst.event_count >= 20 ? "CRITICAL" : "WARNING";
        const volStr = formatUsdShort(burst.total_collateral_usd);
        const protocols = burst.protocols.split(",").join(", ");

        events.push({
          ruleId: "cascade_burst",
          key: `block:${burst.block_number}`,
          severity,
          headline: `${burst.event_count} liquidations in block ${burst.block_number}`,
          body: [
            `Events: ${burst.event_count}`,
            `Collateral seized: ${volStr}`,
            `Protocols: ${protocols}`,
          ].join("\n"),
          suggestedTweet: [
            severity === "CRITICAL"
              ? `🚨 ${burst.event_count} liquidations fired in a single Ethereum block.`
              : `⚠️ ${burst.event_count} liquidations in one block.`,
            "",
            `${volStr} collateral seized across ${protocols}.`,
            "",
            "When this many positions unwind simultaneously, second-order cascades are likely.",
            "",
            dashboardUrl,
          ].join("\n").slice(0, 280),
          dashboardUrl,
          data: {
            block_number: burst.block_number,
            event_count: burst.event_count,
            total_collateral_usd: burst.total_collateral_usd,
            protocols: burst.protocols,
          },
          firedAt: ctx.now,
        });
      }

      // Check for hourly burst
      const fetchHourly = deps.fetchHourly ?? fetchHourlyEventCount;
      const hourly = await fetchHourly(ctx.env, nowSec);

      if (hourly.count >= HOURLY_BURST_THRESHOLD) {
        const severity: Severity = hourly.count >= 100 ? "CRITICAL" : "WARNING";
        const volStr = formatUsdShort(hourly.volumeUsd);

        events.push({
          ruleId: "cascade_burst",
          key: `hourly:${Math.floor(nowSec / 3600)}`,
          severity,
          headline: `${hourly.count} liquidations in the last hour`,
          body: [
            `Events: ${hourly.count}`,
            `Volume: ${volStr}`,
          ].join("\n"),
          suggestedTweet: [
            severity === "CRITICAL"
              ? `🚨 ${hourly.count} liquidations in the last 60 minutes.`
              : `⚠️ ${hourly.count} liquidations in the past hour.`,
            "",
            `${volStr} in collateral seized. Market stress is elevated.`,
            "",
            dashboardUrl,
          ].join("\n").slice(0, 280),
          dashboardUrl,
          data: {
            hourly_count: hourly.count,
            hourly_volume_usd: hourly.volumeUsd,
          },
          firedAt: ctx.now,
        });
      }

      return events;
    },
  };
}
