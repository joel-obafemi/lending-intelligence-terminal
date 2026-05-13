import type { AlertRule, Schedule } from "../types";
import { DefiLlamaClient } from "../sources/defillama";
import { FredClient } from "../sources/fred";
import { createLiquidityNormalizationRule } from "./liquidity-normalization";
import { createNetFlow24hRule } from "./net-flow-24h";
import { createUtilizationRateKinkRule } from "./utilization-rate-kink";
import { createApyDispersionBlowoutRule } from "./apy-dispersion-blowout";
import { createRealYieldSpreadRegimeRule } from "./real-yield-spread-regime";

/**
 * Build the full registry of rules using shared DefiLlama + FRED clients so
 * a single Worker invocation makes at most one /pools + /lendBorrow, one
 * /protocol/{slug} per protocol, and one FRED CSV fetch per series.
 */
export function buildRuleRegistry(): AlertRule[] {
  const defiLlama = new DefiLlamaClient();
  const fred = new FredClient();
  return [
    createLiquidityNormalizationRule({ client: defiLlama }),
    createNetFlow24hRule({ client: defiLlama }),
    createUtilizationRateKinkRule({ client: defiLlama }),
    createApyDispersionBlowoutRule({ client: defiLlama }),
    createRealYieldSpreadRegimeRule({ defiLlama, fred }),
  ];
}

export function rulesForSchedule(rules: AlertRule[], schedule: Schedule): AlertRule[] {
  return rules.filter((r) => r.schedule === schedule);
}
