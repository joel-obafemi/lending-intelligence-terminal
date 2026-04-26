import { Eye } from "lucide-react"
import type { WatchList as WatchListData } from "@/lib/watch-list"

interface Props {
  data: WatchListData
}

export function WatchList({ data }: Props) {
  if (data.items.length === 0) return null

  return (
    <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
      <div
        className="border-b border-card-border"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}
      >
        <div className="flex items-center gap-2">
          <Eye size={12} strokeWidth={2.5} color="var(--accent-orange)" />
          <span
            className="text-accent"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            {data.title}
          </span>
        </div>
        {data.lastUpdated && (
          <span className="text-[10px] text-text-muted" style={{ letterSpacing: "0.05em" }}>
            Updated {data.lastUpdated}
          </span>
        )}
      </div>
      <div className="divide-y" style={{ borderColor: "var(--card-border)" }}>
        {data.items.map((item, i) => (
          <div
            key={`${item.title}-${i}`}
            className="px-4 py-3 flex gap-3 items-start"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--card-border)" }}
          >
            <span
              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] tabular-nums"
              style={{
                background: "rgba(255, 107, 53, 0.08)",
                color: "var(--accent-orange)",
                border: "1px solid rgba(255, 107, 53, 0.25)",
              }}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div
                className="text-[12px] font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                {item.title}
              </div>
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {item.body}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="px-4 py-2 text-[10px]"
        style={{ background: "var(--panel-header)", color: "var(--text-muted)", borderTop: "1px solid var(--card-border)" }}
      >
        Edit <code style={{ fontFamily: "JetBrains Mono, monospace" }}>content/watch.md</code> before each edition.
      </div>
    </div>
  )
}
