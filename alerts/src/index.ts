import { AlertEngine } from "./engine";
import { sendRawTelegramMessage } from "./dispatchers/telegram";
import type { Env, Schedule } from "./types";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const schedule = inferSchedule(event.cron);
    const engine = new AlertEngine(env);
    ctx.waitUntil(engine.run(schedule));
  },

  /**
   * Minimal HTTP surface. Two endpoints are useful before /pulse exists:
   *   GET /alerts            recent fires from D1
   *   POST /test/telegram    send a smoke-test message to the configured chat
   * Phase 4 will replace this with the public /pulse feed.
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/alerts") {
      const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
      const rows = await env.ALERTS_DB.prepare(
        "SELECT * FROM alert_history ORDER BY fired_at DESC LIMIT ?",
      )
        .bind(limit)
        .all();
      return Response.json(rows.results);
    }

    if (req.method === "POST" && url.pathname === "/test/telegram") {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
        return new Response(
          "Telegram secrets not configured. Run `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put TELEGRAM_CHAT_ID`.",
          { status: 412 },
        );
      }
      const stamp = new Date().toISOString();
      const result = await sendRawTelegramMessage(
        env,
        `*datumlabs\\-alerts smoke test*\nDispatcher reachable at ${stamp.replace(/[-:.]/g, "\\$&")}\\.`,
      );
      return Response.json({
        ok: result.ok,
        status: result.status,
        body: result.body?.slice(0, 500),
      });
    }

    if (req.method === "POST" && url.pathname === "/run") {
      const scheduleParam = url.searchParams.get("schedule") ?? "fast";
      const schedule: Schedule =
        scheduleParam === "hourly" || scheduleParam === "daily"
          ? (scheduleParam as Schedule)
          : "fast";
      const engine = new AlertEngine(env);
      const result = await engine.run(schedule);
      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  },
};

export function inferSchedule(cron: string): Schedule {
  const c = cron.trim();
  if (c.startsWith("*/5")) return "fast";
  if (c.startsWith("0 */1") || c.startsWith("0 * ")) return "hourly";
  return "daily";
}
