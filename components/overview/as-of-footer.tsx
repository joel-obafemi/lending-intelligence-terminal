"use client"

interface Props {
  /** Unix seconds — when the underlying data was fetched. */
  timestamp: number
  /** Optional extra label, e.g. "DefiLlama" or "rate_snapshots". */
  source?: string
}

function formatRelative(ts: number): string {
  const now = Math.floor(Date.now() / 1000)
  const delta = Math.max(0, now - ts)
  if (delta < 60) return "just now"
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)} h ago`
  return `${Math.floor(delta / 86400)} d ago`
}

function formatAbsolute(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + "Z"
}

/**
 * Tiny "As of X" footer used inside chart card bodies. Shows a relative
 * timestamp (e.g. "3 min ago") with the absolute UTC timestamp on hover.
 */
export function AsOfFooter({ timestamp, source }: Props) {
  if (!timestamp) return null
  return (
    <div
      className="text-[9px] text-text-muted px-4 pb-2"
      style={{ letterSpacing: "0.05em" }}
      title={formatAbsolute(timestamp)}
    >
      As of {formatRelative(timestamp)}
      {source && ` · ${source}`}
    </div>
  )
}
