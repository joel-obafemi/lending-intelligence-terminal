"use client"

/**
 * Newsletter signup — single email input, single submit button.
 *
 * Spec: "Use a hosted provider (Beehiiv, Substack, ConvertKit) via API or
 * embed; do not build email infrastructure." This component renders the
 * form shell + a placeholder submit handler that opens a mailto link.
 *
 * To wire in a real provider, replace the onSubmit with a fetch to
 * Beehiiv / Substack / ConvertKit's signup endpoint. The visual + form
 * structure stays identical.
 */
import { useState, type FormEvent } from "react"

interface Props {
  /** Where to send the email when no provider is wired. Defaults to a
   *  brand alias the user can manually subscribe via. */
  fallbackMailTo?: string
  /** Suppress the internal "Get the next issue in your inbox" label.
   *  Useful when the form sits under a section heading that already
   *  conveys the intent (e.g. the report-page SupportPanel). */
  hideLabel?: boolean
}

export function NewsletterSignup({
  fallbackMailTo = "research@datumlab.xyz",
  hideLabel = false,
}: Props) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle")
  const [errMsg, setErrMsg] = useState<string>("")

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setStatus("err")
      setErrMsg("Enter a valid email.")
      return
    }
    setStatus("loading")
    setErrMsg("")
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          utm_source: "datumlabs-website",
          utm_medium: "report-newsletter-signup",
          referring_site: typeof window !== "undefined" ? window.location.host : undefined,
        }),
      })
      if (res.ok) {
        setStatus("ok")
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setStatus("err")
      if (res.status === 503) {
        // Provider not configured. Show the brand inbox as a manual
        // path rather than silently launching a mail client.
        setErrMsg(`Newsletter not connected yet. Email ${fallbackMailTo} to subscribe.`)
      } else {
        setErrMsg(data.error ?? "Something went wrong. Try again in a moment.")
      }
    } catch {
      setStatus("err")
      setErrMsg("Couldn't reach the newsletter service. Try again in a moment.")
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Subscribe to State of DeFi Lending"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 320,
        margin: "0 auto",
      }}
    >
      {!hideLabel && (
        <label
          htmlFor="newsletter-email"
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--report-text-muted)",
          }}
        >
          Get the next issue in your inbox
        </label>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          id="newsletter-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status === "err") setStatus("idle")
          }}
          placeholder="you@firm.com"
          required
          style={{
            flex: 1,
            padding: "8px 10px",
            border: `1px solid ${status === "err" ? "var(--report-accent)" : "var(--report-border)"}`,
            borderRadius: 4,
            fontFamily: "var(--report-font-sans)",
            fontSize: 14,
            background: "var(--report-bg)",
            color: "var(--report-text)",
          }}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          style={{
            padding: "8px 14px",
            background: "var(--report-brand)",
            color: "#F7F4ED",
            border: "none",
            borderRadius: 4,
            cursor: status === "loading" ? "wait" : "pointer",
            opacity: status === "loading" ? 0.7 : 1,
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {status === "ok" ? "Subscribed" : status === "loading" ? "Sending…" : "Subscribe"}
        </button>
      </div>
      {status === "ok" && (
        <div
          role="status"
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            color: "var(--report-brand)",
            background: "rgba(31, 58, 95, 0.08)",
            border: "1px solid var(--report-brand)",
            borderRadius: 4,
            padding: "8px 10px",
            margin: 0,
          }}
        >
          ✓ Subscribed. The next issue lands in your inbox on the 7th.
        </div>
      )}
      {status === "err" && errMsg && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 10,
            color: "var(--report-accent)",
            margin: 0,
          }}
        >
          {errMsg}
        </p>
      )}
      <p
        style={{
          fontFamily: "var(--report-font-mono)",
          fontSize: 10,
          letterSpacing: "0.04em",
          color: "var(--report-text-muted)",
          margin: 0,
        }}
      >
        Once a month, no spam. Unsubscribe anytime.
      </p>
    </form>
  )
}
