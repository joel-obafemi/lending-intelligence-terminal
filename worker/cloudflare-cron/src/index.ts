/**
 * Lending Terminal — Cloudflare Worker cron.
 *
 * Pure scheduler: on each cron trigger, dispatch to the matching Next.js
 * `/api/cron/<job>` endpoint with the shared Bearer secret. All business
 * logic lives in the Next.js codebase; this Worker just fans schedules
 * out to the right endpoints.
 *
 * Configure via `wrangler secret put`:
 *   - CRON_SECRET   — must match the Next.js app's CRON_SECRET env var
 *
 * Configure via `[vars]` in wrangler.toml:
 *   - BASE_URL      — production origin (e.g. https://lending-terminal.datumlabs.xyz)
 *
 * The cron-to-job mapping is defined inline below; add new jobs by adding
 * a row + the matching cron string to wrangler.toml's `[triggers]`.
 */

export interface Env {
  CRON_SECRET: string
  BASE_URL: string
}

/** Cron string → endpoint path mapping. Keep schedules in sync with
 *  wrangler.toml's `[triggers]` block. */
const CRON_JOBS: Record<string, string> = {
  // Daily 01:00 UTC — refresh sector overview snapshot.
  "0 1 * * *": "/api/cron/sector-snapshot",
}

async function fireJob(env: Env, path: string): Promise<{ status: number; body: string }> {
  const url = env.BASE_URL.replace(/\/$/, "") + path
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      "User-Agent": "lending-terminal-cron/1.0 (Cloudflare Workers)",
    },
  })
  const body = await res.text()
  return { status: res.status, body }
}

export default {
  /** Cron trigger handler. Cloudflare populates `controller.cron` with the
   *  exact cron string from wrangler.toml that fired this run, so we use
   *  it as the dispatch key. */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const path = CRON_JOBS[controller.cron]
    if (!path) {
      console.error(`[cron] no job mapped to schedule: ${controller.cron}`)
      return
    }
    const { status, body } = await fireJob(env, path)
    console.log(
      `[cron ${controller.cron} → ${path}] ${status} — ${body.slice(0, 400)}`,
    )
    if (status < 200 || status >= 300) {
      throw new Error(`${path} cron failed with ${status}`)
    }
  },

  /** Manual trigger for testing:
   *    /trigger                   — runs the FIRST job in CRON_JOBS
   *    /trigger?path=/api/cron/x  — runs an arbitrary job
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === "/trigger") {
      const path =
        url.searchParams.get("path") ?? Object.values(CRON_JOBS)[0]
      const { status, body } = await fireJob(env, path)
      return new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      })
    }
    return new Response(
      "lending-terminal cron worker\n" +
        "GET /trigger              — run the first scheduled job now\n" +
        "GET /trigger?path=/api/.. — run a specific job now\n",
      { status: 200, headers: { "content-type": "text/plain" } },
    )
  },
}
