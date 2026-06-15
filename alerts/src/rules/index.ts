import type { AlertRule, Schedule } from "../types";
import { DefiLlamaClient } from "../sources/defillama";
import { FredClient } from "../sources/fred";
import { MorphoGraphQLClient } from "../sources/morpho";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import { createLiquidityNormalizationRule } from "./liquidity-normalization";
import { createNetFlow24hRule } from "./net-flow-24h";
import { createUtilizationRateKinkRule } from "./utilization-rate-kink";
import { createApyDispersionBlowoutRule } from "./apy-dispersion-blowout";
import { createRealYieldSpreadRegimeRule } from "./real-yield-spread-regime";
import { createLiquidationCascadeRule } from "./liquidation-cascade";
import { createWhaleLiquidationRule } from "./whale-liquidation";
import { createCascadeBurstRule } from "./cascade-burst";
import { createDailyVolumeSpikeRule } from "./daily-volume-spike";
import { createMorphoCuratorHhiRule } from "./morpho-curator-hhi";
import { createMoonwellTvlThresholdRule } from "./moonwell-tvl-threshold";
import { createMoonwellOevRevenueThresholdRule } from "./moonwell-oev-revenue-threshold";
import { createMoonwellOevWrapperCapture70Rule } from "./moonwell-oev-wrapper-capture70";
import { createMoonwellSupplyDelta7dRule } from "./moonwell-supply-delta-7d";
import { createMoonwellBorrowDelta7dRule } from "./moonwell-borrow-delta-7d";
import { createMoonwellLiquidationWhaleRule } from "./moonwell-liquidation-whale";
import { createMoonwellLiquidationDailySpikeRule } from "./moonwell-liquidation-daily-spike";
import { createMoonwellMonthlyRevenueThresholdRule } from "./moonwell-monthly-revenue-threshold";
import { createMoonwellRevenueDailyAthRule } from "./moonwell-revenue-daily-ath";
import { createMoonwellVaultTvlThresholdRule } from "./moonwell-vault-tvl-threshold";
import { createMoonwellVaultDepositSpikeRule } from "./moonwell-vault-deposit-spike";
import { createMoonwellWeeklyRecapRule } from "./moonwell-weekly-recap";

/**
 * Build the full registry of rules using shared DefiLlama, FRED, Morpho,
 * and Moonwell-DefiLlama clients so a single Worker invocation makes at
 * most one /pools, one /protocol/{slug} per protocol, one FRED CSV per
 * series, one paged Morpho vaults query, and one Moonwell protocol/fees
 * round-trip across all Moonwell rules.
 */
export function buildRuleRegistry(): AlertRule[] {
  const defiLlama = new DefiLlamaClient();
  const fred = new FredClient();
  const morpho = new MorphoGraphQLClient();
  const moonwell = new MoonwellDefiLlamaClient();
  return [
    createLiquidityNormalizationRule({ client: defiLlama }),
    createNetFlow24hRule({ client: defiLlama }),
    createUtilizationRateKinkRule({ client: defiLlama }),
    createApyDispersionBlowoutRule({ client: defiLlama }),
    createRealYieldSpreadRegimeRule({ defiLlama, fred }),
    createLiquidationCascadeRule(),
    createWhaleLiquidationRule(),
    createCascadeBurstRule(),
    createDailyVolumeSpikeRule(),
    createMorphoCuratorHhiRule({ client: morpho }),
    // ── Moonwell rules ──
    createMoonwellTvlThresholdRule({ client: moonwell }),
    createMoonwellOevRevenueThresholdRule(),
    createMoonwellOevWrapperCapture70Rule(),
    createMoonwellSupplyDelta7dRule({ client: moonwell }),
    createMoonwellBorrowDelta7dRule({ client: moonwell }),
    createMoonwellLiquidationWhaleRule(),
    createMoonwellLiquidationDailySpikeRule(),
    createMoonwellMonthlyRevenueThresholdRule({ client: moonwell }),
    createMoonwellRevenueDailyAthRule({ client: moonwell }),
    createMoonwellVaultTvlThresholdRule({ client: moonwell }),
    createMoonwellVaultDepositSpikeRule({ client: moonwell }),
    createMoonwellWeeklyRecapRule({ client: moonwell }),
  ];
}

export function rulesForSchedule(rules: AlertRule[], schedule: Schedule): AlertRule[] {
  return rules.filter((r) => r.schedule === schedule);
}
