/**
 * In-memory mocks for D1Database and KVNamespace, sufficient for unit
 * testing rule logic and the engine. They implement just the operations
 * the alerts code actually uses, not the full D1/KV surface.
 */

import type { Env } from "../src/types";

interface Row {
  [col: string]: unknown;
}

interface Table {
  rows: Row[];
  pk: string[] | null;
  autoIncrement?: { col: string; next: number };
}

export class FakeD1 {
  private tables = new Map<string, Table>();
  // Most-recently-executed query, for assertions.
  public lastSql: string | null = null;

  constructor() {
    this.ensureTable("alert_history", {
      pk: null,
      autoIncrement: { col: "id", next: 1 },
    });
    this.ensureTable("rolling_baselines", { pk: ["metric_key", "window_days"] });
    this.ensureTable("baseline_samples", { pk: ["metric_key", "sample_at"] });
    this.ensureTable("tvl_snapshots", { pk: ["protocol", "snapshot_at"] });
    this.ensureTable("cooldowns", { pk: ["cooldown_key"] });
    this.ensureTable("rule_errors", { pk: null, autoIncrement: { col: "id", next: 1 } });
  }

  private ensureTable(name: string, opts: Omit<Table, "rows">) {
    if (!this.tables.has(name)) {
      this.tables.set(name, { rows: [], ...opts });
    }
  }

  rowsFor(name: string): Row[] {
    return this.tables.get(name)?.rows ?? [];
  }

  prepare(sql: string) {
    this.lastSql = sql;
    return new FakeD1Statement(this, sql, []);
  }

  exec(_sql: string): Promise<unknown> {
    return Promise.resolve({ count: 0, duration: 0 });
  }

  // Internal helpers used by FakeD1Statement.
  applyInsert(
    table: string,
    cols: string[],
    values: unknown[],
    onConflict?: { keys: string[]; updateCols: string[] },
  ): void {
    const tbl = this.tables.get(table);
    if (!tbl) throw new Error(`Unknown table ${table}`);
    const row: Row = {};
    cols.forEach((c, i) => (row[c] = values[i]));
    if (tbl.autoIncrement) {
      row[tbl.autoIncrement.col] = tbl.autoIncrement.next++;
    }
    if (onConflict) {
      const existing = tbl.rows.find((r) =>
        onConflict.keys.every((k) => r[k] === row[k]),
      );
      if (existing) {
        for (const c of onConflict.updateCols) existing[c] = row[c];
        return;
      }
    }
    tbl.rows.push(row);
  }

  applyDelete(table: string, predicate: (r: Row) => boolean): void {
    const tbl = this.tables.get(table);
    if (!tbl) return;
    tbl.rows = tbl.rows.filter((r) => !predicate(r));
  }

  selectAll(table: string, predicate?: (r: Row) => boolean): Row[] {
    const tbl = this.tables.get(table);
    if (!tbl) return [];
    return predicate ? tbl.rows.filter(predicate) : [...tbl.rows];
  }
}

class FakeD1Statement {
  constructor(private db: FakeD1, private sql: string, private params: unknown[]) {}

  bind(...params: unknown[]): FakeD1Statement {
    return new FakeD1Statement(this.db, this.sql, params);
  }

  async run(): Promise<{ success: boolean }> {
    this.exec();
    return { success: true };
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    const rows = this.exec();
    return { results: (rows ?? []) as T[] };
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = this.exec();
    return (rows && rows[0] ? (rows[0] as T) : null) as T | null;
  }

