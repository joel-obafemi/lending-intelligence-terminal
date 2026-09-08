import type { AlertContext, AlertEvent, AlertRule, Protocol, Severity } from "../types";
import {
  LIQUIDATOR_DB_SLUG,
  PROTOCOL_DISPLAY_NAME,
  PROTOCOL_HANDLE,
} from "../config";
import { fetchWhaleEvents, hasLiquidatorDb, type WhaleLiquidationRow } from "../sources/neon";
import { formatUsdShort } from "../dispatchers/format";

const WHALE_THRESHOLD_USD = 1_000_000;
const CRITICAL_THRESHOLD_USD = 10_000_000;

export interface WhaleLiquidationDeps {
  fetchWhales?: (env: import("../types").Env, sinceSec: number, minUsd: number) => Promise<WhaleLiquidationRow[]>;
}

export function createWhaleLiquidationRule(
  deps: WhaleLiquidationDeps = {},
): AlertRule {
  return {
    id: "whale_liquidation",
    name: "Whale liquidation",
    description:
      "Fires when a single liquidation event has collateral seized > $1M. CRITICAL at $10M+.",
    schedule: "fast",
    cooldownHours: 1,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasLiquidatorDb(ctx.env)) return [];

      const fetchWhales = deps.fetchWhales ?? fetchWhaleEvents;
      // Look back 10 minutes (fast schedule runs every 5 min, 2x buffer)
      const sinceSec = Math.floor(ctx.now.getTime() / 1000) - 600;
      const rows = await fetchWhales(ctx.env, sinceSec, WHALE_THRESHOLD_USD);

      const dbSlugToProtocol = invertSlugMap();
      const events: AlertEvent[] = [];

      for (const row of rows) {
        const protocol = dbSlugToProtocol[row.protocol] as Protocol | undefined;
        const proto = protocol ? PROTOCOL_DISPLAY_NAME[protocol] : row.protocol;
        const handle = protocol ? PROTOCOL_HANDLE[protocol] : "";
        const severity: Severity = row.collateral_amount_usd >= CRITICAL_THRESHOLD_USD ? "CRITICAL" : "WARNING";

        const collUsd = formatUsdShort(row.collateral_amount_usd);
        const debtUsd = formatUsdShort(row.debt_amount_usd);
        const profitUsd = formatUsdShort(row.gross_profit_usd);
        const pair = `${row.collateral_symbol}/${row.debt_symbol}`;
        const dashboardUrl = "https://datumlab.xyz/liquidator-economy";

        const headline = `${proto}: ${collUsd} ${pair} liquidation`;

        const body = [
          `Collateral seized: ${collUsd}`,
          `Debt repaid: ${debtUsd}`,
          `Liquidator profit: ${profitUsd}`,
          `Pair: ${pair}`,
          `Liquidator: ${row.liquidator.slice(0, 10)}...`,
          `Borrower: ${row.borrower.slice(0, 10)}...`,
        ].join("\n");

        // Voice rules: no em-dashes, no first-person plural.
        const tweetLines = [
          severity === "CRITICAL"
            ? `🚨 ${collUsd} ${pair} position liquidated on ${proto}.`
            : `⚠️ ${collUsd} ${pair} liquidation on ${proto}.`,
          "",
          `Debt repaid: ${debtUsd}`,
          `Liquidator profit: ${profitUsd}`,
          "",
          row.collateral_amount_usd >= 5_000_000
            ? "At this scale, secondary price impact and cascading risk are worth monitoring."
            : "Watch for follow-through liquidations on the same collateral type.",
          "",
          dashboardUrl,
        ];
        let suggestedTweet = tweetLines.join("\n");
        if (suggestedTweet.length > 280) {
          suggestedTweet = [
            severity === "CRITICAL"
              ? `🚨 ${collUsd} ${pair} liquidated on ${proto}.`
              : `⚠️ ${collUsd} ${pair} liquidated on ${proto}.`,
            `Debt: ${debtUsd} | Profit: ${profitUsd}`,
            dashboardUrl,
          ].join("\n");
        }
        if (suggestedTweet.length > 280) suggestedTweet = suggestedTweet.slice(0, 277) + "...";

        events.push({
          ruleId: "whale_liquidation",
          key: row.tx_hash.slice(0, 16),
          severity,
          headline,
          body,
          suggestedTweet,
          suggestedHandle: handle || undefined,
          dashboardUrl,
          data: {
            tx_hash: row.tx_hash,
            protocol: row.protocol,
            collateral_symbol: row.collateral_symbol,
            debt_symbol: row.debt_symbol,
            collateral_amount_usd: row.collateral_amount_usd,
            debt_amount_usd: row.debt_amount_usd,
            gross_profit_usd: row.gross_profit_usd,
          },
          firedAt: ctx.now,
        });
      }

      return events;
    },
  };
}

function invertSlugMap(): Record<string, Protocol> {
  const out: Record<string, Protocol> = {};
  for (const [internal, db] of Object.entries(LIQUIDATOR_DB_SLUG)) {
    out[db] = internal as Protocol;
  }
  return out;
}
