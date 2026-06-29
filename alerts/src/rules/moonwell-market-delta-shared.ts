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
  fetchMarketDeltaPairs,
  hasMoonwellDb,
} from "../sources/moonwellNeon";
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
  // 2026-06-29 source rewrite. We now read per-market 7d-vs-now data from
  // moonwell-dashboard's Neon `daily_chain_snapshots` (populated every 30
  // min by the dashboard scanner; backfilled 14 days deep before this rule
  // went live). Previous DefiLlama path is dead — it stopped exposing
  // totalSupplyUsd/totalBorrowUsd per pool, leaving the D1 snapshot store
  // with all zeros for 2 weeks of would-be alerts.
  //
  // Falls back to the legacy DefiLlama+D1 path only when the Moonwell DB
  // URL isn't configured (e.g. local preview) so the rule never silently
  // disappears.
  if (!hasMoonwellDb(ctx.env)) {
    return await evaluateMarketDeltaLegacy(ctx, args);
  }

  const events: AlertEvent[] = [];
  let pairs;
  try {
    pairs = await fetchMarketDeltaPairs(ctx.env, 7, 2);
  } catch (e: any) {
    console.warn(`market-delta source read failed, falling back: ${(e?.message ?? "").slice(0, 100)}`);
    return await evaluateMarketDeltaLegacy(ctx, args);
  }

  for (const p of pairs) {
    const chain = normalizeChain(p.chain);
    if (!chain) continue;
    const currentValue = args.field === "supply" ? p.current_supply_usd : p.current_borrow_usd;
    const priorValue   = args.field === "supply" ? p.prior_supply_usd   : p.prior_borrow_usd;
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
        symbol: p.market_symbol,
        priorValue,
        currentValue,
        delta,
        severity,
      }),
    );
  }
  return events;
}

// Legacy path: kept ONLY for environments that don't have MOONWELL_DATABASE_URL
// configured (mainly local-dev / preview). Reads DefiLlama yields per-pool
// `tvlUsd` (supply only — borrow stays 0 because DefiLlama dropped that
// field). Maintains the D1 snapshot store for backwards compat. Production
// no longer touches this branch.
async function evaluateMarketDeltaLegacy(
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
    const minSeededAt = nowMs - MOONWELL_MARKET_DELTA_MIN_SAMPLE_DAYS * 24 * 3600 * 1000;
    if (prior.snapshot_at > minSeededAt) continue;
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
