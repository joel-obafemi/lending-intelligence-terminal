import type { AlertRule, Schedule } from "../types";
import { DefiLlamaClient } from "../sources/defillama";
import { FredClient } from "../sources/fred";
import { MorphoGraphQLClient } from "../sources/morpho";
import { createLiquidityNormalizationRule } from "./liquidity-normalization";
import { createNetFlow24hRule } from "./net-flow-24h";
import { createUtilizationRateKinkRule } from "./utilization-rate-kink";
import { createApyDispersionBlowoutRule } from "./apy-dispersion-blowout";
import { createRealYieldSpreadRegimeRule } from "./real-yield-spread-regime";
import { createLiquidationCascadeRule } from "./liquidation-cascade";
import { createMorphoCuratorHhiRule } from "./morpho-curator-hhi";

/**
 * Build the full registry of rules using shared DefiLlama, FRED, and Morpho
 * clients so a single Worker invocation makes at most one /pools, one
 * /protocol/{slug} per protocol, one FRED CSV per series, and one paged
 * Morpho vaults query.
 */
export function buildRuleRegistry(): AlertRule[] {
  const defiLlama = new DefiLlamaClient();
  const fred = new FredClient();
  const morpho = new MorphoGraphQLClient();
  return [
    createLiquidityNormalizationRule({ client: defiLlama }),
    createNetFlow24hRule({ client: defiLlama }),
    createUtilizationRateKinkRule({ client: defiLlama }),
    createApyDispersionBlowoutRule({ client: defiLlama }),
    createRealYieldSpreadRegimeRule({ defiLlama, fred }),
    createLiquidationCascadeRule(),
    createMorphoCuratorHhiRule({ client: morpho }),
  ];
}

export function rulesForSchedule(rules: AlertRule[], schedule: Schedule): AlertRule[] {
  return rules.filter((r) => r.schedule === schedule);
}
