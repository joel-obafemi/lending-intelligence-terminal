import { NextResponse } from "next/server"
import { runRateSnapshot } from "@/lib/snapshot-rates"

// Cron endpoint may take 10-20s depending on DefiLlama latency. Force dynamic
// execution (no build-time caching) and give ourselves headroom on Vercel.
export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // Permissive in dev when CRON_SECRET is unset.
  const header = req.headers.get("authorization") ?? ""
  return header === `Bearer ${secret}`
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    )
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL not configured" },
      { status: 500 },
    )
  }
  try {
    const res = await runRateSnapshot()
    return NextResponse.json({ ok: true, ...res })
  } catch (err: any) {
    console.error("[cron/snapshot-rates]", err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    )
  }
}

/** POST is the canonical cron trigger (Cloudflare Worker calls this). */
export async function POST(req: Request) {
  return handle(req)
}

/** GET is handy for manual triggering from a browser/curl during setup. */
export async function GET(req: Request) {
  return handle(req)
}
