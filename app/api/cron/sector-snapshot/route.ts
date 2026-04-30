/**
 * Sector daily snapshot cron endpoint.
 *
 * Hit by the Cloudflare Worker (`worker/cloudflare-cron/`) once per day at
 * 01:00 UTC. Runs `loadOverview()` + UPSERTs the payload into the
 * `sector_snapshots` Neon table. Sector page reads off that table going
 * forward — see `lib/sector-snapshot.ts` for the full data flow.
 *
 * Manual trigger (during setup or on-demand):
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/cron/sector-snapshot
 */
import { NextResponse } from "next/server"
import { persistSectorSnapshot } from "@/lib/sector-snapshot"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true  // permissive in dev
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
    const res = await persistSectorSnapshot()
    return NextResponse.json({ ok: true, ...res })
  } catch (err: any) {
    console.error("[cron/sector-snapshot]", err)
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 },
    )
  }
}

export const POST = handle
export const GET = handle
