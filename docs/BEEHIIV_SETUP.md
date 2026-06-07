# Connecting the newsletter form to Beehiiv

The subscribe form in the site footer and on each report page now POSTs
to a Next.js API route at `/api/subscribe`, which forwards the email to
Beehiiv's publication API. To complete the wiring, two Vercel
environment variables need to be set.

Until they are set, the form falls back to the existing
`mailto:research@datumlab.xyz` flow so readers still have a path to
subscribe.

---

## Step 1 — Grab your Beehiiv credentials

Both values live inside your Beehiiv publication.

### A. `BEEHIIV_API_KEY`

1. Sign in to <https://app.beehiiv.com>.
2. Click the publication you want signups to land in.
3. Go to **Settings → Integrations → API**.
4. Click **Create New API Key** (label it `datumlab-website` so it's
   identifiable).
5. Copy the key. It looks like `Bv1pubXXXXXXXXXXXXXXXX` (about 50
   characters). Save it somewhere safe — Beehiiv only shows it once.

### B. `BEEHIIV_PUBLICATION_ID`

The publication ID is in the URL when you're inside a publication on
Beehiiv:

```
https://app.beehiiv.com/<pub_id>/dashboard
                        └──────┘
                        copy this
```

It looks like `pub_8a1b2c3d-e4f5-6g78-9h0i-j1k2l3m4n5o6` (always starts
with `pub_`).

Quick way to confirm: open
<https://app.beehiiv.com/dashboard>, click into the publication, and
look at the URL bar.

---

## Step 2 — Add the secrets to Vercel

In the project's Vercel dashboard:

1. Go to **Settings → Environment Variables**.
2. Add the first variable:
   - **Name:** `BEEHIIV_API_KEY`
   - **Value:** the API key from Step 1A
   - **Environments:** check **Production** and **Preview**. Leave
     Development unchecked (you don't want every local dev server
     pushing to your production list).
3. Click **Save**.
4. Repeat for the second:
   - **Name:** `BEEHIIV_PUBLICATION_ID`
   - **Value:** the `pub_...` id from Step 1B
   - **Environments:** Production + Preview
5. Click **Save**.

Quick CLI alternative (run from the repo root, requires `vercel login`):

```bash
vercel env add BEEHIIV_API_KEY production
# paste the key, hit enter
vercel env add BEEHIIV_API_KEY preview
# paste again

vercel env add BEEHIIV_PUBLICATION_ID production
# paste the pub_... id
vercel env add BEEHIIV_PUBLICATION_ID preview
```

---

## Step 3 — Redeploy

Environment variable changes only take effect on a new build:

```bash
vercel --prod --yes
```

Or push any commit — Vercel auto-builds on pushes to the production
branch.

---

## Step 4 — Test the end-to-end flow

1. Open the site footer (or a report page) on the live URL.
2. Enter a test email you own (use the `+test1` trick to keep them
   separable from real signups: `you+test1@gmail.com`).
3. Hit **Subscribe**. The button should show `Sending…` then
   `Subscribed`.
4. Check Beehiiv: **Audience → Subscribers**. The email should appear
   within a few seconds with `utm_source = datumlabs-website` attached.
5. Try a deliberately bad email (e.g. `not-an-email`) — the form
   should show a red `Enter a valid email.` message and not submit.

If the form falls back to opening the mail client instead of submitting,
that means the API key or publication ID isn't set on the active
environment. Re-check Step 2 and redeploy.

---

## Where the integration lives in the codebase

| File | Role |
|---|---|
| `app/api/subscribe/route.ts` | The Edge route that proxies the email to Beehiiv. Holds no secrets in code — reads `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` from `process.env`. |
| `components/report/NewsletterSignup.tsx` | The form shown on individual report pages. POSTs to `/api/subscribe` with `utm_medium=report-newsletter-signup`. |
| `components/site-footer.tsx` `NewsletterColumn` | The form shown in the site footer. POSTs to `/api/subscribe` with `utm_medium=site-footer`. |

The two `utm_medium` values let you see in Beehiiv which surface
drove a subscription.

---

## What the form sends to Beehiiv

```json
{
  "email": "you@firm.com",
  "reactivate_existing": true,
  "send_welcome_email": true,
  "utm_source": "datumlabs-website",
  "utm_medium": "report-newsletter-signup",
  "utm_campaign": "state-of-defi-lending",
  "referring_site": "datumlab.xyz"
}
```

- `reactivate_existing: true` means a previously-unsubscribed email
  that signs up again gets reactivated automatically.
- `send_welcome_email: true` triggers whatever welcome you have
  configured under **Settings → Automations → Welcome email**. If you
  don't have one set up, Beehiiv just skips it silently.

If you want to flip either of these, edit `app/api/subscribe/route.ts`
— look for the `beehiivPayload` object.

---

## Troubleshooting

**Form shows the mail client opening, not "Subscribed"**
→ One or both env vars aren't readable by the API route. Check the
Vercel dashboard, confirm both are set for the environment your build
is running on (Production vs Preview), and redeploy.

**Form shows "We couldn't add that email right now"**
→ Beehiiv returned a non-success status. Open the Vercel project's
**Logs** tab and look for entries prefixed `[subscribe] Beehiiv`. The
log line includes Beehiiv's response body which usually says exactly
what's wrong (invalid API key, publication not found, rate limit, etc.).

**Form shows "Couldn't reach the newsletter service"**
→ The browser couldn't reach `/api/subscribe`. Almost always a
transient network issue or a build that hasn't finished propagating.
Wait a minute and retry.

**Form looks fine but no subscriber appears in Beehiiv**
→ Check that the API key is for the right publication. Beehiiv keys
are scoped to a single publication, and they silently succeed even if
the publication ID in the URL doesn't match the key. Easiest sanity
check: in Beehiiv, generate the key from inside the target publication
(don't copy a key from a different one).
