import { describe, expect, test } from "vitest";
import { FakeD1, FakeKV, makeEnv } from "./mocks";
import { createNetFlow24hRule } from "../src/rules/net-flow-24h";
import {
  MIN_BASELINE_SAMPLES,
  createLiquidityNormalizationRule,
} from "../src/rules/liquidity-normalization";
import { recordBaselineSample, recordTvlSnapshot } from "../src/state/d1";
import { AlertEngine } from "../src/engine";
import type { YieldPool } from "../src/sources/defillama";

function fakeYieldPool(over: Partial<YieldPool> & { project: string; symbol: string }): YieldPool {
  const base: YieldPool = {
    pool: `${over.project}:${over.symbol}`,
    chain: "Ethereum",
    project: over.project,
    symbol: over.symbol,
    tvlUsd: 0,
    totalSupplyUsd: null,
    totalBorrowUsd: null,
    apyBase: null,
    apyBaseBorrow: null,
    poolMeta: null,
  };
  return { ...base, ...over };
}

class StubDefiLlamaClient {
  public protocolTvlByProtocol = new Map<string, number>();
  public poolsByKey = new Map<string, YieldPool>();

  setPool(protocol: string, asset: string, pool: YieldPool) {
    this.poolsByKey.set(`${protocol}:${asset}`, pool);
  }

  setProtocolTvl(protocol: string, tvl: number) {
    this.protocolTvlByProtocol.set(protocol, tvl);
  }

  async findPool(protocol: string, asset: string): Promise<YieldPool | null> {
    return this.poolsByKey.get(`${protocol}:${asset}`) ?? null;
  }

  async getProtocolTvlUsd(protocol: string): Promise<number | null> {
    return this.protocolTvlByProtocol.get(protocol) ?? null;
  }

  async getEthereumYieldPools(): Promise<YieldPool[]> {
    return [...this.poolsByKey.values()];
  }
}

const HOUR_MS = 3600 * 1000;

