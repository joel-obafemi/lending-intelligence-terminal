import type { AlertContext, AlertEvent, AlertRule, Severity } from "../types";
import {
  MOONWELL_CHAIN_DISPLAY,
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_LIQ_WHALE_CRITICAL_USD,
  MOONWELL_LIQ_WHALE_NORMAL_USD,
  type MoonwellChain,
} from "../config";
import {
  fetchRecentLargeLiquidations,
  hasMoonwellDb,
  type LiquidationEventRow,
} from "../sources/moonwellNeon";
import { fmtUsdCompact, moonwellUrl, trimTweet } from "./moonwell-helpers";

// Look back this far on each fast-tick run. Cron is every 5 minutes, so
// 30 minutes covers a small jitter band without re-fetching all-time.
const LOOKBACK_SECONDS = 30 * 60;

export function createMoonwellLiquidationWhaleRule(): AlertRule {
  return {
    id: "moonwell_liquidation_whale",
    name: "Moonwell whale liquidation",
    description: `Fires per-tx when a single Moonwell liquidation seizes ≥${fmtUsdCompact(
      MOONWELL_LIQ_WHALE_NORMAL_USD,
    )} of collateral. CRITICAL above ${fmtUsdCompact(MOONWELL_LIQ_WHALE_CRITICAL_USD)}.`,
    schedule: "fast",
    // Each fire is keyed by tx_hash so the cooldown is functionally one-shot;
    // 168h backstop in case the dedupe table ever drops a key.
    cooldownHours: 168,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasMoonwellDb(ctx.env)) return [];
      const nowSeconds = Math.floor(ctx.now.getTime() / 1000);
      const rows = await fetchRecentLargeLiquidations(
        ctx.env,
        nowSeconds,
        LOOKBACK_SECONDS,
        MOONWELL_LIQ_WHALE_NORMAL_USD,
      );
      return rows.map((r) => buildEvent(ctx, r));
    },
  };
}

function buildEvent(ctx: AlertContext, row: LiquidationEventRow): AlertEvent {
  const chainDisplay =
    MOONWELL_CHAIN_DISPLAY[row.chain as MoonwellChain] ?? row.chain;
  const seizedUsd = row.collateral_seized_usd;
  const severity: Severity =
    seizedUsd >= MOONWELL_LIQ_WHALE_CRITICAL_USD ? "CRITICAL" : "NORMAL";
  const dashboardUrl = moonwellUrl(ctx.env, "/liquidations");

  const headline = `${MOONWELL_DISPLAY_NAME} ${chainDisplay} whale liquidation: ${fmtUsdCompact(seizedUsd)}`;
  const body = [
    `Tx:        ${row.tx_hash}`,
    `Chain:     ${chainDisplay}`,
    `Collateral: ${row.collateral_symbol} (${fmtUsdCompact(seizedUsd)})`,
    `Debt:      ${row.debt_symbol} (${fmtUsdCompact(row.debt_repaid_usd)})`,
    `Borrower:  ${row.borrower}`,
    `Liquidator: ${row.liquidator}`,
  ].join("\n");

  const tweet = trimTweet([
    `${MOONWELL_DISPLAY_NAME} on ${chainDisplay}: ${fmtUsdCompact(seizedUsd)} liquidation just hit. ${row.collateral_symbol} collateral seized vs ${row.debt_symbol} debt.`,
    ``,
    dashboardUrl,
  ]);

  return {
    ruleId: "moonwell_liquidation_whale",
    key: row.tx_hash,
    severity,
    headline,
    body,
    suggestedTweet: tweet,
    suggestedHandle: MOONWELL_HANDLE,
    dashboardUrl,
    data: {
      tx_hash: row.tx_hash,
      block_number: row.block_number,
      timestamp: row.timestamp,
      chain: row.chain,
      debt_symbol: row.debt_symbol,
      collateral_symbol: row.collateral_symbol,
      debt_repaid_usd: row.debt_repaid_usd,
      collateral_seized_usd: row.collateral_seized_usd,
      borrower: row.borrower,
      liquidator: row.liquidator,
    },
    firedAt: ctx.now,
  };
}
