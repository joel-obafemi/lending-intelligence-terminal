import { describe, expect, test } from "vitest";
import { FakeD1, FakeKV, makeEnv } from "./mocks";
import { createNetFlow24hRule } from "../src/rules/net-flow-24h";
import {
  MIN_BASELINE_SAMPLES,
  createLiquidityNormalizationRule,
} from "../src/rules/liquidity-normalization";
import { createUtilizationRateKinkRule } from "../src/rules/utilization-rate-kink";
import {
  MIN_DISPERSION_SAMPLES,
  createApyDispersionBlowoutRule,
} from "../src/rules/apy-dispersion-blowout";
import { createRealYieldSpreadRegimeRule } from "../src/rules/real-yield-spread-regime";
import { createLiquidationCascadeRule } from "../src/rules/liquidation-cascade";
import { createMorphoCuratorHhiRule } from "../src/rules/morpho-curator-hhi";
import { buildDailyDigest } from "../src/dispatchers/email";
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
  public poolsByKey = new Map<string, YieldPool[]>();
  public blendedByKey = new Map<
    string,
    { apyPct: number; weightUsd: number } | null
  >();

  setPool(protocol: string, asset: string, pool: YieldPool) {
    this.poolsByKey.set(`${protocol}:${asset}`, [pool]);
  }

  setPools(protocol: string, asset: string, pools: YieldPool[]) {
    this.poolsByKey.set(`${protocol}:${asset}`, pools);
  }

  setBlended(
    protocol: string,
    asset: string,
    value: { apyPct: number; weightUsd: number } | null,
  ) {
    this.blendedByKey.set(`${protocol}:${asset}`, value);
  }

  setProtocolTvl(protocol: string, tvl: number) {
    this.protocolTvlByProtocol.set(protocol, tvl);
  }

  async findPool(protocol: string, asset: string): Promise<YieldPool | null> {
    return this.poolsByKey.get(`${protocol}:${asset}`)?.[0] ?? null;
  }

  async findPools(protocol: string, asset: string): Promise<YieldPool[]> {
    return this.poolsByKey.get(`${protocol}:${asset}`) ?? [];
  }

  async blendedSupplyApyPct(
    protocol: string,
    asset: string,
  ): Promise<{ apyPct: number; weightUsd: number } | null> {
    return this.blendedByKey.get(`${protocol}:${asset}`) ?? null;
  }

  async getProtocolTvlUsd(protocol: string): Promise<number | null> {
    return this.protocolTvlByProtocol.get(protocol) ?? null;
  }

  async getEthereumYieldPools(): Promise<YieldPool[]> {
    return [...this.poolsByKey.values()].flat();
  }
}

