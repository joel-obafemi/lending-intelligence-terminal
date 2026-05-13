import type { AlertContext, AlertEvent, AlertRule, Severity } from "../types";
import {
  HHI_7D_DELTA_TRIGGER,
  HHI_DOUBLY_CONCENTRATED,
  HHI_HIGHLY_CONCENTRATED,
  HHI_TOP3_SHARE_DELTA_PP,
} from "../config";
import {
  findHhiSnapshotAtOrBefore,
  recordHhiSnapshot,
} from "../state/d1";
import { readLatest, writeLatest } from "../state/kv";
import { MorphoGraphQLClient, type MorphoCuratorShare } from "../sources/morpho";
import { formatUsdShort } from "../dispatchers/format";

interface LatestState {
  hhi: number;
  top3CombinedPct: number;
  top1Name: string;
  top1Pct: number;
  recordedAt: number;
}

type Trigger =
  | { kind: "crossed-2500"; prevHhi: number }
  | { kind: "crossed-3000"; prevHhi: number }
  | { kind: "7d-delta"; deltaPoints: number; prior: number }
  | { kind: "top3-shift"; deltaPp: number; prior: number };

export interface MorphoHhiRuleDeps {
  client?: MorphoGraphQLClient;
}

export function createMorphoCuratorHhiRule(deps: MorphoHhiRuleDeps = {}): AlertRule {
  return {
    id: "morpho_curator_hhi",
    name: "Morpho curator HHI",
    description:
      "Fires on threshold crossings (2500 / 3000), 7-day delta > 100 points, or > 1pp top-3 share change in 24h.",
    schedule: "daily",
    cooldownHours: 24,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      const client = deps.client ?? new MorphoGraphQLClient();
      const result = await client.getCuratorHhi();
      if (result.vaultCount === 0) {
        console.log("morpho_curator_hhi: no vaults returned, skipping");
        return [];
      }

      const top3 = result.curators.slice(0, 3);
      const top3CombinedPct = top3.reduce((acc, c) => acc + c.sharePct, 0);
      const nowMs = ctx.now.getTime();

      // Persist snapshot for the rolling 7-day delta.
      await recordHhiSnapshot(ctx.env, {
        snapshot_at: nowMs,
        hhi: result.hhi,
        total_assets_usd: result.totalAssetsUsd,
        top1_share_pct: top3[0]?.sharePct ?? 0,
        top2_share_pct: top3[1]?.sharePct ?? 0,
        top3_share_pct: top3[2]?.sharePct ?? 0,
        top3_combined_pct: top3CombinedPct,
      });

      const prev = await readLatest<LatestState>(
        ctx.env,
        "morpho_curator_hhi",
        "global",
      );

      await writeLatest<LatestState>(ctx.env, "morpho_curator_hhi", "global", {
        hhi: result.hhi,
        top3CombinedPct,
        top1Name: top3[0]?.name ?? "",
        top1Pct: top3[0]?.sharePct ?? 0,
        recordedAt: nowMs,
      });

      if (!prev) {
        console.log(
          `morpho_curator_hhi: seeded baseline HHI=${result.hhi.toFixed(0)}, top1=${top3[0]?.name ?? "n/a"}`,
        );
        return [];
      }

      const triggers: Trigger[] = [];
      if (prev.hhi < HHI_HIGHLY_CONCENTRATED && result.hhi >= HHI_HIGHLY_CONCENTRATED) {
        triggers.push({ kind: "crossed-2500", prevHhi: prev.hhi });
      }
      if (prev.hhi < HHI_DOUBLY_CONCENTRATED && result.hhi >= HHI_DOUBLY_CONCENTRATED) {
        triggers.push({ kind: "crossed-3000", prevHhi: prev.hhi });
      }

      const sevenDaysAgoMs = nowMs - 7 * 24 * 3600 * 1000;
      const weekAgo = await findHhiSnapshotAtOrBefore(ctx.env, sevenDaysAgoMs);
      if (weekAgo && Math.abs(result.hhi - weekAgo.hhi) > HHI_7D_DELTA_TRIGGER) {
        triggers.push({
          kind: "7d-delta",
          deltaPoints: result.hhi - weekAgo.hhi,
          prior: weekAgo.hhi,
        });
      }

      if (
        Math.abs(top3CombinedPct - prev.top3CombinedPct) > HHI_TOP3_SHARE_DELTA_PP
      ) {
        triggers.push({
          kind: "top3-shift",
          deltaPp: top3CombinedPct - prev.top3CombinedPct,
          prior: prev.top3CombinedPct,
        });
      }

      if (triggers.length === 0) return [];

      // Pick the highest-severity trigger: crossings outrank deltas, and 3000
      // outranks 2500.
      const primary = pickPrimary(triggers);
      return [buildEvent({ ctx, result, top3, top3CombinedPct, primary, prevHhi: prev.hhi })];
    },
  };
}

