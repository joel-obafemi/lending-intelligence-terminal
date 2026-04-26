# lending-terminal-cron

Cloudflare Worker that invokes the Next.js `/api/cron/snapshot-rates`
endpoint on a daily schedule. All business logic lives in the Next.js app;
this worker is a pure scheduler (~25 lines of code).

## Deploy

```bash
cd worker/cloudflare-cron
npm install
npx wrangler login                         # one-time
npx wrangler secret put CRON_SECRET        # paste the same value used in the Next.js app .env
# Optional override — wrangler.toml ships with a sensible default:
# npx wrangler secret put ENDPOINT_URL

npm run deploy
```

The cron schedule lives in `wrangler.toml` (`[triggers] crons`).
Default: `0 1 * * *` → daily at 01:00 UTC.

## Test

```bash
# Manually trigger the snapshot from anywhere:
curl -sS https://lending-terminal-cron.<your-account>.workers.dev/trigger

# Tail logs to see cron runs in real time:
npm run tail
```

Cloudflare's free tier covers 10K scheduled invocations/day; we use ~1-4.
