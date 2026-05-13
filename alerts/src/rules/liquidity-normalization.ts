import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  LIQUIDITY_BAND_STDDEV,
  LIQUIDITY_BASELINE_WINDOW_DAYS,
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

/** Minimum baseline points before the rule is allowed to fire. */
export const MIN_BASELINE_SAMPLES = 24;

type BandStatus = "inside" | "outside-high" | "outside-low";

interface LatestState {
  value: number;
  status: BandStatus;
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
      "Fires when available liquidity for a watchlist market crosses the 7-day mean ± 1.5σ band.",
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
        const metricKey = `liquidity:${entry.protocol}:${entry.asset}`;

        // Record the new sample first, then prune anything outside the
        // window. Re-applying the same (key, sample_at) overwrites.
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
        const prev = await readLatest<LatestState>(ctx.env, "liquidity_normalization", ruleKey);

        await writeLatest<LatestState>(ctx.env, "liquidity_normalization", ruleKey, {
          value: available,
          status,
          recordedAt: nowMs,
        });

        if (!prev) continue;
        if (prev.status === status) continue;

        let direction: "normalized" | "stressed";
        if (prev.status !== "inside" && status === "inside") {
          direction = "normalized";
        } else {
          // inside → outside, or outside-low → outside-high (and vice versa):
          // treat as a stress event in the new direction.
          direction = "stressed";
        }

        const event = buildEvent({
          ctx,
          entry,
          available,
          lo,
          hi,
          mean: stats.mean,
          status,
          direction,
        });
        events.push(event);
      }

      return events;
    },
  };
}

interface BuildEventArgs {
  ctx: AlertContext;
  entry: { protocol: import("../types").Protocol; asset: string; market?: string };
  available: number;
  lo: number;
  hi: number;
  mean: number;
  status: BandStatus;
  direction: "normalized" | "stressed";
}

function buildEvent(args: BuildEventArgs): AlertEvent {
  const { ctx, entry, available, lo, hi, status, direction } = args;
  const protoName = PROTOCOL_DISPLAY_NAME[entry.protocol];
  const handle = PROTOCOL_HANDLE[entry.protocol];
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/protocols?p=${entry.protocol}`;

  // Suggested-tweet copy. Voice rules: no em-dashes, no first-person plural.
  const tweetLines: string[] = [];
  if (direction === "normalized") {
    tweetLines.push(`${entry.asset} liquidity on ${protoName} is back at normal levels.`);
    tweetLines.push("");
    tweetLines.push(`Available: ${formatUsdShort(available)}`);
    tweetLines.push(`7-day band: ${formatUsdShort(lo)} to ${formatUsdShort(hi)}`);
    tweetLines.push("");
    tweetLines.push("Capital that left during the recent stress window is returning.");
  } else {
    const side = status === "outside-high" ? "above" : "below";
    tweetLines.push(`${entry.asset} liquidity on ${protoName} moved ${side} its 7-day band.`);
    tweetLines.push("");
    tweetLines.push(`Available: ${formatUsdShort(available)}`);
    tweetLines.push(`7-day band: ${formatUsdShort(lo)} to ${formatUsdShort(hi)}`);
    tweetLines.push("");
    tweetLines.push("Watch the borrow side: utilization shifts often follow.");
  }
  tweetLines.push("");
  tweetLines.push(dashboardUrl);
  let suggestedTweet = tweetLines.join("\n");
  // Hard guard: tweet must fit in 280 chars. Drop the trailing link line
  // first, then truncate the closing line.
  if (suggestedTweet.length > 280) {
    suggestedTweet = tweetLines.slice(0, -2).join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  const headline =
    direction === "normalized"
      ? `${entry.asset} liquidity on ${protoName} normalized`
      : `${entry.asset} liquidity on ${protoName} moved outside its 7-day band`;
  const body = [
    `Available: ${formatUsdShort(available)}`,
    `7-day band: ${formatUsdShort(lo)} to ${formatUsdShort(hi)}`,
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
      band: { lo, hi, mean: args.mean },
      status,
      direction,
    },
    firedAt: ctx.now,
  };
}
