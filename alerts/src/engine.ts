import type { AlertContext, AlertEvent, AlertRule, Env, Schedule } from "./types";
import { buildRuleRegistry, rulesForSchedule } from "./rules";
import { recordAlert, recordRuleError } from "./state/d1";
import { isInCooldown, isRuleDisabled, writeCooldown } from "./state/kv";
import { sendAlertToTelegram } from "./dispatchers/telegram";

export interface EngineRunResult {
  schedule: Schedule;
  evaluated: number;
  fired: number;
  dispatched: number;
  errors: number;
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

    console.log(
      `engine.run: schedule=${schedule} evaluated=${result.evaluated} fired=${result.fired} dispatched=${result.dispatched} errors=${result.errors}`,
    );
    return result;
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
