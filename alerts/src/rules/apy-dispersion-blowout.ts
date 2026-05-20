import type { AlertContext, AlertEvent, AlertRule, Protocol } from "../types";
import {
  DISPERSION_BAND_STDDEV,
  DISPERSION_BASELINE_WINDOW_DAYS,
  DISPERSION_MIN_ABSOLUTE_BPS,
  DISPERSION_MIN_TVL_USD,
  DISPERSION_PROTOCOLS,
  DISPERSION_STABLES,
  PROTOCOL_DISPLAY_NAME,
} from "../config";
import {
  computeBaselineStats,
  pruneBaselineSamples,
  recordBaselineSample,
  upsertRollingBaseline,
} from "../state/d1";
import { DefiLlamaClient } from "../sources/defillama";

/** Minimum baseline samples (one per hour) before the rule may fire. */
export const MIN_DISPERSION_SAMPLES = 72;

interface ProtocolApy {
  protocol: Protocol;
  apyPct: number;
  weightUsd: number;
}

export interface DispersionRuleDeps {
  client?: DefiLlamaClient;
}

export function createApyDispersionBlowoutRule(deps: DispersionRuleDeps = {}): AlertRule {
  return {
    id: "apy_dispersion_blowout",
    name: "Stablecoin APY dispersion blowout",
    description:
      "Fires when supply-APY dispersion across protocols for a stablecoin exceeds the 30-day mean by 2 stddev.",
    schedule: "hourly",
    cooldownHours: 12,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new DefiLlamaClient();
      const events: AlertEvent[] = [];
      const nowMs = ctx.now.getTime();
      const windowSinceMs =
        nowMs - DISPERSION_BASELINE_WINDOW_DAYS * 24 * 3600 * 1000;

      for (const stable of DISPERSION_STABLES) {
        const perProtocol: ProtocolApy[] = [];
        for (const protocol of DISPERSION_PROTOCOLS) {
          const blended = await client.blendedSupplyApyPct(protocol, stable);
          if (!blended) continue;
          // Min-TVL floor. Without this a single $1M Euler V2 vault paying
          // 18% APY would blow dispersion past the 2σ threshold even though
          // the rate is unreachable in practice. Filter the protocol out
          // of the cross-section when its blended TVL is too thin to count.
          if (blended.weightUsd < DISPERSION_MIN_TVL_USD) {
            console.log(
              `apy_dispersion_blowout: ${protocol}/${stable} excluded (TVL ${blended.weightUsd.toFixed(0)} < min ${DISPERSION_MIN_TVL_USD})`,
            );
            continue;
          }
          perProtocol.push({
            protocol,
            apyPct: blended.apyPct,
            weightUsd: blended.weightUsd,
          });
        }
        if (perProtocol.length < 2) {
          console.log(
            `apy_dispersion_blowout: only ${perProtocol.length} live APY for ${stable}, skipping`,
          );
          continue;
        }

        const sortedDesc = [...perProtocol].sort((a, b) => b.apyPct - a.apyPct);
        const max = sortedDesc[0]!;
        const min = sortedDesc[sortedDesc.length - 1]!;
        const dispersionBps = (max.apyPct - min.apyPct) * 100;

        const metricKey = `dispersion:${stable}`;
        await recordBaselineSample(ctx.env, metricKey, nowMs, dispersionBps);
        await pruneBaselineSamples(ctx.env, metricKey, windowSinceMs);

        const stats = await computeBaselineStats(ctx.env, metricKey, windowSinceMs);
        if (stats) {
          await upsertRollingBaseline(
            ctx.env,
            metricKey,
            DISPERSION_BASELINE_WINDOW_DAYS,
            stats,
            nowMs,
          );
        }
        if (!stats || stats.sampleCount < MIN_DISPERSION_SAMPLES) {
          console.log(
            `apy_dispersion_blowout: ${metricKey} accumulating (${stats?.sampleCount ?? 0}/${MIN_DISPERSION_SAMPLES})`,
          );
          continue;
        }

        const threshold = stats.mean + DISPERSION_BAND_STDDEV * stats.stddev;
        if (dispersionBps <= threshold) continue;
        // Absolute floor: spreads below 30 bps don't move treasury capital,
        // so they're not tweet-worthy even if statistically anomalous.
        if (dispersionBps < DISPERSION_MIN_ABSOLUTE_BPS) {
          console.log(
            `apy_dispersion_blowout: ${stable} dispersion ${dispersionBps.toFixed(0)} bps below absolute floor (${DISPERSION_MIN_ABSOLUTE_BPS} bps), skipping`,
          );
          continue;
        }

        events.push(
          buildEvent({
            ctx,
            stable,
            dispersionBps,
            mean: stats.mean,
            ranked: sortedDesc,
          }),
        );
      }

      return events;
    },
  };
}

interface BuildEventArgs {
  ctx: AlertContext;
  stable: string;
  dispersionBps: number;
  mean: number;
  ranked: ProtocolApy[];
}

function buildEvent(args: BuildEventArgs): AlertEvent {
  const { ctx, stable, dispersionBps, mean, ranked } = args;
  const ratio = mean > 0 ? dispersionBps / mean : Infinity;
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/rates?asset=${stable}`;
  const rankedList = ranked
    .map((r) => `${PROTOCOL_DISPLAY_NAME[r.protocol]} ${r.apyPct.toFixed(2)}%`)
    .join(", ");

  const interpretation = dispersionBps > 200
    ? "Treasury rotations across protocols rarely sit still at this gap."
    : "The gap usually closes as opportunistic capital moves toward the best venue.";

  // Voice rules: no em-dashes, no first-person plural.
  const lines = [
    `${stable} supply APY dispersion across protocols just hit ${dispersionBps.toFixed(0)} bps.`,
    "",
    `30-day average: ${mean.toFixed(0)} bps.`,
    `${ratio.toFixed(1)}x baseline.`,
    "",
    rankedList,
    "",
    `Same dollar of ${stable}, different pools, different rates. ${interpretation}`,
    "",
    dashboardUrl,
  ];
  let suggestedTweet = lines.join("\n");
  if (suggestedTweet.length > 280) {
    suggestedTweet = lines.slice(0, -2).join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = [
      lines[0],
      "",
      `30-day average: ${mean.toFixed(0)} bps. ${ratio.toFixed(1)}x baseline.`,
      "",
      rankedList,
      "",
      dashboardUrl,
    ].join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  return {
    ruleId: "apy_dispersion_blowout",
    key: stable,
    severity: "NORMAL",
    headline: `${stable} APY dispersion: ${dispersionBps.toFixed(0)} bps (${ratio.toFixed(1)}x baseline)`,
    body: [
      `Dispersion: ${dispersionBps.toFixed(0)} bps`,
      `30-day mean: ${mean.toFixed(0)} bps`,
      `Ranked: ${rankedList}`,
    ].join("\n"),
    suggestedTweet,
    dashboardUrl,
    data: {
      stable,
      dispersionBps,
      mean30dBps: mean,
      ranked: ranked.map((r) => ({
        protocol: r.protocol,
        apyPct: r.apyPct,
        weightUsd: r.weightUsd,
      })),
    },
    firedAt: ctx.now,
  };
}
