"use client"

/**
 * Morpho Curator Concentration — Morpho protocol-specific lens.
 *
 * Single horizontal stacked bar with the top 5 curators as colored
 * segments and "Other (N curators)" as a grey segment. Above the bar:
 * a large HHI number with a one-line classification ("highly
 * concentrated" / "moderately concentrated" / "competitive") and an
 * auto-generated takeaway naming the top 3 curators' aggregate share.
 *
 * Sits directly above the curator leaderboard so the page reads
 * "punchline → table" rather than asking the reader to do the math.
 *
 * The stacked bar excludes the "Uncurated" bucket — that's a separate
 * long-tail story (238 permissionless markets at ~$55M total) that
 * the table preserves but doesn't belong in a curator-concentration
 * read. The HHI is computed on the curated portion only.
 */

import { useMemo } from "react"
import { formatUSD, formatPercent } from "@/lib/utils"
import { MethodologyTooltip } from "../overview/methodology-tooltip"
import type { CuratorLeaderboardRow } from "@/lib/morpho-api"

interface Props {
  rows: CuratorLeaderboardRow[]
}

interface Segment {
  name: string
  usd: number
  sharePct: number
  color: string
}

const SEGMENT_COLORS = [
  "#5B7FFF", // Morpho blue
  "#FF6B35", // accent orange
  "#10B981", // sky green
  "#B44AFF", // Aave purple
  "#F59E0B", // amber
]

const OTHER_COLOR = "rgba(91, 99, 115, 0.45)" // muted grey

interface ConcentrationStats {
  segments: Segment[]
  otherSharePct: number
  otherUsd: number
  otherCount: number
  totalCuratedUsd: number
  /** Herfindahl-Hirschman Index on the curated portion. 0–10,000. */
  hhi: number
  /** Top-3 share for the auto insight line. */
  top3SharePct: number
  /** Number of curators currently active (excluding the Uncurated bucket). */
  curatedCount: number
}

function buildStats(rows: CuratorLeaderboardRow[]): ConcentrationStats | null {
  const curated = rows.filter((r) => r.name.toLowerCase() !== "uncurated")
  const totalCuratedUsd = curated.reduce((s, r) => s + r.totalAssetsUsd, 0)
  if (totalCuratedUsd <= 0 || curated.length === 0) return null

  const sorted = [...curated].sort((a, b) => b.totalAssetsUsd - a.totalAssetsUsd)
  const top5 = sorted.slice(0, 5)
  const tail = sorted.slice(5)
  const segments: Segment[] = top5.map((r, i) => ({
    name: r.name,
    usd: r.totalAssetsUsd,
    sharePct: (r.totalAssetsUsd / totalCuratedUsd) * 100,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }))
  const otherUsd = tail.reduce((s, r) => s + r.totalAssetsUsd, 0)
  const otherSharePct = totalCuratedUsd > 0 ? (otherUsd / totalCuratedUsd) * 100 : 0

  // HHI = sum of squared market shares (in percentage points). The classic
  // antitrust convention is a 0-10,000 scale; >2,500 = highly concentrated.
  const hhi = sorted.reduce((s, r) => {
    const sharePct = (r.totalAssetsUsd / totalCuratedUsd) * 100
    return s + sharePct * sharePct
  }, 0)

  const top3SharePct = sorted
    .slice(0, 3)
    .reduce((s, r) => s + (r.totalAssetsUsd / totalCuratedUsd) * 100, 0)

  return {
    segments,
    otherSharePct,
    otherUsd,
    otherCount: tail.length,
    totalCuratedUsd,
    hhi,
    top3SharePct,
    curatedCount: curated.length,
  }
}

function classifyHhi(hhi: number): { label: string; tone: "warn" | "info" | "good" } {
  // Antitrust thresholds: <1,500 unconcentrated, 1,500-2,500 moderately,
  // >2,500 highly. Mapped to dashboard tones.
  if (hhi >= 2500) return { label: "highly concentrated", tone: "warn" }
  if (hhi >= 1500) return { label: "moderately concentrated", tone: "info" }
  return { label: "competitive", tone: "good" }
}

export function MorphoCuratorConcentration({ rows }: Props) {
  const stats = useMemo(() => buildStats(rows), [rows])
  if (!stats) return null

  const classification = classifyHhi(stats.hhi)
  const toneColor =
    classification.tone === "warn"
      ? "var(--accent-yellow)"
      : classification.tone === "good"
      ? "var(--success)"
      : "var(--accent-blue)"


  return (
    <div className="space-y-2">
      <div className="tui-card bg-card-bg border border-card-border rounded overflow-hidden">
        <div
          className="border-b border-card-border flex items-center justify-between flex-wrap gap-2"
          style={{ padding: "10px 16px" }}
        >
          <span
            className="text-accent flex items-center gap-1.5"
            style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            Curator Concentration
            <MethodologyTooltip methodologyKey="morpho-curator-concentration" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
            Curated TVL · {formatUSD(stats.totalCuratedUsd)}
          </span>
        </div>

        {/* HHI headline + classification */}
        <div
          className="flex items-baseline gap-3 flex-wrap"
          style={{ padding: "16px 16px 8px" }}
        >
          <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>
            HHI
          </span>
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: toneColor }}
          >
            {Math.round(stats.hhi).toLocaleString()}
          </span>
          <span className="text-[11px]" style={{ color: toneColor, fontWeight: 500 }}>
            {classification.label}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            antitrust convention: &lt;1,500 competitive · 1,500–2,500 moderate · &gt;2,500 highly concentrated
          </span>
        </div>

        {/* Stacked bar */}
        <div
          className="flex w-full rounded overflow-hidden"
          style={{
            height: 24,
            margin: "0 16px",
            width: "calc(100% - 32px)",
            background: "var(--card-border)",
          }}
        >
          {stats.segments.map((seg) => (
            <div
              key={seg.name}
              title={`${seg.name} — ${formatUSD(seg.usd)} (${formatPercent(seg.sharePct, 1)})`}
              style={{
                width: `${seg.sharePct}%`,
                background: seg.color,
                opacity: 0.9,
              }}
            />
          ))}
          {stats.otherUsd > 0 && (
            <div
              title={`Other ${stats.otherCount} curators — ${formatUSD(stats.otherUsd)} (${formatPercent(
                stats.otherSharePct,
                1,
              )})`}
              style={{
                width: `${stats.otherSharePct}%`,
                background: OTHER_COLOR,
              }}
            />
          )}
        </div>

        {/* Legend */}
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]"
          style={{ padding: "10px 16px 12px" }}
        >
          {stats.segments.map((seg) => (
            <div key={seg.name} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: seg.color }}
              />
              <span style={{ color: "var(--text-secondary)" }}>{seg.name}</span>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatPercent(seg.sharePct, 1)}
              </span>
            </div>
          ))}
          {stats.otherUsd > 0 && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: OTHER_COLOR }}
              />
              <span style={{ color: "var(--text-secondary)" }}>
                Other ({stats.otherCount} curators)
              </span>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatPercent(stats.otherSharePct, 1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
