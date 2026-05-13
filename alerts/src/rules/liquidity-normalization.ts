import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  LIQUIDITY_ABSOLUTE_FLOOR_PCT_OF_MEAN,
  LIQUIDITY_ABSOLUTE_FLOOR_USD,
  LIQUIDITY_BAND_STDDEV,
  LIQUIDITY_BASELINE_WINDOW_DAYS,
  LIQUIDITY_METRIC_KEY_PREFIX,
  LIQUIDITY_NORMALIZE_DURATION_MS,
  LIQUIDITY_NORMALIZE_LOOKBACK_MS,
  LIQUIDITY_RELATIVE_FLOOR_PCT,
  LIQUIDITY_STRESS_CONSECUTIVE_SAMPLES,
  LIQUIDITY_WATCHLIST,
  PROTOCOL_DISPLAY_NAME,
  PROTOCOL_HANDLE,
} from "../config";
import {
  computeBaselineStats,
  pruneBaselineSamples,
  recordBaselineSample,
  upsertRollingBaseline,
} from "../state/d1";
import { readLatest, writeLatest } from "../state/kv";
import { DefiLlamaClient } from "../sources/defillama";
import { formatUsdShort } from "../dispatchers/format";

/**
 * Minimum baseline samples (at 5-min cadence) before the rule may evaluate
 * floors and streaks. 288 samples ≈ 1 day. Below that the 30-day mean is
 * not a meaningful reference.
 */
export const MIN_BASELINE_SAMPLES = 288;

type BandStatus = "inside" | "outside-high" | "outside-low";

interface LiquidityState {
  value: number;
  status: BandStatus;
  /**
   * Count of consecutive samples that have shared the current status. Reset
   * to 1 on every transition (the first sample of a new status counts).
   */
  consecutiveSamples: number;
  /** Unix ms when the current status was first observed. */
  streakStartedAt: number;
  /** Last time a stressed fire dispatched for this (protocol, asset). */
  lastStressedFireAt: number | null;
  /** Last time a normalized fire dispatched for this (protocol, asset). */
  lastNormalizedFireAt: number | null;
  recordedAt: number;
}

export interface LiquidityRuleDeps {
  client?: DefiLlamaClient;
}

