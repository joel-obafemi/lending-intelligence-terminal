export type Protocol = "aave-v3" | "spark" | "morpho" | "fluid";
export type Severity = "INFO" | "NORMAL" | "WARNING" | "CRITICAL";
export type Schedule = "fast" | "hourly" | "daily";

export interface Env {
  ALERTS_DB: D1Database;
  ALERTS_KV: KVNamespace;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  RESEND_API_KEY?: string;
  FRED_API_KEY?: string;

  PUBLIC_DASHBOARD_BASE_URL: string;
}

export interface AlertContext {
  env: Env;
  now: Date;
  fetchedAt: Date;
}

export interface AlertEvent {
  ruleId: string;
  key: string;
  severity: Severity;
  headline: string;
  body: string;
  suggestedTweet: string;
  suggestedHandle?: string;
  dashboardUrl?: string;
  data: Record<string, unknown>;
  firedAt: Date;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  schedule: Schedule;
  cooldownHours: number;
  evaluate(ctx: AlertContext): Promise<AlertEvent[]>;
}
