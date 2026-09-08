import type { AlertRule } from "../types";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import { evaluateMarketDelta } from "./moonwell-market-delta-shared";

export interface BorrowDeltaDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellBorrowDelta7dRule(deps: BorrowDeltaDeps = {}): AlertRule {
  return {
    id: "moonwell_borrow_delta_7d",
    name: "Moonwell market borrow Δ (7d)",
    description:
      "Fires when any Moonwell market's total borrow (USD) moves ≥10% week-over-week. CRITICAL above 25%.",
    schedule: "daily",
    cooldownHours: 168,
    evaluate: (ctx) =>
      evaluateMarketDelta(ctx, {
        ruleId: "moonwell_borrow_delta_7d",
        field: "borrow",
        client: deps.client,
      }),
  };
}