describe("net_flow_24h rule", () => {
  test("does not fire when delta is below threshold", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    stub.setProtocolTvl("aave-v3", 30_100_000_000);
    stub.setProtocolTvl("spark", 5_000_000_000);
    stub.setProtocolTvl("morpho", 8_000_000_000);
    stub.setProtocolTvl("fluid", 1_500_000_000);

    const now = new Date("2026-05-13T12:00:00Z");
    const past = now.getTime() - 24 * HOUR_MS;
    for (const [p, prior] of [
      ["aave-v3", 30_000_000_000],
      ["spark", 4_900_000_000],
      ["morpho", 8_100_000_000],
      ["fluid", 1_480_000_000],
    ] as const) {
      await recordTvlSnapshot(env, p, past, prior);
    }

    const rule = createNetFlow24hRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });

  test("fires NORMAL severity when 24h delta exceeds normal threshold", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    // 600M outflow on aave-v3.
    stub.setProtocolTvl("aave-v3", 29_400_000_000);
    stub.setProtocolTvl("spark", 5_000_000_000);
    stub.setProtocolTvl("morpho", 8_000_000_000);
    stub.setProtocolTvl("fluid", 1_500_000_000);

    const now = new Date("2026-05-13T12:00:00Z");
    const past = now.getTime() - 24 * HOUR_MS;
    for (const [p, prior] of [
      ["aave-v3", 30_000_000_000],
      ["spark", 5_010_000_000],
      ["morpho", 8_005_000_000],
      ["fluid", 1_499_000_000],
    ] as const) {
      await recordTvlSnapshot(env, p, past, prior);
    }

    const rule = createNetFlow24hRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    expect(events[0]!.key).toBe("aave-v3");
    expect(events[0]!.severity).toBe("NORMAL");
    expect(events[0]!.suggestedTweet).toContain("outflow");
    expect(events[0]!.suggestedTweet).not.toContain("—");
    expect(events[0]!.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(events[0]!.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("fires CRITICAL when 24h delta exceeds critical threshold", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    stub.setProtocolTvl("aave-v3", 27_500_000_000); // 2.5B outflow

    const now = new Date("2026-05-13T12:00:00Z");
    const past = now.getTime() - 24 * HOUR_MS;
    await recordTvlSnapshot(env, "aave-v3", past, 30_000_000_000);

    const rule = createNetFlow24hRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    expect(events[0]!.severity).toBe("CRITICAL");
  });

  test("does not fire on the first run (seeds baseline, no prior snapshot)", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    stub.setProtocolTvl("aave-v3", 30_000_000_000);

    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createNetFlow24hRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
    const stored = (env.ALERTS_DB as unknown as FakeD1).rowsFor("tvl_snapshots");
    expect(stored.length).toBeGreaterThan(0);
  });

  test("engine respects cooldown on repeat evaluation", async () => {
    const env = makeEnv({ TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" });
    const stub = new StubDefiLlamaClient();
    stub.setProtocolTvl("aave-v3", 29_400_000_000);

    const now = new Date("2026-05-13T12:00:00Z");
    const past = now.getTime() - 24 * HOUR_MS;
    await recordTvlSnapshot(env, "aave-v3", past, 30_000_000_000);

    const rule = createNetFlow24hRule({ client: stub as never });
    const engine = new AlertEngine(env, [rule]);

    const firstRun = await engine.run("hourly", now);
    expect(firstRun.fired).toBe(1);

    // Reset current TVL so the next evaluation also has a fire-worthy delta.
    // Update the stored snapshot to keep the math symmetric.
    stub.setProtocolTvl("aave-v3", 28_800_000_000);
    await recordTvlSnapshot(
      env,
      "aave-v3",
      now.getTime() - HOUR_MS,
      29_400_000_000,
    );

    // Second evaluation 30 minutes later: still inside the 12h cooldown.
    const later = new Date(now.getTime() + 30 * 60 * 1000);
    const secondRun = await engine.run("hourly", later);
    expect(secondRun.fired).toBe(0);
  });
});

describe("liquidity_normalization rule", () => {
  test("accumulates baseline silently until min samples reached", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    stub.setPool(
      "aave-v3",
      "WETH",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "WETH",
        totalSupplyUsd: 1_000_000_000,
        totalBorrowUsd: 500_000_000,
        tvlUsd: 500_000_000,
      }),
    );

    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createLiquidityNormalizationRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });

  test("fires when value crosses outside the band after baseline is built", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    // Pre-seed enough samples around mean = 500M with low stddev so the
    // band is tight, then have current value blow past it.
    const meanAvailable = 500_000_000;
    const minSamples = MIN_BASELINE_SAMPLES;
    const now = new Date("2026-05-13T12:00:00Z");
    for (let i = 0; i < minSamples; i++) {
      await recordBaselineSample(
        env,
        "liquidity:aave-v3:WETH",
        now.getTime() - (minSamples - i) * 5 * 60 * 1000,
        meanAvailable + (i % 2 === 0 ? -1_000_000 : 1_000_000),
      );
    }

    // Pre-seed KV "latest" with status=inside so the new outside status fires.
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:liquidity_normalization:aave-v3:WETH",
      JSON.stringify({ value: meanAvailable, status: "inside", recordedAt: now.getTime() - 60_000 }),
    );

    // Current available = 1B, well above mean+1.5σ.
    stub.setPool(
      "aave-v3",
      "WETH",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "WETH",
        totalSupplyUsd: 1_500_000_000,
        totalBorrowUsd: 500_000_000,
        tvlUsd: 1_000_000_000,
      }),
    );
    // Set all other watchlist pools so they are skipped cleanly (no pool found).

    const rule = createLiquidityNormalizationRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    const wethEvent = events.find((e) => e.key === "aave-v3:WETH");
    expect(wethEvent).toBeDefined();
    expect(wethEvent!.suggestedTweet).toContain("WETH liquidity on Aave V3");
    expect(wethEvent!.suggestedTweet).not.toContain("—");
    expect(wethEvent!.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(wethEvent!.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("does not fire when value stays inside the band", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    const meanAvailable = 500_000_000;
    const now = new Date("2026-05-13T12:00:00Z");
    for (let i = 0; i < MIN_BASELINE_SAMPLES; i++) {
      await recordBaselineSample(
        env,
        "liquidity:aave-v3:WETH",
        now.getTime() - (MIN_BASELINE_SAMPLES - i) * 5 * 60 * 1000,
        meanAvailable + (i % 2 === 0 ? -2_000_000 : 2_000_000),
      );
    }
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:liquidity_normalization:aave-v3:WETH",
      JSON.stringify({ value: meanAvailable, status: "inside", recordedAt: now.getTime() - 60_000 }),
    );

    stub.setPool(
      "aave-v3",
      "WETH",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "WETH",
        totalSupplyUsd: 1_000_000_000,
        totalBorrowUsd: 500_001_000,
        tvlUsd: 499_999_000,
      }),
    );

    const rule = createLiquidityNormalizationRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events.find((e) => e.key === "aave-v3:WETH")).toBeUndefined();
  });
});
