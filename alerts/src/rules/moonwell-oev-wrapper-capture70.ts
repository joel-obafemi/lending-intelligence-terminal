import type { AlertContext, AlertEvent, AlertRule } from "../types";
import {
  MOONWELL_CHAIN_DISPLAY,
  MOONWELL_DISPLAY_NAME,
  MOONWELL_HANDLE,
  MOONWELL_OEV_CAPTURE_TARGET_PCT,
  type MoonwellChain,
} from "../config";
import {
  fetchPerWrapperCaptureV2,
  hasMoonwellDb,
  type WrapperCaptureRow,
} from "../sources/moonwellNeon";
import {
  hasWrapperCaptureFired,
  recordWrapperCaptureFire,
} from "../state/moonwell-d1";
import { fmtUsdCompact, moonwellUrl, trimTweet } from "./moonwell-helpers";

/** Minimum sample size: don't fire on a one-event wrapper hitting 100% by accident. */
const MIN_LIQUIDATIONS = 3;

export function createMoonwellOevWrapperCapture70Rule(): AlertRule {
  return {
    id: "moonwell_oev_wrapper_capture70",
    name: "Moonwell OEV per-wrapper 70% capture",
    description:
      "Fires the first time a V2 wrapper's cumulative capture rate crosses 70% (post-MIP-X56). One-shot per wrapper.",
    schedule: "hourly",
    // One-shot via the moonwell_oev_wrapper_capture_fires table; cooldown
    // is just a safety net in case the table check misses.
    cooldownHours: 8760, // 1 year

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasMoonwellDb(ctx.env)) return [];
      const wrappers = await fetchPerWrapperCaptureV2(ctx.env);
      const events: AlertEvent[] = [];
      for (const w of wrappers) {
        if (w.liquidations < MIN_LIQUIDATIONS) continue;
        if (w.captureRatePct == null) continue;
        if (w.captureRatePct < MOONWELL_OEV_CAPTURE_TARGET_PCT) continue;
        if (await hasWrapperCaptureFired(ctx.env, w.wrapper_address)) continue;

        const event = buildEvent(ctx, w);
        events.push(event);

        // Persist the fire BEFORE returning so concurrent runs don't double-tweet.
        await recordWrapperCaptureFire(ctx.env, {
          wrapper_address: w.wrapper_address,
          wrapper_label: w.wrapper_label,
          chain: w.chain,
          capture_rate_pct: w.captureRatePct,
          fired_at: ctx.now.getTime(),
        });
      }
      return events;
    },
  };
}

function buildEvent(ctx: AlertContext, w: WrapperCaptureRow): AlertEvent {
  const chainDisplay = MOONWELL_CHAIN_DISPLAY[w.chain as MoonwellChain] ?? w.chain;
  const pct = w.captureRatePct ?? 0;
  const dashboardUrl = moonwellUrl(ctx.env, "/oev");

  const headline = `${w.wrapper_label} on ${chainDisplay} crossed 70% capture`;
  const body = [
    `Wrapper: ${w.wrapper_address}`,
    `Chain: ${chainDisplay}`,
    `Capture rate: ${pct.toFixed(2)}%`,
    `Liquidations: ${w.liquidations}`,
    `Protocol revenue: ${fmtUsdCompact(w.protocolUsd)}`,
  ].join("\n");

  const tweet = trimTweet([
    `${MOONWELL_DISPLAY_NAME} OEV: ${w.wrapper_label} wrapper on ${chainDisplay} just crossed 70% capture rate (now ${pct.toFixed(2)}%).`,
    ``,
    `Post-MIP-X56 fee-split working as designed.`,
    ``,
    dashboardUrl,
  ]);

  return {
    ruleId: "moonwell_oev_wrapper_capture70",
    key: w.wrapper_address,
    severity: "NORMAL",
    headline,
    body,
    suggestedTweet: tweet,
    suggestedHandle: MOONWELL_HANDLE,
    dashboardUrl,
    data: {
      wrapper: w.wrapper_address,
      label: w.wrapper_label,
      chain: w.chain,
      captureRatePct: pct,
      liquidations: w.liquidations,
      protocolUsd: w.protocolUsd,
      bonusUsd: w.bonusUsd,
    },
    firedAt: ctx.now,
  };
}
