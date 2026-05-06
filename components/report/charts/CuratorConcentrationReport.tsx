"use client"

/**
 * Morpho curator concentration — single horizontal stacked bar of top-5
 * curators + Other, plus an HHI headline classifying the market.
 */
import { useMemo } from "react"
import { SERIES_COLORS, MUTED } from "./_shared"
import type { ChartRegistryParams } from "@/lib/reports/types"

interface CuratorRow {
  name: string
  totalAssetsUsd: number
}

interface Props {
  data: { rows: CuratorRow[] }
  params: ChartRegistryParams
}

function classifyHhi(hhi: number): { label: string; tone: "warn" | "info" | "good" } {
  if (hhi >= 2500) return { label: "highly concentrated", tone: "warn" }
  if (hhi >= 1500) return { label: "moderately concentrated", tone: "info" }
  return { label: "competitive", tone: "good" }
}

export function CuratorConcentrationReport({ data, params }: Props) {
  const stats = useMemo(() => {
    const curated = data.rows.filter((r) => r.name.toLowerCase() !== "uncurated")
    const total = curated.reduce((s, r) => s + r.totalAssetsUsd, 0)
    if (total <= 0) return null
    const sorted = [...curated].sort((a, b) => b.totalAssetsUsd - a.totalAssetsUsd)
    const top5 = sorted.slice(0, 5)
    const tail = sorted.slice(5)
    const hhi = sorted.reduce((s, r) => {
      const sharePct = (r.totalAssetsUsd / total) * 100
      return s + sharePct * sharePct
    }, 0)
    const top3SharePct = sorted
      .slice(0, 3)
      .reduce((s, r) => s + (r.totalAssetsUsd / total) * 100, 0)
    return {
      hhi,
      top5,
      tailUsd: tail.reduce((s, r) => s + r.totalAssetsUsd, 0),
      tailCount: tail.length,
      total,
      top3SharePct,
      top3Names: sorted.slice(0, 3).map((r) => r.name),
      curatedCount: curated.length,
    }
  }, [data.rows])

  if (!stats) {
    return (
      <div
        style={{
          height: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED,
          fontFamily: "var(--report-font-mono)",
          fontSize: 12,
        }}
      >
        No curator data available.
      </div>
    )
  }

  const cls = classifyHhi(stats.hhi)
  const toneColor =
    cls.tone === "warn" ? "#C5511A" : cls.tone === "good" ? "#10B981" : "#1F3A5F"

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "var(--report-font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: MUTED,
          }}
        >
          HHI
        </span>
        <span
          style={{
            fontFamily: "var(--report-font-serif)",
            fontWeight: 700,
            fontSize: 36,
            color: toneColor,
          }}
        >
          {Math.round(stats.hhi).toLocaleString()}
        </span>
        <span style={{ color: toneColor, fontWeight: 500 }}>{cls.label}</span>
        <span style={{ color: MUTED, fontSize: 11, fontFamily: "var(--report-font-mono)" }}>
          ≥2,500 highly concentrated · 1,500–2,500 moderate · &lt;1,500 competitive
        </span>
      </div>

      <div
        style={{
          display: "flex",
          width: "100%",
          height: 28,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        {stats.top5.map((c, i) => (
          <div
            key={c.name}
            title={`${c.name} — ${((c.totalAssetsUsd / stats.total) * 100).toFixed(1)}%`}
            style={{
              width: `${(c.totalAssetsUsd / stats.total) * 100}%`,
              background: SERIES_COLORS[i % SERIES_COLORS.length],
              opacity: 0.9,
            }}
          />
        ))}
        {stats.tailUsd > 0 && (
          <div
            title={`Other ${stats.tailCount} curators — ${((stats.tailUsd / stats.total) * 100).toFixed(1)}%`}
            style={{
              width: `${(stats.tailUsd / stats.total) * 100}%`,
              background: "#6B7280",
              opacity: 0.65,
            }}
          />
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12 }}>
        {stats.top5.map((c, i) => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: SERIES_COLORS[i % SERIES_COLORS.length],
              }}
            />
            <span style={{ fontFamily: "var(--report-font-serif)" }}>{c.name}</span>
            <span
              style={{
                fontFamily: "var(--report-font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: MUTED,
              }}
            >
              {((c.totalAssetsUsd / stats.total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
        {stats.tailUsd > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: "#6B7280",
                opacity: 0.65,
              }}
            />
            <span style={{ fontFamily: "var(--report-font-serif)" }}>Other ({stats.tailCount})</span>
            <span
              style={{
                fontFamily: "var(--report-font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: MUTED,
              }}
            >
              {((stats.tailUsd / stats.total) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <p
        style={{
          fontSize: 13,
          color: "var(--report-text-muted)",
          fontFamily: "var(--report-font-serif)",
          marginTop: 16,
          fontStyle: "italic",
        }}
      >
        {stats.top3Names.join(", ")} together hold {stats.top3SharePct.toFixed(1)}% of curated TVL across {stats.curatedCount} curators.
      </p>
    </div>
  )
}
