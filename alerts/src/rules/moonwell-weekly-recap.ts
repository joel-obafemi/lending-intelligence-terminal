import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_CHAIN_DISPLAY,
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_MARKET_DELTA_NORMAL_PCT,
  type MoonwellChain,
} from "../config";
import { MoonwellDefiLlamaClient } from "../sources/moonwell";
import { fetchOevTrailing7d, hasMoonwellDb } from "../sources/moonwellNeon";
import { findMarketSnapshotAtOrBefore } from "../state/moonwell-d1";
import { fmtPct, fmtUsdCompact, moonwellUrl, pctChange } from "./moonwell-helpers";

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const TOLERANCE_MS = 36 * 3600 * 1000;
const PERIOD_TOP_N = 3;

export interface WeeklyRecapDeps {
  client?: MoonwellDefiLlamaClient;
}

export function createMoonwellWeeklyRecapRule(deps: WeeklyRecapDeps = {}): AlertRule {
  return {
    id: "moonwell_weekly_recap",
    name: "Moonwell weekly recap",
    description:
      "Composite recap of the previous Mon-Sun calendar week. Fires once per Monday 10:00 UTC tick.",
    schedule: "weekly",
    // Don't re-fire if a cron retry happens within the same week.
    cooldownHours: 144,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MoonwellDefiLlamaClient();
      const nowMs = ctx.now.getTime();
      const dashboardUrl = moonwellUrl(ctx.env);

      // Header date range: Mon-Sun ending the day before "now".
      const periodEnd = new Date(nowMs - 24 * 3600 * 1000);
      const periodStart = new Date(periodEnd.getTime() - 6 * 24 * 3600 * 1000);
      const rangeLabel = `${formatDate(periodStart)} to ${formatDate(periodEnd)}, ${periodEnd.getUTCFullYear()}`;

      // ── Markets section ───
      const pools = await client.getLendingPools();
      const marketLines: string[] = [];
      const movers: Array<{
        chain: MoonwellChain;
        symbol: string;
        field: "supply" | "borrow";
        deltaPct: number;
        priorUsd: number;
        currentUsd: number;
      }> = [];
      for (const pool of pools) {
        const chain = normalizeChain(pool.chain);
        if (!chain) continue;
        const cutoff = nowMs - SEVEN_DAYS_MS;
        const prior = await findMarketSnapshotAtOrBefore(
          ctx.env,
          chain,
          pool.symbol,
          cutoff,
        );
        if (!prior) continue;
        if (prior.snapshot_at < cutoff - TOLERANCE_MS) continue;
        const supplyUsd = pool.totalSupplyUsd ?? 0;
        const borrowUsd = pool.totalBorrowUsd ?? 0;
        const supplyDelta = pctChange(prior.supply_usd, supplyUsd);
        const borrowDelta = pctChange(prior.borrow_usd, borrowUsd);
        if (supplyDelta !== null && Math.abs(supplyDelta) >= MOONWELL_MARKET_DELTA_NORMAL_PCT) {
          movers.push({
            chain,
            symbol: pool.symbol,
            field: "supply",
            deltaPct: supplyDelta,
            priorUsd: prior.supply_usd,
            currentUsd: supplyUsd,
          });
        }
        if (borrowDelta !== null && Math.abs(borrowDelta) >= MOONWELL_MARKET_DELTA_NORMAL_PCT) {
          movers.push({
            chain,
            symbol: pool.symbol,
            field: "borrow",
            deltaPct: borrowDelta,
            priorUsd: prior.borrow_usd,
            currentUsd: borrowUsd,
          });
        }
      }
      // Sort by absolute delta and take top-N per chain.
      const grouped = new Map<MoonwellChain, typeof movers>();
      for (const m of movers) {
        const list = grouped.get(m.chain) ?? [];
        list.push(m);
        grouped.set(m.chain, list);
      }
      for (const [chain, list] of grouped.entries()) {
        list.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
        const top = list.slice(0, PERIOD_TOP_N);
        marketLines.push(`${MOONWELL_CHAIN_DISPLAY[chain]}:`);
        for (const m of top) {
          const noun = m.field === "supply" ? "supply" : "borrows";
          marketLines.push(
            `> ${m.symbol} ${noun} ${fmtPct(m.deltaPct)} (${fmtUsdCompact(m.priorUsd)} -> ${fmtUsdCompact(m.currentUsd)})`,
          );
        }
        marketLines.push("");
      }

      // ── OEV section ───
      let oevLine = "";
      if (hasMoonwellDb(ctx.env)) {
        const nowSeconds = Math.floor(nowMs / 1000);
        const slice = await fetchOevTrailing7d(ctx.env, nowSeconds);
        if (slice.liquidations > 0) {
          const captureTxt =
            slice.captureRatePct == null ? "n/a" : `${slice.captureRatePct.toFixed(1)}%`;
          oevLine = `OEV: ${captureTxt} capture on ${slice.liquidations} liquidations this week, ${fmtUsdCompact(slice.protocolUsd)} protocol revenue.`;
        }
      }

      // ── TVL + vault TVL ───
      const tvl = await client.getTotalTvlUsd();
      const vaultTvl = await client.getVaultsTvlUsd();
      const tvlLine =
        tvl != null
          ? `TVL: ${fmtUsdCompact(tvl)}${vaultTvl != null ? ` (vaults ${fmtUsdCompact(vaultTvl)})` : ""}.`
          : "";

      // ── Compose ───
      const lines: string[] = [
        `${MOONWELL_DISPLAY_NAME} weekly recap, ${rangeLabel}.`,
        "",
      ];
      if (marketLines.length > 0) lines.push(...marketLines);
      if (oevLine) lines.push(oevLine, "");
      if (tvlLine) lines.push(tvlLine, "");
      lines.push(dashboardUrl);

      const tweet = clampForTwitter(lines);

      const headline = `${MOONWELL_DISPLAY_NAME} weekly recap, ${rangeLabel}`;
      const body = lines.join("\n");

      return [
        {
          ruleId: "moonwell_weekly_recap",
          key: `${formatDate(periodStart)}_${formatDate(periodEnd)}`,
          severity: "INFO",
          headline,
          body,
          suggestedTweet: tweet,
          suggestedHandle: MOONWELL_HANDLE,
          dashboardUrl,
          data: { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
          firedAt: ctx.now,
        },
      ];
    },
  };
}

function clampForTwitter(lines: string[]): string {
  const copy = [...lines];
  let text = copy.join("\n");
  while (text.length > 280 && copy.length > 4) {
    // Remove the last in-section line (just before the URL).
    copy.splice(copy.length - 2, 1);
    text = copy.join("\n");
  }
  if (text.length > 280) text = text.slice(0, 277) + "...";
  return text;
}

function formatDate(d: Date): string {
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  return `${month} ${day}`;
}

function normalizeChain(chain: string): MoonwellChain | null {
  const lower = chain.toLowerCase();
  if (lower === "base") return "base";
  if (lower === "optimism") return "optimism";
  if (lower === "ethereum") return "ethereum";
  return null;
}