class StubFredClient {
  public tBill: number | null = null;
  async fetchTBill4wk(): Promise<number | null> {
    return this.tBill;
  }
  async fetchLatest(): Promise<number | null> {
    return this.tBill;
  }
  async fetchSeries(): Promise<{ timestampMs: number; rate: number }[]> {
    return this.tBill == null ? [] : [{ timestampMs: Date.now(), rate: this.tBill }];
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

describe("utilization_rate_kink rule", () => {
  test("does not fire on first evaluation (no prior to compare against)", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    // 80% utilization on Aave V3 USDC.
    stub.setPool(
      "aave-v3",
      "USDC",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "USDC",
        totalSupplyUsd: 1_000_000_000,
        totalBorrowUsd: 800_000_000,
        apyBase: 3.5,
        apyBaseBorrow: 4.4,
      }),
    );
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createUtilizationRateKinkRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events.find((e) => e.key.startsWith("aave-v3:USDC"))).toBeUndefined();
  });

  test("fires WARNING when utilization crosses 90% from below", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    const kv = env.ALERTS_KV as unknown as FakeKV;
    // Prior: 85%. New: 92%. Should cross 90, not 95.
    await kv.put(
      "latest:utilization_rate_kink:aave-v3:USDC",
      JSON.stringify({ utilPct: 85, recordedAt: Date.now() - 60_000 }),
    );
    stub.setPool(
      "aave-v3",
      "USDC",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "USDC",
        totalSupplyUsd: 1_000_000_000,
        totalBorrowUsd: 920_000_000,
        apyBase: 4.2,
        apyBaseBorrow: 5.5,
      }),
    );
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createUtilizationRateKinkRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    const fire = events.find((e) => e.key === "aave-v3:USDC:90");
    expect(fire).toBeDefined();
    expect(fire!.severity).toBe("WARNING");
    expect(fire!.suggestedTweet).toContain("90%");
    expect(fire!.suggestedTweet).not.toContain("—");
    expect(fire!.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(fire!.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("fires CRITICAL when utilization jumps past 95%", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:utilization_rate_kink:aave-v3:USDC",
      JSON.stringify({ utilPct: 89, recordedAt: Date.now() - 60_000 }),
    );
    stub.setPool(
      "aave-v3",
      "USDC",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "USDC",
        totalSupplyUsd: 1_000_000_000,
        totalBorrowUsd: 970_000_000,
      }),
    );
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createUtilizationRateKinkRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    const fire = events.find((e) => e.key === "aave-v3:USDC:95");
    expect(fire).toBeDefined();
    expect(fire!.severity).toBe("CRITICAL");
  });

  test("does not fire when utilization stays above threshold without re-crossing", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    const kv = env.ALERTS_KV as unknown as FakeKV;
    // Was already at 93%. Now at 94%. No new crossing.
    await kv.put(
      "latest:utilization_rate_kink:aave-v3:USDC",
      JSON.stringify({ utilPct: 93, recordedAt: Date.now() - 60_000 }),
    );
    stub.setPool(
      "aave-v3",
      "USDC",
      fakeYieldPool({
        project: "aave-v3",
        symbol: "USDC",
        totalSupplyUsd: 1_000_000_000,
        totalBorrowUsd: 940_000_000,
      }),
    );
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createUtilizationRateKinkRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events.find((e) => e.key.startsWith("aave-v3:USDC"))).toBeUndefined();
  });
});

