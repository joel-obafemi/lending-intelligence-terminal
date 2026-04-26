import { Pool } from "@neondatabase/serverless"

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required")
    }
    // Neon's serverless driver doesn't accept the channel_binding param some URLs include.
    const dbUrl = process.env.DATABASE_URL.replace(/&?channel_binding=[^&]*/g, "")
    pool = new Pool({ connectionString: dbUrl })
  }
  return pool
}

/**
 * Tagged template literal for parameterized queries.
 *
 * @example
 *   const rows = await sql`SELECT * FROM protocols WHERE slug = ${slug}`
 */
export async function sql<T = any>(
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

/** Direct string execution for dynamic SQL (schema init, migrations, etc.) */
export async function rawSql<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query(text, params)
  return res.rows as T[]
}

/** Close the pool — only call this at the end of a script/worker cycle, not in request handlers. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
