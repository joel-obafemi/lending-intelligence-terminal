/**
 * Lending Terminal — Cloudflare Worker cron.
 *
 * Scheduler that fans cron triggers out to two kinds of handler:
 *
 *   1. "next-cron" — POST to a Next.js `/api/cron/<job>` endpoint with
 *      Bearer auth. Used for in-app jobs (sector-snapshot, etc.) where
 *      the work is just business logic that can run in a Vercel
 *      function and write to e.g. Neon.
 *
 *   2. "gh-workflow" — POST to the GitHub Actions workflow_dispatch
 *      endpoint. Used for jobs that need to commit files back to the
 *      repo, since Vercel functions have a read-only filesystem and
 *      can't update the static seeds bundled into the next build.
 *      The seed-refresh job uses this.
 *
 * Configure via `wrangler secret put`:
 *   - CRON_SECRET   shared Bearer with the Next.js /api/cron/* endpoints
 *   - GITHUB_TOKEN  fine-grained PAT with actions:write + contents:read
 *                   on the lending-intelligence-terminal repo
 *
 * Configure via `[vars]` in wrangler.toml:
 *   - BASE_URL              Vercel origin
 *   - GITHUB_REPO           "owner/repo"
 *   - GITHUB_BRANCH         branch the seed workflow dispatches against
 *   - SEED_WORKFLOW_FILE    the workflow filename, e.g. "refresh-seeds.yml"
 *
 * Adding a new job: add the cron string to wrangler.toml's [triggers],
 * add a row to CRON_JOBS below.
 */

export interface Env {
  CRON_SECRET: string
  GITHUB_TOKEN: string
  BASE_URL: string
  GITHUB_REPO: string
  GITHUB_BRANCH: string
  SEED_WORKFLOW_FILE: string
}

type CronJob =
  | { kind: "next-cron"; path: string; description: string }
  | { kind: "gh-workflow"; workflow: keyof Env; description: string }

/** Cron string → job mapping. Keep in sync with wrangler.toml's
 *  `[triggers]` block. */
const CRON_JOBS: Record<string, CronJob> = {
  // Daily 01:00 UTC — refresh sector overview snapshot.
  "0 1 * * *": {
    kind: "next-cron",
    path: "/api/cron/sector-snapshot",
    description: "sector-snapshot",
  },
  // Sundays 02:00 UTC — refresh static seeds (yield-pools, FRED,
  // blended-stable APY). Triggers the GitHub workflow, which captures
  // fresh upstream data, commits the JSON files to the configured
  // branch, and (if set) pings the Vercel deploy hook.
  "0 2 * * 0": {
    kind: "gh-workflow",
    workflow: "SEED_WORKFLOW_FILE",
    description: "refresh-seeds",
  },
}

async function fireNextCron(
  env: Env,
  path: string,
): Promise<{ status: number; body: string }> {
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

async function fireGitHubWorkflow(
  env: Env,
  workflowFile: string,
  reason: string,
): Promise<{ status: number; body: string }> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${workflowFile}/dispatches`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "lending-terminal-cron/1.0 (Cloudflare Workers)",
    },
    body: JSON.stringify({
      ref: env.GITHUB_BRANCH,
      inputs: { reason },
    }),
  })
  // Workflow dispatch returns 204 with no body on success — surface a
  // useful summary regardless.
  const text = await res.text()
  return {
    status: res.status,
    body: text || `(no body; dispatched ${workflowFile} on ${env.GITHUB_BRANCH})`,
  }
}

async function runJob(
  env: Env,
  job: CronJob,
  reason: string,
): Promise<{ status: number; body: string; label: string }> {
  if (job.kind === "next-cron") {
    const r = await fireNextCron(env, job.path)
    return { ...r, label: job.description }
  }
  const workflowFile = env[job.workflow] as string
  const r = await fireGitHubWorkflow(env, workflowFile, reason)
  return { ...r, label: job.description }
}

export default {
  /** Cron trigger. Cloudflare populates `controller.cron` with the
   *  exact cron string from wrangler.toml; we use that as the
   *  dispatch key. */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const job = CRON_JOBS[controller.cron]
    if (!job) {
      console.error(`[cron] no job mapped to schedule: ${controller.cron}`)
      return
    }
    const { status, body, label } = await runJob(env, job, "cron")
    console.log(
      `[cron ${controller.cron} → ${label}] ${status} — ${body.slice(0, 400)}`,
    )
    if (status < 200 || status >= 300) {
      throw new Error(`${label} cron failed with ${status}`)
    }
  },

  /** Manual trigger for testing:
   *    /trigger                   — runs the FIRST job in CRON_JOBS
   *    /trigger?cron=0 2 * * 0    — runs the job mapped to that cron
   *    /trigger?path=/api/cron/x  — runs an arbitrary Next.js cron path
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname !== "/trigger") {
      return new Response(
        "lending-terminal cron worker\n" +
          "GET /trigger              — run the first scheduled job now\n" +
          "GET /trigger?cron=<cron>  — run the job mapped to that cron string\n" +
          "GET /trigger?path=/api/.. — run an arbitrary Next.js cron path\n",
        { status: 200, headers: { "content-type": "text/plain" } },
      )
    }
    const cronKey = url.searchParams.get("cron")
    const arbitraryPath = url.searchParams.get("path")
    if (arbitraryPath) {
      const r = await fireNextCron(env, arbitraryPath)
      return new Response(r.body, {
        status: r.status,
        headers: { "content-type": "application/json" },
      })
    }
    const job = cronKey
      ? CRON_JOBS[cronKey]
      : Object.values(CRON_JOBS)[0]
    if (!job) {
      return new Response(`no job for cron ${cronKey}`, { status: 404 })
    }
    const { status, body, label } = await runJob(env, job, "manual")
    return new Response(`[${label}] ${status}\n${body}`, {
      status,
      headers: { "content-type": "text/plain" },
    })
  },
}