function pickPrimary(triggers: Trigger[]): Trigger {
  const order: Record<Trigger["kind"], number> = {
    "crossed-3000": 0,
    "crossed-2500": 1,
    "7d-delta": 2,
    "top3-shift": 3,
  };
  return [...triggers].sort((a, b) => order[a.kind] - order[b.kind])[0]!;
}

interface BuildEventArgs {
  ctx: AlertContext;
  result: { hhi: number; totalAssetsUsd: number; vaultCount: number };
  top3: MorphoCuratorShare[];
  top3CombinedPct: number;
  primary: Trigger;
  prevHhi: number;
}

function buildEvent(args: BuildEventArgs): AlertEvent {
  const { ctx, result, top3, top3CombinedPct, primary } = args;
  const dashboardUrl = `${ctx.env.PUBLIC_DASHBOARD_BASE_URL}/protocols?p=morpho-blue`;
  const severity: Severity =
    primary.kind === "crossed-2500" || primary.kind === "crossed-3000" ? "WARNING" : "NORMAL";

  const namesLine = top3
    .map((c) => `${c.name} ${c.sharePct.toFixed(1)}%`)
    .join(", ");

  let action: string;
  let interpretation: string;
  if (primary.kind === "crossed-3000") {
    action = `crossed above 3,000`;
    interpretation =
      "Above 3,000 the market is well past the conventional ceiling for healthy concentration. Single-curator events would move sector TVL.";
  } else if (primary.kind === "crossed-2500") {
    action = `crossed above 2,500`;
    interpretation =
      "2,500 is the antitrust convention for high concentration. Curator-specific risk is now sector-level risk.";
  } else if (primary.kind === "7d-delta") {
    action = `moved ${primary.deltaPoints >= 0 ? "+" : ""}${primary.deltaPoints.toFixed(0)} points in 7 days`;
    interpretation =
      primary.deltaPoints > 0
        ? "Concentration is rising. Watch which curator is taking share."
        : "Concentration is easing as TVL spreads to more curators.";
  } else {
    action = `top-3 share moved ${primary.deltaPp >= 0 ? "+" : ""}${primary.deltaPp.toFixed(1)} pp in 24 hours`;
    interpretation =
      "Large 24-hour shifts in top-3 share point to fast-moving allocator activity.";
  }

  // Voice rules: no em-dashes, no first-person plural.
  const lines = [
    `Morpho's curator HHI just ${action}.`,
    "",
    `HHI: ${args.prevHhi.toFixed(0)} to ${result.hhi.toFixed(0)}`,
    `Top 3 curators: ${namesLine} (${top3CombinedPct.toFixed(1)}% combined)`,
    "",
    interpretation,
    "",
    dashboardUrl,
  ];
  let suggestedTweet = lines.join("\n");
  if (suggestedTweet.length > 280) {
    suggestedTweet = [
      `Morpho's curator HHI just ${action}.`,
      `HHI ${args.prevHhi.toFixed(0)} to ${result.hhi.toFixed(0)}. Top 3: ${namesLine} (${top3CombinedPct.toFixed(1)}%).`,
      dashboardUrl,
    ].join("\n");
  }
  if (suggestedTweet.length > 280) {
    suggestedTweet = suggestedTweet.slice(0, 277) + "...";
  }

  const headline = `Morpho curator HHI ${action} (now ${result.hhi.toFixed(0)})`;
  const body = [
    `HHI: ${result.hhi.toFixed(0)} (prior ${args.prevHhi.toFixed(0)})`,
    `Top 3: ${namesLine}`,
    `Top 3 combined: ${top3CombinedPct.toFixed(1)}%`,
    `Curated TVL: ${formatUsdShort(result.totalAssetsUsd)} across ${result.vaultCount.toLocaleString()} vaults`,
  ].join("\n");

  return {
    ruleId: "morpho_curator_hhi",
    key: "global",
    severity,
    headline,
    body,
    suggestedTweet,
    suggestedHandle: "@MorphoLabs",
    dashboardUrl,
    data: {
      hhi: result.hhi,
      prevHhi: args.prevHhi,
      top3CombinedPct,
      top3: top3.map((c) => ({ name: c.name, sharePct: c.sharePct })),
      trigger: primary,
      curatedTvlUsd: result.totalAssetsUsd,
      vaultCount: result.vaultCount,
    },
    firedAt: ctx.now,
  };
}
