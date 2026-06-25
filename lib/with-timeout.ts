/**
 * Race a promise against a timeout, returning null on either timeout or
 * rejection. Page-level loaders use this so a slow upstream (DefiLlama
 * /pools currently returning in 29s when it usually takes <5s, etc.)
 * can't blow past the Vercel function's maxDuration ceiling.
 *
 * Why this exists: a plain `.catch()` only fires on rejection. It does
 * NOTHING for a promise that hangs — Vercel kills the function at
 * maxDuration, the RSC stream closes mid-render, and the client surfaces
 * "Application error: a client-side exception has occurred / Connection
 * closed". A Promise.race against a setTimeout that resolves to null
 * guarantees the load step exits within the page's render budget.
 *
 * Each branch (timeout or rejection) logs to console.error with the
 * caller-supplied label so Vercel function logs show which upstream is
 * misbehaving — not just "stream closed".
 */
export async function withTimeout<T>(
  label: string,
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise.catch((err) => {
        console.error(`[${label}] rejected:`, err?.message ?? err)
        return null
      }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.error(`[${label}] timed out after ${ms}ms`)
          resolve(null)
        }, ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Default per-loader budget. Pages have maxDuration = 60, this leaves
 *  ~15s for compute + RSC stream framing + cold-start. Tune per-page if
 *  the page has multiple sequential awaits. */
export const DEFAULT_LOAD_BUDGET_MS = 45_000