export function createLiquidityNormalizationRule(deps: LiquidityRuleDeps = {}): AlertRule {
  return {
    id: "liquidity_normalization",
    name: "Liquidity normalization",
    description:
      "Fires when watchlist liquidity transitions across the 30-day mean ± 1.5σ band with sustained out-of-band evidence and a non-trivial magnitude.",
    schedule: "fast",
    cooldownHours: 6,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new DefiLlamaClient();
      const events: AlertEvent[] = [];
      const nowMs = ctx.now.getTime();
      const windowSinceMs =
        nowMs - LIQUIDITY_BASELINE_WINDOW_DAYS * 24 * 3600 * 1000;

      for (const entry of LIQUIDITY_WATCHLIST) {
        const pool = await client.findPool(entry.protocol, entry.asset);
        if (!pool) {
          console.log(
            `liquidity_normalization: no pool for ${entry.protocol}/${entry.asset}`,
          );
          continue;
        }
        const supply = pool.totalSupplyUsd ?? 0;
        const borrow = pool.totalBorrowUsd ?? 0;
        const available = Math.max(0, supply - borrow);
        const metricKey = `${LIQUIDITY_METRIC_KEY_PREFIX}:${entry.protocol}:${entry.asset}`;

        await recordBaselineSample(ctx.env, metricKey, nowMs, available);
        await pruneBaselineSamples(ctx.env, metricKey, windowSinceMs);

        const stats = await computeBaselineStats(ctx.env, metricKey, windowSinceMs);
        if (stats) {
          await upsertRollingBaseline(
            ctx.env,
            metricKey,
            LIQUIDITY_BASELINE_WINDOW_DAYS,
            stats,
            nowMs,
          );
        }
        if (!stats || stats.sampleCount < MIN_BASELINE_SAMPLES) {
          console.log(
            `liquidity_normalization: ${metricKey} accumulating (${stats?.sampleCount ?? 0}/${MIN_BASELINE_SAMPLES})`,
          );
          continue;
        }

        const lo = stats.mean - LIQUIDITY_BAND_STDDEV * stats.stddev;
        const hi = stats.mean + LIQUIDITY_BAND_STDDEV * stats.stddev;
        const status: BandStatus =
          available > hi ? "outside-high" : available < lo ? "outside-low" : "inside";

        const ruleKey = `${entry.protocol}:${entry.asset}`;
        const prev = await readLatest<LiquidityState>(
          ctx.env,
          "liquidity_normalization",
          ruleKey,
        );

        // Update streak counters relative to prior state. First-ever read
        // starts a streak of 1.
        const nextState: LiquidityState =
          prev && prev.status === status
            ? {
                ...prev,
                value: available,
                consecutiveSamples: prev.consecutiveSamples + 1,
                recordedAt: nowMs,
              }
            : {
                value: available,
                status,
                consecutiveSamples: 1,
                streakStartedAt: nowMs,
                lastStressedFireAt: prev?.lastStressedFireAt ?? null,
                lastNormalizedFireAt: prev?.lastNormalizedFireAt ?? null,
                recordedAt: nowMs,
              };

        const fired = maybeBuildEvent({
          ctx,
          entry,
          available,
          mean: stats.mean,
          lo,
          hi,
          prev,
          state: nextState,
        });
        if (fired) {
          events.push(fired);
          if (fired.data.direction === "stressed") {
            nextState.lastStressedFireAt = nowMs;
          } else {
            nextState.lastNormalizedFireAt = nowMs;
          }
        }

        await writeLatest<LiquidityState>(
          ctx.env,
          "liquidity_normalization",
          ruleKey,
          nextState,
        );
      }

      return events;
    },
  };
}

interface MaybeBuildArgs {
  ctx: AlertContext;
  entry: { protocol: import("../types").Protocol; asset: string; market?: string };
  available: number;
  mean: number;
  lo: number;
  hi: number;
  prev: LiquidityState | null;
  state: LiquidityState;
}

function maybeBuildEvent(args: MaybeBuildArgs): (AlertEvent & {
  data: { direction: "stressed" | "normalized"; [k: string]: unknown };
}) | null {
  const { ctx, entry, available, mean, lo, hi, prev, state } = args;
  if (!prev) return null; // First evaluation seeds state; no fire.

  // Magnitude floors. Reject before considering direction so a quiet day
  // can never breach a tight band and fire.
  const relativeDelta = mean > 0 ? Math.abs(available - mean) / mean : 0;
  if (relativeDelta < LIQUIDITY_RELATIVE_FLOOR_PCT / 100) return null;
  const absoluteFloor = Math.max(
    LIQUIDITY_ABSOLUTE_FLOOR_USD,
    (LIQUIDITY_ABSOLUTE_FLOOR_PCT_OF_MEAN / 100) * mean,
  );
  if (Math.abs(available - prev.value) < absoluteFloor) return null;

  // Stressed: outside the band, 12 consecutive outside samples, not already
  // fired in this same outside streak.
  if (state.status !== "inside") {
    const alreadyFiredInStreak =
      state.lastStressedFireAt != null &&
      state.lastStressedFireAt >= state.streakStartedAt;
    if (
      state.consecutiveSamples >= LIQUIDITY_STRESS_CONSECUTIVE_SAMPLES &&
      !alreadyFiredInStreak
    ) {
      return buildEvent({
        ctx,
        entry,
        available,
        mean,
        lo,
        hi,
        status: state.status,
        direction: "stressed",
      });
    }
    return null;
  }

  // Normalized: inside the band for at least 12 hours of continuous streak,
  // a stressed fire happened in the past 7 days, and we have not already
  // fired the normalize for this re-entry.
  const insideForMs = ctx.now.getTime() - state.streakStartedAt;
  const alreadyFiredInStreak =
    state.lastNormalizedFireAt != null &&
    state.lastNormalizedFireAt >= state.streakStartedAt;
  const priorStressRecent =
    state.lastStressedFireAt != null &&
    ctx.now.getTime() - state.lastStressedFireAt <= LIQUIDITY_NORMALIZE_LOOKBACK_MS;
  if (
    insideForMs >= LIQUIDITY_NORMALIZE_DURATION_MS &&
    !alreadyFiredInStreak &&
    priorStressRecent
  ) {
    return buildEvent({
      ctx,
      entry,
      available,
      mean,
      lo,
      hi,
      status: "inside",
      direction: "normalized",
    });
  }
  return null;
}

