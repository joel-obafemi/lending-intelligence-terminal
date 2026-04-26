/**
 * Read-only pool for the existing liquidator-economy Neon DB.
 * Exposes `liquidation_events`, `price_cache`, `token_metadata`, and
 * `fluid_vaults` from the Liquidator Economy terminal. We never write to this
 * DB from the lending terminal — all mutations happen in the Liquidator
 * Economy project's own pipeline.
 */
import { Pool } from "@neondatabase/serverless"

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    if (!process.env.LIQUIDATOR_DATABASE_URL) {
      throw new Error("LIQUIDATOR_DATABASE_URL environment variable is required")
    }
    const url = process.env.LIQUIDATOR_DATABASE_URL.replace(/&?channel_binding=[^&]*/g, "")
    pool = new Pool({ connectionString: url })
  }
  return pool
}

export async function liquidatorSql<T = any>(
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<T[]> {
  let query = ""
  strings.forEach((str, i) => {
    query += str
    if (i < values.length) query += `$${i + 1}`
  })
  const res = await getPool().query(query, values)
  return res.rows as T[]
}

/** Check whether LIQUIDATOR_DATABASE_URL is configured — used by page-level guards. */
export function hasLiquidatorDb(): boolean {
  return !!process.env.LIQUIDATOR_DATABASE_URL
}
