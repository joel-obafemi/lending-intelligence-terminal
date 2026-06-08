/**
 * Newsletter signup proxy → Beehiiv.
 *
 * Accepts POST { email: string, utm_source?: string } from the
 * NewsletterSignup component and the site-footer NewsletterColumn,
 * forwards the email to Beehiiv's
 *   POST /v2/publications/{publication_id}/subscriptions
 * endpoint using a server-side API key, and returns a normalized
 * { ok: true } / { ok: false, error: string } response.
 *
 * Why proxy instead of fetching Beehiiv from the browser:
 *   - The Beehiiv API key is a publication-wide secret; exposing it to
 *     the client would let anyone push arbitrary subscribers to the
 *     publication.
 *   - Server-side gives us a clean place to add basic-validation,
 *     rate-limiting, and a single place to swap providers later.
 *
 * Required Vercel env vars (Production + Preview):
 *   BEEHIIV_API_KEY         — bearer token from Beehiiv dashboard →
 *                             Settings → Integrations → API
 *   BEEHIIV_PUBLICATION_ID  — publication ID, format "pub_XXXXXXXX".
 *                             Visible in the URL when you're inside a
 *                             publication: app.beehiiv.com/<pub_id>/
 *
 * When either env var is missing, the route returns 503 so the form
 * UI shows an error rather than silently succeeding. The local
 * mailto-fallback in the form components remains as a courtesy path.
 */
import { NextResponse } from "next/server"

export const runtime = "edge"

interface SubscribeBody {
  email?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  referring_site?: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function envOrNull(name: string): string | null {
  const v = process.env[name]
  return v && v.length > 0 ? v : null
}

export async function POST(request: Request) {
  const apiKey = envOrNull("BEEHIIV_API_KEY")
  const publicationId = envOrNull("BEEHIIV_PUBLICATION_ID")

  if (!apiKey || !publicationId) {
    // Surfaced to the form so it falls back to the mailto path.
    return NextResponse.json(
      { ok: false, error: "Newsletter provider not configured." },
      { status: 503 },
    )
  }

  let body: SubscribeBody = {}
  try {
    body = (await request.json()) as SubscribeBody
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    )
  }

  const email = (body.email ?? "").trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email." },
      { status: 400 },
    )
  }

  // Beehiiv accepts UTM tags + a referring_site for attribution. Surface
  // whatever the caller passed, defaulting to "datumlabs-website".
  const beehiivPayload = {
    email,
    reactivate_existing: true,
    send_welcome_email: true,
    utm_source: body.utm_source ?? "datumlabs-website",
    utm_medium: body.utm_medium ?? "newsletter-form",
    utm_campaign: body.utm_campaign ?? "state-of-defi-lending",
    referring_site: body.referring_site ?? "datumlab.xyz",
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(beehiivPayload),
      },
    )
  } catch (err: unknown) {
    console.error("[subscribe] Beehiiv fetch failed:", err)
    return NextResponse.json(
      { ok: false, error: "Could not reach the newsletter provider. Try again in a moment." },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    // Don't leak Beehiiv's response verbatim — log it, return a
    // friendly error to the form. The most common case is "already
    // subscribed" (which Beehiiv may return with a 400) so we treat
    // that as a soft success.
    let detail = ""
    try {
      const text = await upstream.text()
      detail = text
      console.warn(`[subscribe] Beehiiv ${upstream.status}:`, text)
    } catch {}
    if (
      upstream.status === 400 &&
      /already subscribed|duplicate|exists/i.test(detail)
    ) {
      return NextResponse.json({ ok: true, alreadySubscribed: true })
    }
    return NextResponse.json(
      { ok: false, error: "We couldn't add that email right now. Please try again." },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