interface BuildEventArgs {
  ctx: AlertContext;
  entry: { protocol: import("../types").Protocol; asset: string; market?: string };
  available: number;
  mean: number;
  lo: number;
  hi: number;
  status: BandStatus;
  direction: "stressed" | "normalized";
}

function buildEvent(args: BuildEventArgs): AlertEvent & {
  data: { direction: "stressed" | "normalized"; [k: string]: unknown };
} {
  const { ctx, entry, available, mean, lo, hi, status, direction } = args;
  const protoName = PROTOCOL_DISPLAY_NAME[entry.protocol];
  const handle = PROTOCOL_HANDLE[entry.protocol];
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/protocols?p=${entry.protocol}`;

  const deltaPct = mean > 0 ? ((available - mean) / mean) * 100 : 0;
  const deltaPctAbs = Math.abs(deltaPct);
  const deltaDirection = deltaPct >= 0 ? "above" : "below";

  // Voice rules: no em-dashes, no first-person plural. Lead with the
  // magnitude of the move; the band crossing is supporting evidence.
  const tweetLines: string[] = [];
  if (direction === "normalized") {
    tweetLines.push(
      `${entry.asset} liquidity on ${protoName} is back at normal levels.`,
    );
    tweetLines.push("");
    tweetLines.push(`Available: ${formatUsdShort(available)}`);
    tweetLines.push(`30-day band: ${formatUsdShort(lo)} to ${formatUsdShort(hi)}`);
    tweetLines.push("");
    tweetLines.push("Capital that left during the recent stress window is returning.");
  } else {
    const side = status === "outside-high" ? "above" : "below";
    tweetLines.push(
      `${entry.asset} liquidity on ${protoName} is ${deltaPctAbs.toFixed(0)}% ${deltaDirection} its 30-day mean.`,
    );
    tweetLines.push("");
    tweetLines.push(`Available: ${formatUsdShort(available)} (${side} the band)`);
    tweetLines.push(`30-day band: ${formatUsdShort(lo)} to ${formatUsdShort(hi)}`);
    tweetLines.push("");
    tweetLines.push("Watch the borrow side: utilization shifts often follow.");
  }
  tweetLines.push("");
  tweetLines.push(dashboardUrl);
  let suggestedTweet = tweetLines.join("\n");
  if (suggestedTweet.length > 280) {
    suggestedTweet = tweetLines.slice(0, -2).join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  const headline =
    direction === "normalized"
      ? `${entry.asset} liquidity on ${protoName} normalized`
      : `${entry.asset} liquidity on ${protoName} is ${deltaPctAbs.toFixed(0)}% ${deltaDirection} 30-day mean`;
  const body = [
    `Available: ${formatUsdShort(available)}`,
    `30-day mean: ${formatUsdShort(mean)} (Δ ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`,
    `30-day band: ${formatUsdShort(lo)} to ${formatUsdShort(hi)}`,
    `Direction: ${direction}`,
  ].join("\n");

  return {
    ruleId: "liquidity_normalization",
    key: `${entry.protocol}:${entry.asset}`,
    severity: "NORMAL",
    headline,
    body,
    suggestedTweet,
    suggestedHandle: handle,
    dashboardUrl,
    data: {
      protocol: entry.protocol,
      asset: entry.asset,
      available,
      band: { lo, hi, mean },
      status,
      direction,
      deltaPct,
    },
    firedAt: ctx.now,
  };
}
