import type { AlertContext, AlertEvent, AlertRule, Env, Schedule } from "./types";
import { buildRuleRegistry, rulesForSchedule } from "./rules";
import {
  recentAlertsSince,
  recordAlert,
  recordDigestRun,
  recordRuleError,
} from "./state/d1";
import { isInCooldown, isRuleDisabled, writeCooldown } from "./state/kv";
import { sendAlertToTelegram } from "./dispatchers/telegram";
import {
  buildDailyDigest,
  resolveRecipients,
  sendDigestEmail,
} from "./dispatchers/email";

export interface EngineRunResult {
  schedule: Schedule;
  evaluated: number;
  fired: number;
  dispatched: number;
  errors: number;
  digest?: {
    alertCount: number;
    recipients: string[];
    status: "sent" | "skipped-empty" | "failed";
    error?: string;
  };
}

export class AlertEngine {
  constructor(private env: Env, private rules: AlertRule[] = buildRuleRegistry()) {}

  async run(schedule: Schedule, now: Date = new Date()): Promise<EngineRunResult> {
    const rules = rulesForSchedule(this.rules, schedule);
    const result: EngineRunResult = {
      schedule,
      evaluated: 0,
      fired: 0,
      dispatched: 0,
      errors: 0,
    };

    for (const rule of rules) {
      const disabled = await isRuleDisabled(this.env, rule.id);
      if (disabled) {
        console.log(`engine: rule ${rule.id} disabled via feature flag, skipping`);
        continue;
      }
      result.evaluated += 1;
      try {
        const ctx: AlertContext = { env: this.env, now, fetchedAt: now };
        const events = await rule.evaluate(ctx);
        for (const event of events) {
          const fired = await this.maybeDispatch(rule, event);
          if (fired === "fired") {
            result.fired += 1;
            result.dispatched += 1;
          } else if (fired === "fired-no-dispatch") {
            result.fired += 1;
          }
        }
      } catch (err) {
        result.errors += 1;
        console.error(`engine: rule ${rule.id} threw:`, err);
        try {
          await recordRuleError(this.env, rule.id, err, now.getTime());
        } catch (innerErr) {
          console.error("engine: failed to record rule error:", innerErr);
        }
      }
    }

    if (schedule === "daily") {
      result.digest = await this.sendDailyDigest(now);
    }

    console.log(
      `engine.run: schedule=${schedule} evaluated=${result.evaluated} fired=${result.fired} dispatched=${result.dispatched} errors=${result.errors}${result.digest ? ` digest=${result.digest.status}(${result.digest.alertCount})` : ""}`,
    );
    return result;
  }

  /**
   * Compose and send the 24h digest. Runs after the daily rules so the
   * digest includes anything the same daily run just fired.
   */
  async sendDailyDigest(now: Date): Promise<NonNullable<EngineRunResult["digest"]>> {
    const recipients = resolveRecipients(this.env);
    const sinceMs = now.getTime() - 24 * 3600 * 1000;
    const rows = await recentAlertsSince(this.env, sinceMs, 200);
    const digest = buildDailyDigest({
      alerts: rows,
      windowEndMs: now.getTime(),
      dashboardBaseUrl: this.env.PUBLIC_DASHBOARD_BASE_URL,
    });

    if (recipients.length === 0) {
      await recordDigestRun(this.env, {
        ran_at: now.getTime(),
        alerts_count: digest.alertCount,
        recipients: "",
        status: "failed",
        error_message: "DIGEST_RECIPIENTS not configured",
      });
      console.warn("engine: no digest recipients configured, skipping send");
      return {
        alertCount: digest.alertCount,
        recipients,
        status: "failed",
        error: "no recipients",
      };
    }

    const send = await sendDigestEmail({ env: this.env, recipients, digest });
    const recipientsStr = recipients.join(",");
    if (send.ok) {
      await recordDigestRun(this.env, {
        ran_at: now.getTime(),
        alerts_count: digest.alertCount,
        recipients: recipientsStr,
        status: "sent",
      });
      return { alertCount: digest.alertCount, recipients, status: "sent" };
    }
    await recordDigestRun(this.env, {
      ran_at: now.getTime(),
      alerts_count: digest.alertCount,
      recipients: recipientsStr,
      status: "failed",
      error_message: `${send.status}: ${send.body?.slice(0, 500) ?? ""}`,
    });
    console.error(`engine: digest send failed status=${send.status} body=${send.body}`);
    return {
      alertCount: digest.alertCount,
      recipients,
      status: "failed",
      error: send.body ?? `status ${send.status}`,
    };
  }

  private async maybeDispatch(
    rule: AlertRule,
    event: AlertEvent,
  ): Promise<"fired" | "fired-no-dispatch" | "cooldown"> {
    const inCooldown = await isInCooldown(
      this.env,
      rule.id,
      event.key,
      rule.cooldownHours,
      event.firedAt.getTime(),
    );
    if (inCooldown) {
      console.log(`engine: ${rule.id}:${event.key} suppressed by cooldown`);
      return "cooldown";
    }

    await recordAlert(this.env, event);
    await writeCooldown(
      this.env,
      rule.id,
      event.key,
      event.firedAt.getTime(),
      rule.cooldownHours,
    );

    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) {
      console.warn(
        `engine: Telegram secrets missing, ${rule.id}:${event.key} recorded but not dispatched`,
      );
      return "fired-no-dispatch";
    }

    const dispatch = await sendAlertToTelegram(this.env, event);
    if (!dispatch.ok) {
      console.error(
        `engine: Telegram dispatch failed for ${rule.id}:${event.key} status=${dispatch.status}`,
      );
      return "fired-no-dispatch";
    }
    return "fired";
  }
}
