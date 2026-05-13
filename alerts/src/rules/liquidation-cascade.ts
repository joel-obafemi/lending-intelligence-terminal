import type { AlertContext, AlertEvent, AlertRule, Protocol, Severity } from "../types";
import {
  LIQUIDATION_THRESHOLDS_USD,
  LIQUIDATOR_DB_SLUG,
  PROTOCOL_DISPLAY_NAME,
  PROTOCOL_HANDLE,
} from "../config";
import {
  fetch24hLargestPerProtocol,
  fetch24hLiquidationsByProtocol,
  hasLiquidatorDb,
} from "../sources/neon";
import { formatUsdShort } from "../dispatchers/format";

export interface LiquidationCascadeDeps {
  fetchVolumes?: (env: import("../types").Env, nowMs: number) => Promise<
    Array<{ protocol: string; count: number; volumeUsd: number }>
  >;
  fetchLargest?: (
    env: import("../types").Env,
    nowMs: number,
  ) => Promise<
    Map<string, { protocol: string; collateral_symbol: string | null; debt_amount_usd: number | null }>
  >;
}

export function createLiquidationCascadeRule(
  deps: LiquidationCascadeDeps = {},
): AlertRule {
  return {
    id: "liquidation_cascade",
    name: "Liquidation cascade",
    description:
      "Fires when 24h liquidation volume for a protocol exceeds its threshold. WARNING at threshold, CRITICAL at 2x.",
    schedule: "hourly",
    cooldownHours: 6,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasLiquidatorDb(ctx.env)) {
        console.log("liquidation_cascade: LIQUIDATOR_DATABASE_URL not configured, skipping");
        return [];
      }

      const fetchVolumes = deps.fetchVolumes ?? fetch24hLiquidationsByProtocol;
      const fetchLargest = deps.fetchLargest ?? fetch24hLargestPerProtocol;

      const [rows, largest] = await Promise.all([
        fetchVolumes(ctx.env, ctx.now.getTime()),
        fetchLargest(ctx.env, ctx.now.getTime()),
      ]);

      const internalSlugByDbSlug = invertSlugMap();
      const events: AlertEvent[] = [];

      for (const row of rows) {
        const protocol = internalSlugByDbSlug[row.protocol] as Protocol | undefined;
        if (!protocol) continue;
        const threshold = LIQUIDATION_THRESHOLDS_USD[protocol];
        if (row.volumeUsd < threshold) continue;
        const severity: Severity = row.volumeUsd >= threshold * 2 ? "CRITICAL" : "WARNING";

        const largestRow = largest.get(row.protocol) ?? null;
        events.push(
          buildEvent({
            ctx,
            protocol,
            volumeUsd: row.volumeUsd,
            count: row.count,
            severity,
            largestUsd: largestRow?.debt_amount_usd ?? null,
            largestAsset: largestRow?.collateral_symbol ?? null,
          }),
        );
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

interface BuildEventArgs {
  ctx: AlertContext;
  protocol: Protocol;
  volumeUsd: number;
  count: number;
  severity: Severity;
  largestUsd: number | null;
  largestAsset: string | null;
}

function buildEvent(args: BuildEventArgs): AlertEvent {
  const { ctx, protocol, volumeUsd, count, severity, largestUsd, largestAsset } = args;
  const proto = PROTOCOL_DISPLAY_NAME[protocol];
  const handle = PROTOCOL_HANDLE[protocol];
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/risk`;
  const largestLine =
    largestUsd != null
      ? `Largest single seizure: ${formatUsdShort(largestUsd)}${largestAsset ? ` (${largestAsset})` : ""}`
      : null;
  const interpretation =
    severity === "CRITICAL"
      ? "Volume is more than double the alert threshold. Bad-debt risk is elevated."
      : "Volume cleared the protocol's 24h threshold. Watch for follow-through.";

  // Voice rules: no em-dashes, no first-person plural.
  const lines = [
    `🔥 ${proto} liquidation cascade in progress.`,
    "",
    `Last 24 hours: ${formatUsdShort(volumeUsd)}`,
    `${count.toLocaleString()} liquidations`,
    largestLine,
    "",
    interpretation,
    "",
    dashboardUrl,
  ].filter((l): l is string => l !== null);
  let suggestedTweet = lines.join("\n");
  if (suggestedTweet.length > 280) {
    suggestedTweet = lines.slice(0, -2).join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = [
      `🔥 ${proto} liquidation cascade.`,
      `Last 24h: ${formatUsdShort(volumeUsd)} across ${count.toLocaleString()} events.`,
      dashboardUrl,
    ].join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  const headline = `${proto} 24h liquidations: ${formatUsdShort(volumeUsd)} (${count.toLocaleString()} events)`;
  const body = [
    `24h volume: ${formatUsdShort(volumeUsd)}`,
    `Count: ${count.toLocaleString()}`,
    largestLine ?? "",
    `Threshold: ${formatUsdShort(LIQUIDATION_THRESHOLDS_USD[protocol])} (${severity === "CRITICAL" ? "2x+" : "1x+"})`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ruleId: "liquidation_cascade",
    key: protocol,
    severity,
    headline,
    body,
    suggestedTweet,
    suggestedHandle: handle,
    dashboardUrl,
    data: {
      protocol,
      volumeUsd,
      count,
      threshold: LIQUIDATION_THRESHOLDS_USD[protocol],
      largestUsd,
      largestAsset,
    },
    firedAt: ctx.now,
  };
}
