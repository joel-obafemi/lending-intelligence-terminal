# lending-terminal-cron

Cloudflare Worker that fans cron triggers out to two kinds of handler:

1. **Next.js cron endpoints** — POST to `/api/cron/<job>` on the Vercel
   app with a Bearer secret. Used for in-app jobs that just need to run
   business logic (e.g. sector-snapshot writing to Neon).
2. **GitHub workflow dispatch** — POST to the GitHub Actions API to
   trigger a `workflow_dispatch` event. Used for jobs that need to
   commit files back to the repo, since Vercel functions have a
   read-only filesystem. The seed-refresh job uses this.

## Deploy

```bash
cd worker/cloudflare-cron
npm install
npx wrangler login                       # one-time

# Secrets:
npx wrangler secret put CRON_SECRET      # paste the same value used in the Next.js app .env
npx wrangler secret put GITHUB_TOKEN     # see "GitHub token" below

npm run deploy
```

The cron schedules live in `wrangler.toml` (`[triggers] crons`).
Defaults:

- `0 1 * * *` daily 01:00 UTC — sector-snapshot Next.js endpoint
- `0 2 * * 0` Sundays 02:00 UTC — refresh-seeds GitHub workflow

## GitHub token

The seed-refresh cron dispatches a workflow via the GitHub Actions API.
Create a fine-grained PAT with these scopes on this repo only:

- **Actions** → Read and write (lets the Worker call `workflow_dispatch`)
- **Contents** → Read-only (lets the workflow check out the code; the
  workflow itself uses the default `GITHUB_TOKEN` to push back, not
  the PAT)

Store it as the `GITHUB_TOKEN` Worker secret (`wrangler secret put GITHUB_TOKEN`).

## Vercel deploy hook (optional)

The refresh-seeds workflow can ping a Vercel deploy hook after a
successful seed update, so prod picks up the new seeds without a manual
`vercel --prod`. Set it up:

1. Vercel dashboard → lending-intelligence-terminal → Settings →
   Git → Deploy Hooks. Create a hook for the production branch
   (currently `feat/alerts-mvp`).
2. Copy the URL.
3. GitHub repo → Settings → Secrets and variables → Actions → New
   repository secret. Name: `VERCEL_DEPLOY_HOOK`. Value: the URL.

Without this secret the workflow still commits the new seeds — they
just won't reach prod until someone runs `vercel --prod` or pushes
another commit.

## Test

```bash
# Run the FIRST job in CRON_JOBS:
curl -sS https://lending-terminal-cron.<your-account>.workers.dev/trigger

# Run a specific job by cron string:
curl -sS "https://lending-terminal-cron.<your-account>.workers.dev/trigger?cron=0+2+*+*+0"

# Run an arbitrary Next.js cron path (debugging only):
curl -sS "https://lending-terminal-cron.<your-account>.workers.dev/trigger?path=/api/cron/sector-snapshot"

# Tail logs in real time:
npm run tail
```

Cloudflare's free tier covers 10K scheduled invocations/day; this
worker uses ~7-8/week.
