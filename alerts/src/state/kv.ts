import type { Env } from "../types";

const COOLDOWN_PREFIX = "cooldown:";
const LATEST_PREFIX = "latest:";
const FEATURE_DISABLED_PREFIX = "feature:disabled:";

export function cooldownKey(ruleId: string, key: string): string {
  return `${COOLDOWN_PREFIX}${ruleId}:${key}`;
}

export function latestKey(ruleId: string, key: string): string {
  return `${LATEST_PREFIX}${ruleId}:${key}`;
}

export async function readCooldown(env: Env, ruleId: string, key: string): Promise<number | null> {
  const raw = await env.ALERTS_KV.get(cooldownKey(ruleId, key));
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function writeCooldown(
  env: Env,
  ruleId: string,
  key: string,
  firedAtMs: number,
  cooldownHours: number,
): Promise<void> {
  // KV TTL must be >= 60s. Set TTL to cooldown duration so entries self-expire.
  const ttlSeconds = Math.max(60, Math.round(cooldownHours * 3600));
  await env.ALERTS_KV.put(cooldownKey(ruleId, key), String(firedAtMs), {
    expirationTtl: ttlSeconds,
  });
}

export async function isInCooldown(
  env: Env,
  ruleId: string,
  key: string,
  cooldownHours: number,
  nowMs: number,
): Promise<boolean> {
  const last = await readCooldown(env, ruleId, key);
  if (last === null) return false;
  return nowMs - last < cooldownHours * 3600 * 1000;
}

export async function readLatest<T>(env: Env, ruleId: string, key: string): Promise<T | null> {
  const raw = await env.ALERTS_KV.get(latestKey(ruleId, key), "json");
  return (raw as T | null) ?? null;
}

export async function writeLatest<T>(
  env: Env,
  ruleId: string,
  key: string,
  value: T,
): Promise<void> {
  await env.ALERTS_KV.put(latestKey(ruleId, key), JSON.stringify(value));
}

export async function isRuleDisabled(env: Env, ruleId: string): Promise<boolean> {
  const raw = await env.ALERTS_KV.get(`${FEATURE_DISABLED_PREFIX}${ruleId}`);
  return raw === "true" || raw === "1";
}
