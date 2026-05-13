import type { AlertContext, AlertEvent, AlertRule, Severity } from "../types";
import {
  REAL_YIELD_PROTOCOLS,
  REAL_YIELD_RAPID_MOVE_BPS,
  REAL_YIELD_STABLES,
} from "../config";
import { DefiLlamaClient } from "../sources/defillama";
import { FredClient } from "../sources/fred";
import { readLatest, writeLatest } from "../state/kv";

interface LatestState {
  spreadBps: number;
  blendedApyPct: number;
  tBillPct: number;
  recordedAt: number;
}

export interface RealYieldRuleDeps {
  defiLlama?: DefiLlamaClient;
  fred?: FredClient;
}

export function createRealYieldSpreadRegimeRule(
  deps: RealYieldRuleDeps = {},
): AlertRule {
  return {
    id: "real_yield_spread_regime",
    name: "Real yield spread regime",
    description:
      "Fires when the blended stablecoin APY minus 4-week T-bill spread crosses zero or moves more than 25 bps in 24 hours.",
    schedule: "hourly",
    cooldownHours: 24,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const defiLlama = deps.defiLlama ?? new DefiLlamaClient();
      const fred = deps.fred ?? new FredClient();

      let weightedSum = 0;
      let weightSum = 0;
      for (const protocol of REAL_YIELD_PROTOCOLS) {
        for (const stable of REAL_YIELD_STABLES) {
          const blended = await defiLlama.blendedSupplyApyPct(protocol, stable);
          if (!blended) continue;
          weightedSum += blended.apyPct * blended.weightUsd;
          weightSum += blended.weightUsd;
        }
      }
      if (weightSum <= 0) {
        console.log("real_yield_spread_regime: no eligible stablecoin pools");
        return [];
      }
      const blendedApyPct = weightedSum / weightSum;

      const tBillPct = await fred.fetchTBill4wk();
      if (tBillPct == null) {
        console.log("real_yield_spread_regime: FRED unavailable, skipping");
        return [];
      }

      const spreadBps = (blendedApyPct - tBillPct) * 100;
      const prev = await readLatest<LatestState>(
        ctx.env,
        "real_yield_spread_regime",
        "global",
      );

      await writeLatest<LatestState>(ctx.env, "real_yield_spread_regime", "global", {
        spreadBps,
        blendedApyPct,
        tBillPct,
        recordedAt: ctx.now.getTime(),
      });

      if (!prev) {
        console.log(
          `real_yield_spread_regime: seeded baseline at ${spreadBps.toFixed(1)} bps`,
        );
        return [];
      }

      const zeroCross =
        (prev.spreadBps < 0 && spreadBps >= 0) ||
        (prev.spreadBps > 0 && spreadBps <= 0);
      const dayMs = 24 * 3600 * 1000;
      const withinDay = ctx.now.getTime() - prev.recordedAt <= dayMs;
      const rapidMove =
        withinDay && Math.abs(spreadBps - prev.spreadBps) >= REAL_YIELD_RAPID_MOVE_BPS;

      if (!zeroCross && !rapidMove) return [];

      const severity: Severity = zeroCross ? "CRITICAL" : "NORMAL";
      const direction = spreadBps > prev.spreadBps ? "above" : "below";
      const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/rates`;

      // Voice rules: no em-dashes, no first-person plural.
      let firstLine: string;
      let interpretation: string;
      if (zeroCross) {
        const crossingTo = spreadBps >= 0 ? "above" : "below";
        firstLine = `The Real Yield Spread just crossed ${crossingTo} parity.`;
        interpretation =
          crossingTo === "above"
            ? "Stablecoin lending is earning above the risk-free rate again."
            : "Stablecoin lending fell beneath the risk-free rate.";
      } else {
        firstLine = `The Real Yield Spread moved ${Math.abs(spreadBps - prev.spreadBps).toFixed(0)} bps ${direction} in 24 hours.`;
        interpretation =
          spreadBps > prev.spreadBps
            ? "Stablecoin lending pulled ahead of the risk-free rate."
            : "Stablecoin lending lost ground to the risk-free rate.";
      }

      const lines = [
        firstLine,
        "",
        `Spread: ${formatBps(prev.spreadBps)} to ${formatBps(spreadBps)}`,
        `Blended stablecoin APY: ${blendedApyPct.toFixed(2)}%`,
        `4-week T-bill: ${tBillPct.toFixed(2)}%`,
        "",
        interpretation,
        "",
        dashboardUrl,
      ];
      let suggestedTweet = lines.join("\n");
      if (suggestedTweet.length > 280) {
        suggestedTweet = [
          firstLine,
          "",
          `Spread ${formatBps(prev.spreadBps)} to ${formatBps(spreadBps)}.`,
          `Blended APY ${blendedApyPct.toFixed(2)}%, T-bill ${tBillPct.toFixed(2)}%.`,
          "",
          dashboardUrl,
        ].join("\n");
      }
      if (suggestedTweet.length > 280) {
        suggestedTweet = suggestedTweet.slice(0, 277) + "...";
      }

      const headline = zeroCross
        ? `Real Yield Spread crossed parity (${formatBps(spreadBps)})`
        : `Real Yield Spread moved ${Math.abs(spreadBps - prev.spreadBps).toFixed(0)} bps in 24h`;
      const body = [
        `Spread: ${formatBps(spreadBps)} (prior ${formatBps(prev.spreadBps)})`,
        `Blended stablecoin APY: ${blendedApyPct.toFixed(2)}%`,
        `4-week T-bill: ${tBillPct.toFixed(2)}%`,
      ].join("\n");

      return [
        {
          ruleId: "real_yield_spread_regime",
          key: "global",
          severity,
          headline,
          body,
          suggestedTweet,
          dashboardUrl,
          data: {
            spreadBps,
            priorSpreadBps: prev.spreadBps,
            blendedApyPct,
            tBillPct,
            zeroCross,
            rapidMove,
          },
          firedAt: ctx.now,
        },
      ];
    },
  };
}

function formatBps(bps: number): string {
  const rounded = Math.round(bps);
  return rounded >= 0 ? `+${rounded} bps` : `${rounded} bps`;
}
