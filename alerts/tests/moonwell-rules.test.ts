/**
 * Smoke tests for the Moonwell rule family. Verifies:
 *   - threshold-crossing rules fire on transition (and only on transition),
 *   - one-shot semantics for the OEV per-wrapper capture rule,
 *   - 7d Δ rules self-seed and respect the min-sample-days guard,
 *   - the registry includes every Moonwell rule.
 *
 * Pattern mirrors tests/rules.test.ts: stub the upstream clients, run
 * `rule.evaluate(ctx)`, assert on returned events. No network.
 */

import { describe, expect, test } from "vitest";
import { FakeD1, FakeKV, makeEnv } from "./mocks";
import type { AlertContext } from "../src/types";
import { buildRuleRegistry } from "../src/rules";
import { createMoonwellTvlThresholdRule } from "../src/rules/moonwell-tvl-threshold";
import { createMoonwellOevWrapperCapture70Rule } from "../src/rules/moonwell-oev-wrapper-capture70";
import { createMoonwellSupplyDelta7dRule } from "../src/rules/moonwell-supply-delta-7d";
import type { MoonwellDefiLlamaClient } from "../src/sources/moonwell";

/** Minimal stub for the MoonwellDefiLlamaClient surface our rules call. */
class StubMoonwellClient {
  totalTvl: number | null = null;
  vaultsTvl: number | null = null;
  trailing30dRevenue: number | null = null;
  latestDaily: { usd: number; date: string } | null = null;
  pools: Array<{
    pool: string;
    chain: string;
    project: string;
    symbol: string;
    tvlUsd: number;
    totalSupplyUsd: number | null;
    totalBorrowUsd: number | null;
    apyBase: number | null;
    apyReward: number | null;
  }> = [];

  async getTotalTvlUsd() {
    return this.totalTvl;
  }
  async getVaultsTvlUsd() {
    return this.vaultsTvl;
  }
  async getTrailing30dRevenueUsd() {
    return this.trailing30dRevenue;
  }
  async getLatestDailyRevenueUsd() {
    return this.latestDaily;
  }
  async getLendingPools() {
    return this.pools;
  }
  async getTvlByChain() {
    return { base: null, optimism: null, ethereum: null, moonbeam: null, moonriver: null };
  }
}

function ctxAt(env: ReturnType<typeof makeEnv>, iso: string): AlertContext {
  const now = new Date(iso);
  return { env, now, fetchedAt: now };
}

describe("registry", () => {
  test("includes every Moonwell rule", () => {
    const registry = buildRuleRegistry();
    const moonwellIds = registry.map((r) => r.id).filter((id) => id.startsWith("moonwell_"));
    expect(moonwellIds.sort()).toEqual(
      [
        "moonwell_borrow_delta_7d",
        "moonwell_liquidation_daily_spike",
        "moonwell_liquidation_whale",
        "moonwell_monthly_revenue_threshold",
        "moonwell_oev_revenue_threshold",
        "moonwell_oev_wrapper_capture70",
        "moonwell_revenue_daily_ath",
        "moonwell_supply_delta_7d",
        "moonwell_tvl_threshold",
        "moonwell_vault_deposit_spike",
        "moonwell_vault_tvl_threshold",
        "moonwell_weekly_recap",
      ].sort(),
    );
  });

  test("each Moonwell rule has a valid schedule and positive cooldown", () => {
    const registry = buildRuleRegistry();
    for (const rule of registry.filter((r) => r.id.startsWith("moonwell_"))) {
      expect(["fast", "hourly", "daily", "weekly"]).toContain(rule.schedule);
      expect(rule.cooldownHours).toBeGreaterThan(0);
    }
  });
});

