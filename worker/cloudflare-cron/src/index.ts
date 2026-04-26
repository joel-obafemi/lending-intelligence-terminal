/**
 * Lending Terminal — Cloudflare Worker cron.
 *
 * Does one thing: on a schedule, POST to our Next.js
 * `/api/cron/snapshot-rates` endpoint with the shared Bearer secret. Keeps
 * all business logic in the Next.js codebase; this Worker is pure scheduler.
 *
 * Configure via `wrangler secret put` / `wrangler vars`:
 *   - CRON_SECRET     — must match the Next.js app's CRON_SECRET env var
 *   - ENDPOINT_URL    — full URL to the snapshot endpoint (prod deployment)
 */

export interface Env {
  CRON_SECRET: string
  ENDPOINT_URL: string
}

async function postSnapshot(env: Env): Promise<{ status: number; body: string }> {
  const res = await fetch(env.ENDPOINT_URL, {
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
  /** Runs on the cron trigger defined in wrangler.toml. */
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const { status, body } = await postSnapshot(env)
    console.log(`[snapshot-rates cron] ${status} — ${body.slice(0, 400)}`)
    if (status < 200 || status >= 300) {
      throw new Error(`snapshot-rates cron failed with ${status}`)
    }
  },

  /**
   * Manual trigger for testing:
   *   curl https://<worker>.<account>.workers.dev/trigger
   * Returns the Next.js route's response inline.
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === "/trigger") {
      const { status, body } = await postSnapshot(env)
      return new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      })
    }
    return new Response(
      "lending-terminal cron worker\nPOST /trigger to run the snapshot immediately.\n",
      { status: 200, headers: { "content-type": "text/plain" } },
    )
  },
}
