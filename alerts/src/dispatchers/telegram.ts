import type { AlertEvent, Env } from "../types";
import { SEVERITY_EMOJI, escapeMarkdownV2 } from "./format";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramSendResult {
  ok: boolean;
  status: number;
  body?: string;
}

/**
 * Sends an AlertEvent to the configured Telegram chat using Markdown V2.
 * The suggested tweet sits inside a fenced code block so the operator can
 * tap-and-hold to copy on mobile without picking up the surrounding context.
 */
export async function sendAlertToTelegram(
  env: Env,
  event: AlertEvent,
): Promise<TelegramSendResult> {
  const text = formatTelegramMessage(event);
  return sendRawTelegramMessage(env, text);
}

export async function sendRawTelegramMessage(
  env: Env,
  text: string,
): Promise<TelegramSendResult> {
  const url = `${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("Telegram sendMessage failed:", res.status, body);
  }
  return { ok: res.ok, status: res.status, body };
}

export function formatTelegramMessage(event: AlertEvent): string {
  const emoji = SEVERITY_EMOJI[event.severity];
  const header = `*${emoji} ${escapeMarkdownV2(event.headline)}*`;
  const body = escapeMarkdownV2(event.body);
  const tweetBlock = `*Suggested tweet:*\n\`\`\`\n${event.suggestedTweet}\n\`\`\``;
  const dashLine = event.dashboardUrl
    ? `[View on dashboard](${escapeMarkdownV2(event.dashboardUrl)})`
    : "";
  return [header, "", body, "", tweetBlock, dashLine].filter(Boolean).join("\n");
}
