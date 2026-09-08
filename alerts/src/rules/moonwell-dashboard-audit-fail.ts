/**
 * Moonwell dashboard self-audit failure alert.
 *
 * Tails the `dashboard_audits` table that the moonwell-dashboard-audit
 * Worker (cron 0 2 UTC daily) populates. One row per check per run, with
 * status in {ok, warning, fail, error}.
 *
 * Fires one event per failed check in the most recent 36 hours. The key
 * is the check_name (e.g. "liquidations:base"), so the rule's cooldown
 * suppresses repeat alerts for the SAME check until either the cooldown
 * elapses or the failure auto-clears (next run goes back to ok).
 *
 * Background: a similar Jun-15-21 coverage gap on the liquidations table
 * was caught by the Moonwell team's manual gap report before we had this
 * automation. This rule plus the audit Worker are the institutional
 * memory so we catch it ourselves next time.
 */
import type { AlertContext, AlertEvent, AlertRule } from "../types";
import { MOONWELL_DISPLAY_NAME, MOONWELL_HANDLE } from "../config";
import {
  fetchDashboardAuditFailures,
  hasMoonwellDb,
  type DashboardAuditFailure,
} from "../sources/moonwellNeon";
import { moonwellUrl, trimTweet } from "./moonwell-helpers";

const SURFACE_DASHBOARD_PATH: Record<string, string> = {
  liquidations: "/liquidations",
  oev: "/oev",
  governance_votes: "/governance",
  financials_density: "/financials",
};

function severityFor(failure: DashboardAuditFailure): "WARNING" | "CRITICAL" {
  // 'error' = audit itself errored (e.g. RPC unreachable). Usually transient,
  // alert as WARNING. 'fail' = the audit completed and the data diverges
  // beyond the threshold, which is the real coverage rot — CRITICAL.
  return failure.status === "fail" ? "CRITICAL" : "WARNING";
}

function describeFailure(f: DashboardAuditFailure): string {
  if (f.status === "error") {
    return f.notes ?? "audit threw an unrecoverable error";
  }
  const delta = f.deltaPct != null ? `${f.deltaPct.toFixed(1)}%` : "?";
  const direction = f.deltaPct != null && f.deltaPct < 0 ? "missing" : "extra";
  return `DB has ${delta} ${direction} vs on-chain (on_chain=${f.onChainCount ?? "?"}, db=${f.dbCount ?? "?"})`;
}

export function createMoonwellDashboardAuditFailRule(): AlertRule {
  return {
    id: "moonwell_dashboard_audit_fail",
    name: "Moonwell dashboard self-audit failure",
    description:
      "Fires when the moonwell-dashboard-audit Worker reports a coverage check with status=fail or status=error in the last 36h.",
    // The audit Worker runs at 02:00 UTC; the alerts engine's daily tier
    // typically runs at 00:00 UTC, so a HOURLY schedule here catches the
    // 02:00 result on the 03:00 alerts pass (1h after the audit lands).
    schedule: "hourly",
    // 24h cooldown per (check_name, status) key — a check that's been
    // failing for days won't spam every hour, but a freshly-broken check
    // OR a check that recovers and re-breaks will fire promptly.
    cooldownHours: 24,

    async evaluate(ctx: AlertContext): Promise<AlertEvent[]> {
      if (!hasMoonwellDb(ctx.env)) {
        console.log("moonwell_dashboard_audit_fail: MOONWELL_DATABASE_URL unset, skipping");
        return [];
      }
      let failures: DashboardAuditFailure[];
      try {
        failures = await fetchDashboardAuditFailures(ctx.env, 36);
      } catch (e: any) {
        // Likely the dashboard_audits table doesn't exist yet on a fresh
        // env. Don't fire — log and let the next run try again.
        console.warn(
          `moonwell_dashboard_audit_fail: read failed: ${(e?.message ?? String(e)).slice(0, 120)}`,
        );
        return [];
      }
      if (failures.length === 0) return [];

      const dashboardBase = moonwellUrl(ctx.env);
      const events: AlertEvent[] = [];
      for (const f of failures) {
        const surfacePath = SURFACE_DASHBOARD_PATH[f.surface] ?? "";
        const dashboardUrl = moonwellUrl(ctx.env, surfacePath);
        const headline = `${MOONWELL_DISPLAY_NAME} dashboard audit: ${f.checkName} ${f.status.toUpperCase()}`;
        const body = [
          `Check: ${f.checkName}`,
          `Status: ${f.status.toUpperCase()}`,
          `Detail: ${describeFailure(f)}`,
          f.notes && f.status !== "error" ? `Notes: ${f.notes}` : null,
          `Last run: ${f.runAt}`,
          ``,
          `Source: ${dashboardBase}/api/audits  (or trigger a fresh check at`,
          `        https://moonwell-dashboard-audit.joelobafemii.workers.dev/?job=run)`,
        ].filter(Boolean).join("\n");
        // Audit alerts are internal-ops, not for public Twitter. Keep the
        // suggested tweet short and explicitly NOT for posting — the
        // digest renderer can suppress it, but if it leaks the framing
        // makes clear it's a heads-up not a public announcement.
        const tweet = trimTweet([
          `[internal] ${MOONWELL_DISPLAY_NAME} dashboard audit ${f.status} on ${f.checkName} — ${describeFailure(f)}`,
        ]);
        events.push({
          ruleId: "moonwell_dashboard_audit_fail",
          // Key includes status so a check transitioning fail→error (or
          // back) is treated as a new event despite the same check_name.
          key: `${f.checkName}:${f.status}`,
          severity: severityFor(f),
          headline,
          body,
          suggestedTweet: tweet,
          suggestedHandle: MOONWELL_HANDLE,
          dashboardUrl,
          data: {
            checkName: f.checkName,
            surface: f.surface,
            chain: f.chain,
            status: f.status,
            deltaPct: f.deltaPct,
            onChainCount: f.onChainCount,
            dbCount: f.dbCount,
            notes: f.notes,
            runAt: f.runAt,
          },
          firedAt: ctx.now,
        });
      }
      return events;
    },
  };
}