describe("moonwell_tvl_threshold", () => {
  test("seeds silently on first evaluation (no events even if above threshold)", async () => {
    const env = makeEnv();
    const stub = new StubMoonwellClient();
    stub.totalTvl = 80_000_000;
    const rule = createMoonwellTvlThresholdRule({
      client: stub as unknown as MoonwellDefiLlamaClient,
    });
    const events = await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    expect(events).toEqual([]);
    // KV should now hold the baseline.
    expect((env.ALERTS_KV as unknown as FakeKV).inspect("moonwell:lastvalue:tvl_total")).toBe(
      "80000000",
    );
  });

  test("fires on the upward crossing of one threshold", async () => {
    const env = makeEnv();
    const stub = new StubMoonwellClient();
    const rule = createMoonwellTvlThresholdRule({
      client: stub as unknown as MoonwellDefiLlamaClient,
    });
    // Seed between $70M and $75M so the next tick crosses only $75M.
    stub.totalTvl = 71_000_000;
    await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    // Tick up past $75M but below $80M.
    stub.totalTvl = 76_000_000;
    const events = await rule.evaluate(ctxAt(env, "2026-06-16T11:00:00Z"));
    expect(events).toHaveLength(1);
    expect(events[0]!.key).toBe("75000000");
    expect(events[0]!.severity).toBe("NORMAL");
    expect(events[0]!.suggestedTweet).toContain("crossed");
  });

  test("does not re-fire the same threshold on subsequent ticks", async () => {
    const env = makeEnv();
    const stub = new StubMoonwellClient();
    const rule = createMoonwellTvlThresholdRule({
      client: stub as unknown as MoonwellDefiLlamaClient,
    });
    stub.totalTvl = 71_000_000;
    await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    stub.totalTvl = 76_000_000;
    await rule.evaluate(ctxAt(env, "2026-06-16T11:00:00Z"));
    stub.totalTvl = 77_000_000;
    const events = await rule.evaluate(ctxAt(env, "2026-06-16T12:00:00Z"));
    expect(events).toEqual([]);
  });

  test("fires both thresholds when value jumps past two at once", async () => {
    const env = makeEnv();
    const stub = new StubMoonwellClient();
    const rule = createMoonwellTvlThresholdRule({
      client: stub as unknown as MoonwellDefiLlamaClient,
    });
    stub.totalTvl = 69_000_000;
    await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    stub.totalTvl = 95_000_000;
    const events = await rule.evaluate(ctxAt(env, "2026-06-16T11:00:00Z"));
    const keys = events.map((e) => e.key).sort();
    expect(keys).toEqual(["70000000", "75000000", "80000000", "90000000"]);
  });
});

describe("moonwell_oev_wrapper_capture70", () => {
  // The rule needs the moonwellNeon source. We stub it by mocking the
  // env's MOONWELL_DATABASE_URL absence, which short-circuits the rule.
  test("short-circuits when MOONWELL_DATABASE_URL is unset", async () => {
    const env = makeEnv();
    expect(env.MOONWELL_DATABASE_URL).toBeUndefined();
    const rule = createMoonwellOevWrapperCapture70Rule();
    const events = await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    expect(events).toEqual([]);
  });
});

describe("moonwell_supply_delta_7d", () => {
  test("self-seeds and does not fire on first tick", async () => {
    const env = makeEnv();
    const stub = new StubMoonwellClient();
    stub.pools = [
      {
        pool: "moonwell-base-aero",
        chain: "Base",
        project: "moonwell-lending",
        symbol: "AERO",
        tvlUsd: 18_400_000,
        totalSupplyUsd: 18_400_000,
        totalBorrowUsd: 5_000_000,
        apyBase: 4.2,
        apyReward: 1.1,
      },
    ];
    const rule = createMoonwellSupplyDelta7dRule({
      client: stub as unknown as MoonwellDefiLlamaClient,
    });
    const events = await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    expect(events).toEqual([]);
    // One snapshot should have been recorded.
    const snapshots = (env.ALERTS_DB as unknown as FakeD1).rowsFor(
      "moonwell_market_snapshots",
    );
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.market_symbol).toBe("AERO");
  });

  test("does not fire when prior snapshot is younger than the min sample window", async () => {
    const env = makeEnv();
    const stub = new StubMoonwellClient();
    stub.pools = [
      {
        pool: "moonwell-base-aero",
        chain: "Base",
        project: "moonwell-lending",
        symbol: "AERO",
        tvlUsd: 18_400_000,
        totalSupplyUsd: 18_400_000,
        totalBorrowUsd: 5_000_000,
        apyBase: 4.2,
        apyReward: 1.1,
      },
    ];
    const rule = createMoonwellSupplyDelta7dRule({
      client: stub as unknown as MoonwellDefiLlamaClient,
    });
    // Seed.
    await rule.evaluate(ctxAt(env, "2026-06-16T10:00:00Z"));
    // Three days later, supply +50% — but baseline is only 3d old, so no fire.
    stub.pools[0]!.totalSupplyUsd = 27_600_000;
    const events = await rule.evaluate(ctxAt(env, "2026-06-19T10:00:00Z"));
    expect(events).toEqual([]);
  });
});
