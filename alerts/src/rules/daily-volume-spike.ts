import type { AlertContext, AlertEvent, AlertRule, Protocol, Severity } from "../types";
import {
  LIQUIDATOR_DB_SLUG,
  PROTOCOL_DISPLAY_NAME,
  PROTOCOL_HANDLE,
} from "../config";
import { fetchVolumeVsBaseline, hasLiquidatorDb, type DailyVolumeRow } from "../sources/neon";
import { formatUsdShort } from "../dispatchers/format";

// Fire when 24h volume exceeds 2x the 30-day daily average.
// CRITICAL at 5x (extreme stress day).
const SPIKE_MULTIPLIER_WARNING = 2;
const SPIKE_MULTIPLIER_CRITICAL = 5;
// Absolute floor: ignore protocols with < $100K daily average (noise).
const MIN_BASELINE_USD = 100_000;

export interface DailyVolumeSpikeDeps {
  fetchBaseline?: typeof fetchVolumeVsBaseline;
}

export function createDailyVolumeSpikeRule(
  deps: DailyVolumeSpikeDeps = {},
): AlertRule {
  return {
    id: "daily_volume_spike",
    name: "Daily volume spike",
    description:
      "Fires when a protocol's 24h liquidation volume exceeds 2x its trailing 30-day daily average. CRITICAL at 5x.",
    schedule: "hourly",
    cooldownHours: 12,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasLiquidatorDb(ctx.env)) return [];

      const fetchBaseline = deps.fetchBaseline ?? fetchVolumeVsBaseline;
      const nowSec = Math.floor(ctx.now.getTime() / 1000);
      const rows = await fetchBaseline(ctx.env, nowSec);

      const dbSlugToProtocol = invertSlugMap();
      const events: AlertEvent[] = [];
      const dashboardUrl = "https://datumlab.xyz/liquidator-economy";

      for (const row of rows) {
        if (row.volume30dDaily < MIN_BASELINE_USD) continue;
        const multiplier = row.volume24h / row.volume30dDaily;
        if (multiplier < SPIKE_MULTIPLIER_WARNING) continue;

        const protocol = dbSlugToProtocol[row.protocol] as Protocol | undefined;
        const proto = protocol ? PROTOCOL_DISPLAY_NAME[protocol] : row.protocol;
        const handle = protocol ? PROTOCOL_HANDLE[protocol] : "";
        const severity: Severity = multiplier >= SPIKE_MULTIPLIER_CRITICAL ? "CRITICAL" : "WARNING";

        const vol24h = formatUsdShort(row.volume24h);
        const volAvg = formatUsdShort(row.volume30dDaily);
        const multStr = multiplier.toFixed(1);

        events.push({
          ruleId: "daily_volume_spike",
          key: row.protocol,
          severity,
          headline: `${proto} liquidation volume at ${multStr}x normal`,
          body: [
            `24h volume: ${vol24h} (${row.count24h} events)`,
            `30-day daily avg: ${volAvg}`,
            `Multiplier: ${multStr}x`,
          ].join("\n"),
          suggestedTweet: [
            severity === "CRITICAL"
              ? `🚨 ${proto} liquidation volume is ${multStr}x above normal.`
              : `⚠️ ${proto} 24h liquidations running at ${multStr}x baseline.`,
            "",
            `Volume: ${vol24h} across ${row.count24h} events.`,
            `30-day daily average: ${volAvg}.`,
            "",
            multiplier >= 5
              ? "This level of liquidation activity signals acute market stress."
              : "Elevated activity, worth watching for sustained pressure.",
            "",
            dashboardUrl,
          ].join("\n").slice(0, 280),
          suggestedHandle: handle || undefined,
          dashboardUrl,
          data: {
            protocol: row.protocol,
            volume24h: row.volume24h,
            count24h: row.count24h,
            volume30dDaily: row.volume30dDaily,
            multiplier,
          },
          firedAt: ctx.now,
        });
      }

      return events;
    },
  };
}

function invertSlugMap(): Record<string, Protocol> {
  const out: Record<string, Protocol> = {};
  for (const [internal, db] of Object.entries(LIQUIDATOR_DB_SLUG)) {
    out[db] = internal as Protocol;
  }
  return out;
}
