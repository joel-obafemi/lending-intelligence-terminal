import type { AlertRule, Schedule } from "../types";
import { DefiLlamaClient } from "../sources/defillama";
import { createLiquidityNormalizationRule } from "./liquidity-normalization";
import { createNetFlow24hRule } from "./net-flow-24h";

/**
 * Build the full registry of rules using a shared DefiLlama client so a
 * single Worker invocation makes at most one /pools + /lendBorrow + one
 * /protocol/{slug} request per protocol.
 */
export function buildRuleRegistry(): AlertRule[] {
  const client = new DefiLlamaClient();
  return [
    createLiquidityNormalizationRule({ client }),
    createNetFlow24hRule({ client }),
  ];
}

export function rulesForSchedule(rules: AlertRule[], schedule: Schedule): AlertRule[] {
  return rules.filter((r) => r.schedule === schedule);
}
