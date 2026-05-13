import type { Env, Severity } from "../types";

const RESEND_API_BASE = "https://api.resend.com";
const DEFAULT_SENDER = "alerts@datumlabs.xyz";

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "WARNING", "NORMAL", "INFO"];
const SEVERITY_BADGE_BG: Record<Severity, string> = {
  CRITICAL: "#b91c1c",
  WARNING: "#b45309",
  NORMAL: "#1d4ed8",
  INFO: "#475569",
};

export interface DigestAlertRow {
  rule_id: string;
  alert_key: string;
  severity: string;
  headline: string;
  body: string;
  suggested_tweet: string;
  dashboard_url: string | null;
  fired_at: number;
}

export interface BuildDigestArgs {
  alerts: DigestAlertRow[];
  windowEndMs: number;
  dashboardBaseUrl: string;
}

export interface BuiltDigest {
  subject: string;
  html: string;
  text: string;
  /** Count of alerts in the digest (excludes filtered-out severities). */
  alertCount: number;
}

/**
 * Build the digest payload. Pure: no env, no I/O.
 */
export function buildDailyDigest(args: BuildDigestArgs): BuiltDigest {
  const grouped = groupBySeverity(args.alerts);
  const dateLabel = new Date(args.windowEndMs).toISOString().slice(0, 10);
  const alertCount = args.alerts.length;

  const subject = `DatumLabs Alerts · ${alertCount} ${alertCount === 1 ? "event" : "events"} · ${dateLabel}`;
  const html = buildHtml(grouped, dateLabel, args.dashboardBaseUrl, alertCount);
  const text = buildText(grouped, dateLabel, alertCount);
  return { subject, html, text, alertCount };
}

function groupBySeverity(alerts: DigestAlertRow[]): Record<Severity, DigestAlertRow[]> {
  const out: Record<Severity, DigestAlertRow[]> = {
    CRITICAL: [],
    WARNING: [],
    NORMAL: [],
    INFO: [],
  };
  for (const a of alerts) {
    const sev = (SEVERITY_ORDER.includes(a.severity as Severity)
      ? (a.severity as Severity)
      : "INFO") as Severity;
    out[sev].push(a);
  }
  for (const sev of SEVERITY_ORDER) {
    out[sev].sort((a, b) => b.fired_at - a.fired_at);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function buildHtml(
  grouped: Record<Severity, DigestAlertRow[]>,
  dateLabel: string,
  dashboardBaseUrl: string,
  alertCount: number,
): string {
  const sections = SEVERITY_ORDER
    .filter((sev) => grouped[sev].length > 0)
    .map((sev) => {
      const badge = SEVERITY_BADGE_BG[sev];
      const cards = grouped[sev]
        .map((a) => renderCard(a, badge))
        .join("\n");
      return `
        <h2 style="font:600 14px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:24px 0 12px;">
          ${sev} (${grouped[sev].length})
        </h2>
        ${cards}
      `;
    })
    .join("\n");

  const summary = alertCount === 0
    ? `<p style="color:#64748b;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;">No alerts fired in the past 24 hours.</p>`
    : `<p style="color:#1f2937;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;margin:0 0 4px;">${alertCount} ${alertCount === 1 ? "alert" : "alerts"} in the past 24 hours.</p>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(`DatumLabs Alerts · ${dateLabel}`)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
            <tr>
              <td style="padding:24px 24px 0;">
                <p style="color:#94a3b8;font:11px/1 system-ui,-apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:.12em;margin:0 0 6px;">
                  DatumLabs Lending Intelligence
                </p>
                <h1 style="font:700 22px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:0 0 16px;">
                  Alerts digest · ${escapeHtml(dateLabel)}
                </h1>
                ${summary}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 24px;">
                ${sections}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <p style="font:12px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;color:#94a3b8;margin:0;border-top:1px solid #e2e8f0;padding-top:16px;">
                  Generated automatically by the DatumLabs alerts Worker. Suggested tweets are templates: review before posting.
                  <br />Dashboard: <a href="${escapeHtml(dashboardBaseUrl)}" style="color:#1d4ed8;">${escapeHtml(dashboardBaseUrl)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderCard(a: DigestAlertRow, badge: string): string {
  const tweet = escapeHtml(a.suggested_tweet);
  const body = escapeHtml(a.body).replace(/\n/g, "<br/>");
  const dashLink = a.dashboard_url
    ? `<a href="${escapeHtml(a.dashboard_url)}" style="color:#1d4ed8;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;">View on dashboard</a>`
    : "";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:6px;margin:0 0 12px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 6px;font:11px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#64748b;">
            <span style="display:inline-block;background:${badge};color:#fff;border-radius:3px;padding:2px 6px;font-weight:600;letter-spacing:.04em;">${escapeHtml(a.severity)}</span>
            <span style="margin-left:8px;">${escapeHtml(a.rule_id)} · ${escapeHtml(a.alert_key)} · ${fmtTime(a.fired_at)}</span>
          </p>
          <p style="font:600 16px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:6px 0 8px;">${escapeHtml(a.headline)}</p>
          <p style="font:13px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;color:#475569;margin:0 0 12px;">${body}</p>
          <p style="font:600 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px;">Suggested tweet</p>
          <pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:6px;font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-wrap:break-word;margin:0 0 12px;">${tweet}</pre>
          ${dashLink}
        </td>
      </tr>
    </table>
  `;
}

function buildText(
  grouped: Record<Severity, DigestAlertRow[]>,
  dateLabel: string,
  alertCount: number,
): string {
  const sections: string[] = [
    `DatumLabs Alerts digest · ${dateLabel}`,
    `${alertCount} ${alertCount === 1 ? "alert" : "alerts"} in the past 24 hours.`,
    "",
  ];
  for (const sev of SEVERITY_ORDER) {
    const list = grouped[sev];
    if (list.length === 0) continue;
    sections.push(`## ${sev} (${list.length})`);
    sections.push("");
    for (const a of list) {
      sections.push(`[${a.rule_id} · ${a.alert_key} · ${fmtTime(a.fired_at)}]`);
      sections.push(a.headline);
      sections.push(a.body);
      sections.push("");
      sections.push("Suggested tweet:");
      sections.push(a.suggested_tweet);
      sections.push("");
      if (a.dashboard_url) {
        sections.push(`Dashboard: ${a.dashboard_url}`);
        sections.push("");
      }
      sections.push("---");
      sections.push("");
    }
  }
  return sections.join("\n");
}

export interface ResendSendResult {
  ok: boolean;
  status: number;
  body?: string;
}

export interface SendDigestArgs {
  env: Env;
  recipients: string[];
  digest: BuiltDigest;
}

/**
 * Sends the prepared digest via Resend's /emails endpoint. Returns ok=false
 * on any non-2xx; the engine logs the failure and records to digest_runs.
 */
export async function sendDigestEmail(args: SendDigestArgs): Promise<ResendSendResult> {
  const { env, recipients, digest } = args;
  if (!env.RESEND_API_KEY) {
    return { ok: false, status: 412, body: "RESEND_API_KEY not set" };
  }
  if (recipients.length === 0) {
    return { ok: false, status: 412, body: "no recipients configured" };
  }
  const from = env.DIGEST_FROM ?? DEFAULT_SENDER;
  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export function resolveRecipients(env: Env): string[] {
  const raw = env.DIGEST_RECIPIENTS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