describe("apy_dispersion_blowout rule", () => {
  test("accumulates baseline silently until min samples reached", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    stub.setBlended("aave-v3", "USDC", { apyPct: 4, weightUsd: 1_000_000_000 });
    stub.setBlended("spark", "USDC", { apyPct: 4.2, weightUsd: 800_000_000 });
    stub.setBlended("fluid", "USDC", { apyPct: 5, weightUsd: 200_000_000 });
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createApyDispersionBlowoutRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });

  test("fires when dispersion exceeds mean + 2 stddev", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    // Cross-protocol: 8% high, 4% low → 400 bps current dispersion.
    stub.setBlended("aave-v3", "USDC", { apyPct: 4.0, weightUsd: 1_000_000_000 });
    stub.setBlended("spark", "USDC", { apyPct: 4.5, weightUsd: 800_000_000 });
    stub.setBlended("fluid", "USDC", { apyPct: 8.0, weightUsd: 200_000_000 });

    // Baseline: 72 samples around 50 bps (mean 50, low stddev).
    const now = new Date("2026-05-13T12:00:00Z");
    for (let i = 0; i < MIN_DISPERSION_SAMPLES; i++) {
      await recordBaselineSample(
        env,
        "dispersion:USDC",
        now.getTime() - (MIN_DISPERSION_SAMPLES - i) * 60 * 60 * 1000,
        50 + (i % 2 === 0 ? -2 : 2),
      );
    }
    const rule = createApyDispersionBlowoutRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    const fire = events.find((e) => e.key === "USDC");
    expect(fire).toBeDefined();
    expect(fire!.severity).toBe("NORMAL");
    expect(fire!.suggestedTweet).toContain("USDC");
    expect(fire!.suggestedTweet).not.toContain("—");
    expect(fire!.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(fire!.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("does not fire when dispersion is within the band", async () => {
    const env = makeEnv();
    const stub = new StubDefiLlamaClient();
    stub.setBlended("aave-v3", "USDC", { apyPct: 4.4, weightUsd: 1_000_000_000 });
    stub.setBlended("spark", "USDC", { apyPct: 4.5, weightUsd: 800_000_000 });
    stub.setBlended("fluid", "USDC", { apyPct: 4.7, weightUsd: 200_000_000 });

    const now = new Date("2026-05-13T12:00:00Z");
    for (let i = 0; i < MIN_DISPERSION_SAMPLES; i++) {
      await recordBaselineSample(
        env,
        "dispersion:USDC",
        now.getTime() - (MIN_DISPERSION_SAMPLES - i) * 60 * 60 * 1000,
        50 + (i % 2 === 0 ? -10 : 10),
      );
    }
    const rule = createApyDispersionBlowoutRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events.find((e) => e.key === "USDC")).toBeUndefined();
  });
});

describe("real_yield_spread_regime rule", () => {
  test("seeds baseline silently on first evaluation", async () => {
    const env = makeEnv();
    const defi = new StubDefiLlamaClient();
    const fred = new StubFredClient();
    fred.tBill = 4.0;
    defi.setBlended("aave-v3", "USDC", { apyPct: 6.0, weightUsd: 1_000_000_000 });
    defi.setBlended("spark", "USDC", { apyPct: 5.5, weightUsd: 800_000_000 });
    defi.setBlended("fluid", "USDC", { apyPct: 7.0, weightUsd: 200_000_000 });
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createRealYieldSpreadRegimeRule({
      defiLlama: defi as never,
      fred: fred as never,
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });

  test("fires CRITICAL when spread crosses zero", async () => {
    const env = makeEnv();
    const defi = new StubDefiLlamaClient();
    const fred = new StubFredClient();
    fred.tBill = 5.0;
    // Blended APY = 5.5 → spread = +50 bps.
    defi.setBlended("aave-v3", "USDC", { apyPct: 5.5, weightUsd: 1_000_000_000 });

    const now = new Date("2026-05-13T12:00:00Z");
    const kv = env.ALERTS_KV as unknown as FakeKV;
    // Prior spread was -75 bps. New spread +50 bps → zero-cross.
    await kv.put(
      "latest:real_yield_spread_regime:global",
      JSON.stringify({
        spreadBps: -75,
        blendedApyPct: 4.25,
        tBillPct: 5.0,
        recordedAt: now.getTime() - 2 * 3600 * 1000,
      }),
    );

    const rule = createRealYieldSpreadRegimeRule({
      defiLlama: defi as never,
      fred: fred as never,
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    expect(events[0]!.severity).toBe("CRITICAL");
    expect(events[0]!.suggestedTweet).toContain("parity");
    expect(events[0]!.suggestedTweet).not.toContain("—");
    expect(events[0]!.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(events[0]!.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("fires NORMAL on a rapid 24h move without zero cross", async () => {
    const env = makeEnv();
    const defi = new StubDefiLlamaClient();
    const fred = new StubFredClient();
    fred.tBill = 4.0;
    defi.setBlended("aave-v3", "USDC", { apyPct: 5.5, weightUsd: 1_000_000_000 });
    // New spread +150 bps. Prior +50 bps. Same sign, |Δ| = 100 bps > 25.
    const now = new Date("2026-05-13T12:00:00Z");
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:real_yield_spread_regime:global",
      JSON.stringify({
        spreadBps: 50,
        blendedApyPct: 4.5,
        tBillPct: 4.0,
        recordedAt: now.getTime() - 3 * 3600 * 1000,
      }),
    );
    const rule = createRealYieldSpreadRegimeRule({
      defiLlama: defi as never,
      fred: fred as never,
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    expect(events[0]!.severity).toBe("NORMAL");
  });

  test("does not fire on a small move with same sign", async () => {
    const env = makeEnv();
    const defi = new StubDefiLlamaClient();
    const fred = new StubFredClient();
    fred.tBill = 4.0;
    defi.setBlended("aave-v3", "USDC", { apyPct: 4.6, weightUsd: 1_000_000_000 });
    // New spread +60 bps. Prior +50. Δ = 10 bps.
    const now = new Date("2026-05-13T12:00:00Z");
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:real_yield_spread_regime:global",
      JSON.stringify({
        spreadBps: 50,
        blendedApyPct: 4.5,
        tBillPct: 4.0,
        recordedAt: now.getTime() - 3 * 3600 * 1000,
      }),
    );
    const rule = createRealYieldSpreadRegimeRule({
      defiLlama: defi as never,
      fred: fred as never,
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });
});

describe("liquidation_cascade rule", () => {
  test("does not fire below thresholds", async () => {
    const env = makeEnv({ LIQUIDATOR_DATABASE_URL: "postgres://stub" });
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createLiquidationCascadeRule({
      fetchVolumes: async () => [
        { protocol: "aave_v3", count: 200, volumeUsd: 60_000_000 },
        { protocol: "spark", count: 30, volumeUsd: 5_000_000 },
        { protocol: "morpho_blue", count: 50, volumeUsd: 20_000_000 },
        { protocol: "fluid", count: 80, volumeUsd: 10_000_000 },
      ],
      fetchLargest: async () => new Map(),
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });

  test("fires WARNING when volume crosses per-protocol threshold", async () => {
    const env = makeEnv({ LIQUIDATOR_DATABASE_URL: "postgres://stub" });
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createLiquidationCascadeRule({
      fetchVolumes: async () => [
        { protocol: "aave_v3", count: 612, volumeUsd: 140_000_000 },
      ],
      fetchLargest: async () =>
        new Map([
          ["aave_v3", { protocol: "aave_v3", collateral_symbol: "WBTC", debt_amount_usd: 38_000_000 }],
        ]),
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    const fire = events[0]!;
    expect(fire.severity).toBe("WARNING");
    expect(fire.key).toBe("aave-v3");
    expect(fire.suggestedTweet).toContain("Aave V3");
    expect(fire.suggestedTweet).toContain("$140M");
    expect(fire.suggestedTweet).not.toContain("—");
    expect(fire.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(fire.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("fires CRITICAL when volume exceeds 2x threshold", async () => {
    const env = makeEnv({ LIQUIDATOR_DATABASE_URL: "postgres://stub" });
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createLiquidationCascadeRule({
      fetchVolumes: async () => [
        { protocol: "fluid", count: 700, volumeUsd: 80_000_000 },
      ],
      fetchLargest: async () => new Map(),
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    expect(events[0]!.severity).toBe("CRITICAL");
  });

  test("skips when LIQUIDATOR_DATABASE_URL is not configured", async () => {
    const env = makeEnv();
    const now = new Date("2026-05-13T12:00:00Z");
    const rule = createLiquidationCascadeRule({
      fetchVolumes: async () => [
        { protocol: "aave_v3", count: 612, volumeUsd: 140_000_000 },
      ],
      fetchLargest: async () => new Map(),
    });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });
});

class StubMorphoClient {
  public result = {
    hhi: 0,
    totalAssetsUsd: 0,
    vaultCount: 0,
    curators: [] as Array<{ name: string; totalAssetsUsd: number; sharePct: number }>,
  };
  async getCuratorHhi() {
    return this.result;
  }
}

describe("morpho_curator_hhi rule", () => {
  test("seeds baseline silently on first evaluation", async () => {
    const env = makeEnv();
    const stub = new StubMorphoClient();
    stub.result = {
      hhi: 2200,
      totalAssetsUsd: 5_000_000_000,
      vaultCount: 80,
      curators: [
        { name: "Steakhouse", totalAssetsUsd: 1_900_000_000, sharePct: 38 },
        { name: "Gauntlet", totalAssetsUsd: 1_000_000_000, sharePct: 20 },
        { name: "Re7", totalAssetsUsd: 500_000_000, sharePct: 10 },
      ],
    };
    const now = new Date("2026-05-13T00:00:00Z");
    const rule = createMorphoCuratorHhiRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });

  test("fires WARNING on a 2500 HHI threshold crossing", async () => {
    const env = makeEnv();
    const stub = new StubMorphoClient();
    stub.result = {
      hhi: 2620,
      totalAssetsUsd: 5_000_000_000,
      vaultCount: 80,
      curators: [
        { name: "Steakhouse", totalAssetsUsd: 2_300_000_000, sharePct: 46 },
        { name: "Gauntlet", totalAssetsUsd: 800_000_000, sharePct: 16 },
        { name: "Re7", totalAssetsUsd: 500_000_000, sharePct: 10 },
      ],
    };

    const now = new Date("2026-05-13T00:00:00Z");
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:morpho_curator_hhi:global",
      JSON.stringify({
        hhi: 2400,
        top3CombinedPct: 72,
        top1Name: "Steakhouse",
        top1Pct: 44,
        recordedAt: now.getTime() - 86400_000,
      }),
    );
    const rule = createMorphoCuratorHhiRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toHaveLength(1);
    const fire = events[0]!;
    expect(fire.severity).toBe("WARNING");
    expect(fire.suggestedTweet).toContain("HHI");
    expect(fire.suggestedTweet).toContain("2,500");
    expect(fire.suggestedTweet).not.toContain("—");
    expect(fire.suggestedTweet).not.toMatch(/\bwe\b|\bour\b/i);
    expect(fire.suggestedTweet.length).toBeLessThanOrEqual(280);
  });

  test("does not fire when HHI stays inside the band", async () => {
    const env = makeEnv();
    const stub = new StubMorphoClient();
    stub.result = {
      hhi: 2420,
      totalAssetsUsd: 5_000_000_000,
      vaultCount: 80,
      curators: [
        { name: "Steakhouse", totalAssetsUsd: 1_900_000_000, sharePct: 38 },
        { name: "Gauntlet", totalAssetsUsd: 1_000_000_000, sharePct: 20 },
        { name: "Re7", totalAssetsUsd: 500_000_000, sharePct: 10 },
      ],
    };
    const now = new Date("2026-05-13T00:00:00Z");
    const kv = env.ALERTS_KV as unknown as FakeKV;
    await kv.put(
      "latest:morpho_curator_hhi:global",
      JSON.stringify({
        hhi: 2400,
        top3CombinedPct: 68.2,
        top1Name: "Steakhouse",
        top1Pct: 38,
        recordedAt: now.getTime() - 86400_000,
      }),
    );
    const rule = createMorphoCuratorHhiRule({ client: stub as never });
    const events = await rule.evaluate({ env, now, fetchedAt: now });
    expect(events).toEqual([]);
  });
});

describe("daily digest builder", () => {
  test("groups alerts by severity (CRITICAL first), single subject line", () => {
    const now = new Date("2026-05-13T00:00:00Z").getTime();
    const digest = buildDailyDigest({
      alerts: [
        {
          rule_id: "net_flow_24h",
          alert_key: "aave-v3",
          severity: "CRITICAL",
          headline: "Aave V3 24h net outflow: $2.3B",
          body: "Prior TVL: $30B\nCurrent TVL: $27.7B",
          suggested_tweet: "Aave V3 just saw $2.30B in net outflow over 24 hours.",
          dashboard_url: "https://datumlabs.xyz/lending-terminal/protocols?p=aave-v3",
          fired_at: now - 3_600_000,
        },
        {
          rule_id: "utilization_rate_kink",
          alert_key: "aave-v3:USDC:90",
          severity: "WARNING",
          headline: "USDC utilization on Aave V3 crossed 90%",
          body: "Utilization: 91.42%",
          suggested_tweet: "USDC utilization on Aave V3 just crossed 90%.",
          dashboard_url: null,
          fired_at: now - 6_400_000,
        },
        {
          rule_id: "apy_dispersion_blowout",
          alert_key: "USDC",
          severity: "NORMAL",
          headline: "USDC APY dispersion: 850 bps (3.5x baseline)",
          body: "Dispersion: 850 bps",
          suggested_tweet: "USDC supply APY dispersion just hit 850 bps.",
          dashboard_url: null,
          fired_at: now - 8_400_000,
        },
      ],
      windowEndMs: now,
      dashboardBaseUrl: "https://datumlabs.xyz/lending-terminal",
    });
    expect(digest.subject).toBe("DatumLabs Alerts · 3 events · 2026-05-13");
    expect(digest.alertCount).toBe(3);
    // Severity ordering enforced in the HTML and text payloads.
    const criticalIdx = digest.text.indexOf("CRITICAL (1)");
    const warningIdx = digest.text.indexOf("WARNING (1)");
    const normalIdx = digest.text.indexOf("NORMAL (1)");
    expect(criticalIdx).toBeGreaterThan(-1);
    expect(criticalIdx).toBeLessThan(warningIdx);
    expect(warningIdx).toBeLessThan(normalIdx);
    expect(digest.html).toContain("Aave V3 24h net outflow");
    expect(digest.text).toContain("Aave V3 24h net outflow");
    expect(digest.text).not.toContain("—");
    expect(digest.text).not.toMatch(/\bwe\b|\bour\b/i);
  });

  test("empty alert list still produces a valid digest", () => {
    const now = Date.now();
    const digest = buildDailyDigest({
      alerts: [],
      windowEndMs: now,
      dashboardBaseUrl: "https://datumlabs.xyz/lending-terminal",
    });
    expect(digest.alertCount).toBe(0);
    expect(digest.subject).toContain("0 events");
    expect(digest.html).toContain("No alerts fired");
  });
});
