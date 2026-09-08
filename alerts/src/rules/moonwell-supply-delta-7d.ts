import type { AlertRule } from "../types";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import { evaluateMarketDelta } from "./moonwell-market-delta-shared";

export interface SupplyDeltaDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellSupplyDelta7dRule(deps: SupplyDeltaDeps = {}): AlertRule {
  return {
    id: "moonwell_supply_delta_7d",
    name: "Moonwell market supply Δ (7d)",
    description:
      "Fires when any Moonwell market's total supply (USD) moves ≥10% week-over-week. CRITICAL above 25%.",
    schedule: "daily",
    cooldownHours: 168,
    evaluate: (ctx) =>
      evaluateMarketDelta(ctx, {
        ruleId: "moonwell_supply_delta_7d",
        field: "supply",
        client: deps.client,
      }),
  };
}
