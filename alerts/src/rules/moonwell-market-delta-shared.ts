/**
 * Shared evaluator for the per-market 7-day Δ rules. Supply and borrow Δs
 * are different metrics with the same shape, so the rule files just call
 * `evaluateMarketDelta` with a `field` selector and the rule's id/handle
 * specifics. Keeps the snapshot-recording logic in one place — neither
 * supply nor borrow self-seeds without the other.
 */

import type { AlertContext, AlertEvent, Severity } from "../types";
import {
  MOONWELL_CHAIN_DISPLAY,
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_MARKET_DELTA_CRITICAL_PCT,
  MOONWELL_MARKET_DELTA_MIN_SAMPLE_DAYS,
  MOONWELL_MARKET_DELTA_NORMAL_PCT,
  type MoonwellChain,
} from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import {
  findMarketSnapshotAtOrBefore,
  recordMarketSnapshot,
} from "../state/moonwell-d1";
import {
  fmtPct,
  fmtTokenCompact,
  fmtUsdCompact,
  moonwellUrl,
  pctChange,
  trimTweet,
} from "./moonwell-helpers";

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const SNAPSHOT_TOLERANCE_MS = 36 * 3600 * 1000;

interface EvaluatorArgs {
  ruleId: string;
  field: "supply" | "borrow";
  client?: MoonwellDefiLlamaClient;
}

export async function evaluateMarketDelta(
  ctx: AlertContext,
  args: EvaluatorArgs,
): Promise<AlertEvent[]> {
  const client = args.client ?? new MoonwellDefiLlamaClient();
  const pools = await client.getLendingPools();
  if (pools.length === 0) return [];

  const nowMs = ctx.now.getTime();
  const events: AlertEvent[] = [];

  for (const pool of pools) {
    const chain = normalizeChain(pool.chain);
    if (!chain) continue;
    // 2026-06-29 source fix: DefiLlama's yields API no longer exposes
    // totalSupplyUsd / totalBorrowUsd per pool (only `tvlUsd` is left).
    // Snapshots had been recording 0/0 for every market for ~2 weeks,
    // so the 7d Δ alerts never fired. Use `tvlUsd` as the supply proxy
    // (for lending protocols net deposits ≈ TVL — close enough for the
    // 10% Δ headline). Borrow stays at 0 until we wire a per-market
    // on-chain or dashboard-Neon source for it; the borrow rule's
    // `delta === null` short-circuit then prevents bogus 0% / inf%
    // alerts when both prior and current are 0.
    const supplyUsd = Number.isFinite(pool.tvlUsd) ? pool.tvlUsd : 0;
    const borrowUsd =
      pool.totalBorrowUsd != null && Number.isFinite(pool.totalBorrowUsd)
        ? pool.totalBorrowUsd
        : 0;

    await recordMarketSnapshot(ctx.env, {
      chain,
      market_symbol: pool.symbol,
      snapshot_at: nowMs,
      total_supply: supplyUsd,
      total_borrow: borrowUsd,
      supply_usd: supplyUsd,
      borrow_usd: borrowUsd,
    });

    const cutoff = nowMs - SEVEN_DAYS_MS;
    const prior = await findMarketSnapshotAtOrBefore(ctx.env, chain, pool.symbol, cutoff);
    if (!prior) continue;
    // Reject too-fresh comparison points so we don't fire 3 days in.
    const minSeededAt = nowMs - MOONWELL_MARKET_DELTA_MIN_SAMPLE_DAYS * 24 * 3600 * 1000;
    if (prior.snapshot_at > minSeededAt) continue;
    // Reject very stale priors — we want ≈7d, not 30d.
    if (prior.snapshot_at < cutoff - SNAPSHOT_TOLERANCE_MS) continue;

    const currentValue = args.field === "supply" ? supplyUsd : borrowUsd;
    const priorValue =
      args.field === "supply" ? prior.supply_usd : prior.borrow_usd;
    const delta = pctChange(priorValue, currentValue);
    if (delta === null) continue;
    if (Math.abs(delta) < MOONWELL_MARKET_DELTA_NORMAL_PCT) continue;

    const severity: Severity =
      Math.abs(delta) >= MOONWELL_MARKET_DELTA_CRITICAL_PCT ? "CRITICAL" : "NORMAL";
    events.push(
      buildEvent(ctx, {
        ruleId: args.ruleId,
        field: args.field,
        chain,
        symbol: pool.symbol,
        priorValue,
        currentValue,
        delta,
        severity,
      }),
    );
  }
  return events;
}

interface BuildArgs {
  ruleId: string;
  field: "supply" | "borrow";
  chain: MoonwellChain;
  symbol: string;
  priorValue: number;
  currentValue: number;
  delta: number;
  severity: Severity;
}

function buildEvent(ctx: AlertContext, args: BuildArgs): AlertEvent {
  const chainDisplay = MOONWELL_CHAIN_DISPLAY[args.chain];
  const noun = args.field === "supply" ? "supply" : "borrows";
  const direction = args.delta >= 0 ? "up" : "down";
  const dashboardUrl = moonwellUrl(ctx.env, "/markets");

  const headline = `${args.symbol} ${noun} on ${chainDisplay} ${direction} ${fmtPct(args.delta)} in 7d`;
  const body = [
    `Chain: ${chainDisplay}`,
    `Market: ${args.symbol}`,
    `Prior (7d): ${fmtUsdCompact(args.priorValue)}`,
    `Now:        ${fmtUsdCompact(args.currentValue)}`,
    `Δ:          ${fmtPct(args.delta, 1)}`,
  ].join("\n");

  const priorTokens = fmtTokenCompact(args.priorValue);
  const nowTokens = fmtTokenCompact(args.currentValue);

  const tweet = trimTweet([
    `${MOONWELL_DISPLAY_NAME} on ${chainDisplay}: ${args.symbol} ${noun} ${direction} ${fmtPct(args.delta)} this week (${priorTokens} -> ${nowTokens} USD).`,
    ``,
    dashboardUrl,
  ]);

  return {
    ruleId: args.ruleId,
    key: `${args.chain}:${args.symbol}`,
    severity: args.severity,
    headline,
    body,
    suggestedTweet: tweet,
    suggestedHandle: MOONWELL_HANDLE,
    dashboardUrl,
    data: {
      chain: args.chain,
      symbol: args.symbol,
      field: args.field,
      priorValue: args.priorValue,
      currentValue: args.currentValue,
      deltaPct: args.delta,
    },
    firedAt: ctx.now,
  };
}

function normalizeChain(chain: string): MoonwellChain | null {
  const lower = chain.toLowerCase();
  if (lower === "base") return "base";
  if (lower === "optimism") return "optimism";
  if (lower === "ethereum") return "ethereum";
  return null;
}
