import type { AlertContext, AlertEvent, AlertRule, Protocol, Severity } from "../types";
import {
  NET_FLOW_PROTOCOLS,
  NET_FLOW_THRESHOLDS,
  PROTOCOL_DISPLAY_NAME,
  PROTOCOL_HANDLE,
} from "../config";
import { findTvlAtOrBefore, recordTvlSnapshot } from "../state/d1";
import { DefiLlamaClient } from "../sources/defillama";
import { formatUsdShort } from "../dispatchers/format";

export interface NetFlowRuleDeps {
  client?: DefiLlamaClient;
}

/**
 * Lookback window for the 24h delta. Hourly cron may run a few minutes off
 * 24h boundaries, so allow a ±2h tolerance when picking the prior snapshot.
 */
const LOOKBACK_MS = 24 * 3600 * 1000;
const LOOKBACK_TOLERANCE_MS = 2 * 3600 * 1000;

export function createNetFlow24hRule(deps: NetFlowRuleDeps = {}): AlertRule {
  return {
    id: "net_flow_24h",
    name: "24-hour net flow",
    description:
      "Fires when a covered protocol's Ethereum TVL changes by more than the configured 24h threshold.",
    schedule: "hourly",
    cooldownHours: 12,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new DefiLlamaClient();
      const events: AlertEvent[] = [];
      const nowMs = ctx.now.getTime();
      const targetPastMs = nowMs - LOOKBACK_MS;
      const earliestAcceptableMs = targetPastMs - LOOKBACK_TOLERANCE_MS;

      for (const protocol of NET_FLOW_PROTOCOLS) {
        const currentTvl = await client.getProtocolTvlUsd(protocol);
        if (currentTvl == null) {
          console.log(`net_flow_24h: no current TVL for ${protocol}`);
          continue;
        }

        const prior = await findTvlAtOrBefore(ctx.env, protocol, targetPastMs);
        // Always persist the current reading so the next run has a baseline.
        await recordTvlSnapshot(ctx.env, protocol, nowMs, currentTvl);

        if (!prior) {
          console.log(`net_flow_24h: seeding baseline for ${protocol}`);
          continue;
        }
        if (prior.snapshot_at < earliestAcceptableMs) {
          console.log(
            `net_flow_24h: prior snapshot for ${protocol} too old (${prior.snapshot_at}), skipping`,
          );
          continue;
        }

        const delta = currentTvl - prior.tvl_usd;
        const absDelta = Math.abs(delta);

        if (absDelta <= NET_FLOW_THRESHOLDS.normalUsd) {
          continue;
        }

        const severity: Severity =
          absDelta > NET_FLOW_THRESHOLDS.criticalUsd ? "CRITICAL" : "NORMAL";
        events.push(
          buildEvent({
            ctx,
            protocol,
            currentTvl,
            priorTvl: prior.tvl_usd,
            priorAtMs: prior.snapshot_at,
            delta,
            severity,
          }),
        );
      }

      return events;
    },
  };
}

interface BuildEventArgs {
  ctx: AlertContext;
  protocol: Protocol;
  currentTvl: number;
  priorTvl: number;
  priorAtMs: number;
  delta: number;
  severity: Severity;
}

function buildEvent(args: BuildEventArgs): AlertEvent {
  const { ctx, protocol, currentTvl, priorTvl, delta, severity } = args;
  const proto = PROTOCOL_DISPLAY_NAME[protocol];
  const handle = PROTOCOL_HANDLE[protocol];
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/protocols?p=${protocol}`;

  const direction = delta >= 0 ? "inflow" : "outflow";
  const absDelta = Math.abs(delta);

  // Suggested tweet. Voice rules: no em-dashes, no first-person plural.
  const lines = [
    `${proto} just saw ${formatUsdShort(absDelta)} in net ${direction} over 24 hours.`,
    "",
    `TVL: ${formatUsdShort(priorTvl)} to ${formatUsdShort(currentTvl)}`,
    severity === "CRITICAL"
      ? "Move size puts it among the largest single-day shifts on record for the protocol."
      : "",
    "",
    dashboardUrl,
  ].filter((line) => line !== undefined && line !== null);
  let suggestedTweet = lines.join("\n");
  if (suggestedTweet.length > 280) {
    suggestedTweet = lines.slice(0, -2).join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  const headline = `${proto} 24h net ${direction}: ${formatUsdShort(absDelta)}`;
  const body = [
    `Prior TVL: ${formatUsdShort(priorTvl)}`,
    `Current TVL: ${formatUsdShort(currentTvl)}`,
    `Net change: ${delta >= 0 ? "+" : ""}${formatUsdShort(delta)}`,
  ].join("\n");

  return {
    ruleId: "net_flow_24h",
    key: protocol,
    severity,
    headline,
    body,
    suggestedTweet,
    suggestedHandle: handle,
    dashboardUrl,
    data: { protocol, priorTvl, currentTvl, delta, priorAtMs: args.priorAtMs },
    firedAt: ctx.now,
  };
}
