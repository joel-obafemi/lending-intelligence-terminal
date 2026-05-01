/**
 * Morpho Uncurated Callout — small card that surfaces the long tail of
 * permissionless market creation. Sits beneath the curator leaderboard
 * because the leaderboard intentionally treats "Uncurated" as one row;
 * the story behind that row (N markets, $X total) deserves its own
 * frame so a reader doesn't read the leaderboard's Uncurated row as a
 * data anomaly.
 *
 * Renders nothing when there's no Uncurated curator row, or when its
 * vault count / TVL is too small to make a story (heuristic: <5 vaults
 * or <$1M TVL — below that the long tail is genuinely irrelevant).
 */
import { Telescope } from "lucide-react"
import { formatUSD } from "@/lib/utils"
import type { CuratorLeaderboardRow } from "@/lib/morpho-api"

interface Props {
  rows: CuratorLeaderboardRow[]
}

export function MorphoUncuratedCallout({ rows }: Props) {
  const uncurated = rows.find((r) => r.name.toLowerCase() === "uncurated")
  if (!uncurated) return null
  if (uncurated.vaultCount < 5 || uncurated.totalAssetsUsd < 1_000_000) return null

  return (
    <div
      className="tui-card border rounded p-4 flex items-start gap-3"
      style={{
        background: "rgba(91, 127, 255, 0.04)",
        border: "1px solid rgba(91, 127, 255, 0.18)",
      }}
    >
      <span style={{ color: "var(--accent-blue)", flexShrink: 0, marginTop: 2 }}>
        <Telescope size={14} strokeWidth={2.25} />
      </span>
      <div className="flex flex-col gap-1">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: "var(--accent-blue)" }}
        >
          The long tail
        </span>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <span className="font-semibold">{uncurated.vaultCount}</span> uncurated
          MetaMorpho vaults hold{" "}
          <span className="font-semibold tabular-nums">
            {formatUSD(uncurated.totalAssetsUsd)}
          </span>{" "}
          across{" "}
          <span className="font-semibold tabular-nums">
            {uncurated.uniqueAssets}
          </span>{" "}
          unique assets — the long tail of permissionless market creation. These
          are vaults without a registered curator, often experimental or
          single-allocator mandates. Worth tracking for early-stress signals.
        </p>
      </div>
    </div>
  )
}