  private exec(): Row[] | undefined {
    const sql = this.sql.trim();
    const upper = sql.toUpperCase();

    if (upper.startsWith("INSERT INTO ALERT_HISTORY")) {
      this.db.applyInsert(
        "alert_history",
        [
          "rule_id",
          "alert_key",
          "severity",
          "headline",
          "body",
          "suggested_tweet",
          "dashboard_url",
          "data_json",
          "fired_at",
        ],
        this.params,
      );
      return;
    }

    if (upper.startsWith("INSERT INTO RULE_ERRORS")) {
      this.db.applyInsert(
        "rule_errors",
        ["rule_id", "error_message", "occurred_at"],
        this.params,
      );
      return;
    }

    if (upper.startsWith("INSERT INTO TVL_SNAPSHOTS")) {
      this.db.applyInsert(
        "tvl_snapshots",
        ["protocol", "snapshot_at", "tvl_usd"],
        this.params,
        { keys: ["protocol", "snapshot_at"], updateCols: ["tvl_usd"] },
      );
      return;
    }

    if (upper.startsWith("INSERT INTO BASELINE_SAMPLES")) {
      this.db.applyInsert(
        "baseline_samples",
        ["metric_key", "sample_at", "value"],
        this.params,
        { keys: ["metric_key", "sample_at"], updateCols: ["value"] },
      );
      return;
    }

    if (upper.startsWith("INSERT INTO ROLLING_BASELINES")) {
      this.db.applyInsert(
        "rolling_baselines",
        ["metric_key", "window_days", "mean", "stddev", "sample_count", "updated_at"],
        this.params,
        {
          keys: ["metric_key", "window_days"],
          updateCols: ["mean", "stddev", "sample_count", "updated_at"],
        },
      );
      return;
    }

    if (upper.startsWith("DELETE FROM BASELINE_SAMPLES")) {
      const [metricKey, cutoff] = this.params as [string, number];
      this.db.applyDelete(
        "baseline_samples",
        (r) =>
          r["metric_key"] === metricKey && (r["sample_at"] as number) < cutoff,
      );
      return;
    }

    if (upper.startsWith("SELECT VALUE FROM BASELINE_SAMPLES")) {
      const [metricKey, since] = this.params as [string, number];
      return this.db
        .selectAll(
          "baseline_samples",
          (r) =>
            r["metric_key"] === metricKey && (r["sample_at"] as number) >= since,
        )
        .map((r) => ({ value: r["value"] }));
    }

    if (upper.startsWith("SELECT PROTOCOL, SNAPSHOT_AT, TVL_USD")) {
      const [protocol, cutoff] = this.params as [string, number];
      const rows = this.db
        .selectAll(
          "tvl_snapshots",
          (r) =>
            r["protocol"] === protocol && (r["snapshot_at"] as number) <= cutoff,
        )
        .sort((a, b) => (b["snapshot_at"] as number) - (a["snapshot_at"] as number));
      return rows.slice(0, 1);
    }

    if (upper.startsWith("SELECT *") && upper.includes("FROM ALERT_HISTORY")) {
      const rows = this.db
        .selectAll("alert_history")
        .sort((a, b) => (b["fired_at"] as number) - (a["fired_at"] as number));
      const limit = (this.params[0] as number) ?? rows.length;
      return rows.slice(0, limit);
    }

    throw new Error(`FakeD1: unhandled SQL: ${sql}`);
  }
}

export class FakeKV {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string, type?: "json" | "text"): Promise<unknown> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    if (type === "json") {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    }
    return entry.value;
  }

  async put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    const expiresAt =
      opts?.expirationTtl && opts.expirationTtl > 0
        ? Date.now() + opts.expirationTtl * 1000
        : null;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Direct accessor for test assertions.
  inspect(key: string): string | null {
    return this.store.get(key)?.value ?? null;
  }
}

export function makeEnv(overrides: Partial<Env> = {}): Env {
  const db = new FakeD1();
  const kv = new FakeKV();
  return {
    ALERTS_DB: db as unknown as D1Database,
    ALERTS_KV: kv as unknown as KVNamespace,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
    PUBLIC_DASHBOARD_BASE_URL: "https://datumlabs.xyz/lending-terminal",
    ...overrides,
  } as Env;
}
