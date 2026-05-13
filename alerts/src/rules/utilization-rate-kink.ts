import type { AlertContext, AlertEvent, AlertRule, Protocol, Severity } from "../types";
import {
  PROTOCOL_DISPLAY_NAME,
  PROTOCOL_HANDLE,
  UTILIZATION_THRESHOLDS_PCT,
  UTILIZATION_WATCHLIST,
} from "../config";
import { DefiLlamaClient } from "../sources/defillama";
import { readLatest, writeLatest } from "../state/kv";

interface LatestState {
  utilPct: number;
  recordedAt: number;
}

export interface UtilizationRuleDeps {
  client?: DefiLlamaClient;
}

export function createUtilizationRateKinkRule(deps: UtilizationRuleDeps = {}): AlertRule {
  return {
    id: "utilization_rate_kink",
    name: "Utilization rate kink",
    description:
      "Fires when a stablecoin market on Aave V3 or Spark crosses 90% or 95% utilization from below.",
    schedule: "fast",
    cooldownHours: 4,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new DefiLlamaClient();
      const events: AlertEvent[] = [];

      for (const entry of UTILIZATION_WATCHLIST) {
        const pool = await client.findPool(entry.protocol, entry.asset);
        if (!pool) {
          console.log(
            `utilization_rate_kink: no pool for ${entry.protocol}/${entry.asset}`,
          );
          continue;
        }
        const supply = pool.totalSupplyUsd ?? 0;
        const borrow = pool.totalBorrowUsd ?? 0;
        if (supply <= 0) continue;
        const utilPct = (borrow / supply) * 100;
        const ruleKey = `${entry.protocol}:${entry.asset}`;
        const prev = await readLatest<LatestState>(
          ctx.env,
          "utilization_rate_kink",
          ruleKey,
        );

        await writeLatest<LatestState>(ctx.env, "utilization_rate_kink", ruleKey, {
          utilPct,
          recordedAt: ctx.now.getTime(),
        });

        if (!prev) continue;

        // Detect threshold crossings from below. Iterate from the highest
        // threshold down so that a jump past both still fires the CRITICAL.
        const sortedThresholds = [...UTILIZATION_THRESHOLDS_PCT].sort((a, b) => b - a);
        for (const threshold of sortedThresholds) {
          if (prev.utilPct < threshold && utilPct >= threshold) {
            events.push(
              buildEvent({
                ctx,
                protocol: entry.protocol,
                asset: entry.asset,
                utilPct,
                threshold,
                pool,
              }),
            );
            break;
          }
        }
      }

      return events;
    },
  };
}

interface BuildEventArgs {
  ctx: AlertContext;
  protocol: Protocol;
  asset: string;
  utilPct: number;
  threshold: number;
  pool: { apyBase: number | null; apyBaseBorrow: number | null };
}

function buildEvent(args: BuildEventArgs): AlertEvent {
  const { ctx, protocol, asset, utilPct, threshold, pool } = args;
  const protoName = PROTOCOL_DISPLAY_NAME[protocol];
  const handle = PROTOCOL_HANDLE[protocol];
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/protocols?p=${protocol}`;
  const severity: Severity = threshold >= 95 ? "CRITICAL" : "WARNING";

  const supplyApy = pool.apyBase != null ? `${pool.apyBase.toFixed(2)}%` : "n/a";
  const borrowApy = pool.apyBaseBorrow != null ? `${pool.apyBaseBorrow.toFixed(2)}%` : "n/a";

  // Voice rules: no em-dashes, no first-person plural.
  const lines = [
    `${severity === "CRITICAL" ? "🚨" : "⚠️"} ${asset} utilization on ${protoName} just crossed ${threshold}%.`,
    "",
    `Supply APY: ${supplyApy}`,
    `Borrow APY: ${borrowApy}`,
    "",
    "At this utilization, rate-kink risk is active. Watch for the supply APY spike that typically follows.",
    "",
    dashboardUrl,
  ];
  let suggestedTweet = lines.join("\n");
  if (suggestedTweet.length > 280) {
    suggestedTweet = lines.slice(0, -2).join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  return {
    ruleId: "utilization_rate_kink",
    key: `${protocol}:${asset}:${threshold}`,
    severity,
    headline: `${asset} utilization on ${protoName} crossed ${threshold}%`,
    body: [
      `Utilization: ${utilPct.toFixed(2)}%`,
      `Supply APY: ${supplyApy}`,
      `Borrow APY: ${borrowApy}`,
    ].join("\n"),
    suggestedTweet,
    suggestedHandle: handle,
    dashboardUrl,
    data: {
      protocol,
      asset,
      utilPct,
      threshold,
      supplyApy: pool.apyBase,
      borrowApy: pool.apyBaseBorrow,
    },
    firedAt: ctx.now,
  };
}
