/**
 * Reconciliation gate. Fails the publish workflow if any cited figure in
 * the report has drifted from its independent source.
 *
 * Usage:
 *   npm run gate                              # run against the seed manifest
 *   npm run gate -- --manifest <path>         # custom manifest
 *   npm run gate -- --report-json <path>      # write structured JSON to disk
 *   npm run gate -- --pr-comment              # also emit a Markdown PR-comment block
 *   npm run gate -- --quiet                   # only print failures
 *
 * Exit codes:
 *   0  all checks passed (or only warnings)
 *   1  one or more cross-check failures (cited_value drifted from reality)
 *   2  manifest read error or unrecoverable executor error
 *
 * See docs/reconciliation-gate.md for the full operator guide.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import {
  runCrossCheck,
  divergencePct,
  type CrossCheckSpec,
  type CrossCheckResult,
} from "./lib/reconciliation-checks"

interface ManifestEntry {
  id: string
  issue: string
  section_anchors: string[]
  cited_value: number
  unit: string
  rounded_cited_in_prose?: number
  alt_forms_in_prose?: string[]
  cross_check: CrossCheckSpec
  threshold_pct: number
  absolute_threshold?: number
  /**
   * Plain-text substrings the entry has previously been wrong about. If any of
   * these appears in the prose being checked, the entry fails with reason
   * "historical_wrong_value_detected". This catches copy-paste regressions
   * from old drafts.
   */
  historical_wrong_alarms?: string[]
  last_verified_at: string
  notes?: string
  threshold_pct_notes?: string
}

interface Manifest {
  schema_version: number
  description: string
  global_config: {
    default_threshold_pct: number
    derivation_trail_warnings_block_merge: boolean
    derivation_trail_warning_severity: string
  }
  entries: ManifestEntry[]
}

type Verdict = "passed" | "failed" | "manual_pending" | "executor_error"

interface CheckOutcome {
  id: string
  verdict: Verdict
  failure_reason?: "cross_check_divergence" | "historical_wrong_value_detected" | "executor_error"
  cited_value: number
  cross_check_value: number | null
  divergence_pct: number | null
  threshold_pct: number
  absolute_threshold: number | null
  unit: string
  section_anchors: string[]
  source_description: string
  method: string
  /** Substrings from historical_wrong_alarms that hit when scanning prose. */
  prose_alarms_hit: string[]
  error?: string
  warnings: string[]
  notes?: string
}

interface GateReport {
  generated_at_utc: string
  manifest_path: string
  total_entries: number
  passed: number
  failed: number
  manual_pending: number
  executor_errors: number
  exit_code: 0 | 1 | 2
  outcomes: CheckOutcome[]
}

const ARGS = parseArgs(process.argv.slice(2))

function parseArgs(argv: string[]): {
  manifest: string
  reportJson?: string
  prComment: boolean
  quiet: boolean
  prose?: string
} {
  const out = {
    manifest: "content/snapshots/manifest.json",
    reportJson: undefined as string | undefined,
    prComment: false,
    quiet: false,
    prose: undefined as string | undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--manifest") out.manifest = argv[++i]
    else if (a === "--report-json") out.reportJson = argv[++i]
    else if (a === "--pr-comment") out.prComment = true
    else if (a === "--quiet") out.quiet = true
    else if (a === "--prose") out.prose = argv[++i]
  }
  return out
}

/** Returns the prose-side alarms that hit. Empty array = no regression detected. */
function scanProseForAlarms(entry: ManifestEntry, prose: string): string[] {
  if (!entry.historical_wrong_alarms?.length) return []
  return entry.historical_wrong_alarms.filter((alarm) =>
    prose.toLowerCase().includes(alarm.toLowerCase())
  )
}

function loadManifest(rel: string): Manifest {
  const full = path.resolve(rel)
  if (!fs.existsSync(full)) {
    console.error(`[gate] manifest not found: ${full}`)
    process.exit(2)
  }
  const raw = JSON.parse(fs.readFileSync(full, "utf-8")) as Manifest
  if (raw.schema_version !== 1) {
    console.error(`[gate] unsupported manifest schema_version: ${raw.schema_version}`)
    process.exit(2)
  }
  return raw
}

function effectiveThreshold(entry: ManifestEntry, defaultPct: number): number {
  return entry.threshold_pct ?? defaultPct
}

function evaluateOutcome(
  entry: ManifestEntry,
  result: CrossCheckResult,
  effectivePctThreshold: number
): Verdict {
  if (result.is_manual) return "manual_pending"
  if (result.value == null) return "executor_error"
  const div = divergencePct(entry.cited_value, result.value)
  const absDiff = Math.abs(result.value - entry.cited_value)
  // Absolute-threshold override for near-zero readings (e.g., RYS at parity).
  if (entry.absolute_threshold != null && absDiff <= entry.absolute_threshold) return "passed"
  return div <= effectivePctThreshold ? "passed" : "failed"
}

async function checkOne(
  entry: ManifestEntry,
  manifest: Manifest,
  proseText: string | null
): Promise<CheckOutcome> {
  const threshold = effectiveThreshold(entry, manifest.global_config.default_threshold_pct)
  const proseAlarms = proseText ? scanProseForAlarms(entry, proseText) : []
  try {
    const result = await runCrossCheck(entry.cross_check)
    let verdict = evaluateOutcome(entry, result, threshold)
    let failureReason: CheckOutcome["failure_reason"]
    if (verdict === "failed") failureReason = "cross_check_divergence"
    // Prose alarms override a passing cross-check: a deprecated wrong value
    // in the prose fails the entry regardless of cross-check status.
    if (proseAlarms.length > 0 && verdict !== "executor_error") {
      verdict = "failed"
      failureReason = "historical_wrong_value_detected"
    }
    const div =
      result.value == null ? null : divergencePct(entry.cited_value, result.value)
    return {
      id: entry.id,
      verdict,
      failure_reason: failureReason,
      cited_value: entry.cited_value,
      cross_check_value: result.value,
      divergence_pct: div,
      threshold_pct: threshold,
      absolute_threshold: entry.absolute_threshold ?? null,
      unit: entry.unit,
      section_anchors: entry.section_anchors,
      source_description: result.source_description,
      method: result.method,
      prose_alarms_hit: proseAlarms,
      warnings: result.warnings,
      notes: entry.notes,
    }
  } catch (err) {
    return {
      id: entry.id,
      verdict: "executor_error",
      failure_reason: "executor_error",
      cited_value: entry.cited_value,
      cross_check_value: null,
      divergence_pct: null,
      threshold_pct: threshold,
      absolute_threshold: entry.absolute_threshold ?? null,
      unit: entry.unit,
      section_anchors: entry.section_anchors,
      source_description: "n/a",
      method: entry.cross_check.method,
      prose_alarms_hit: proseAlarms,
      error: err instanceof Error ? err.message : String(err),
      warnings: [],
      notes: entry.notes,
    }
  }
}

function fmtValue(v: number | null, unit: string): string {
  if (v == null) return "n/a"
  if (unit === "%") return `${v.toFixed(2)}%`
  if (unit === "bps") return `${v.toFixed(2)} bps`
  if (unit === "USD") return `$${v.toLocaleString()}`
  return String(v)
}

const ICONS: Record<Verdict, string> = {
  passed: "[OK]",
  failed: "[FAIL]",
  manual_pending: "[MANUAL]",
  executor_error: "[ERROR]",
}

function printHumanSummary(report: GateReport, quiet: boolean): void {
  const lines: string[] = []
  lines.push(`Reconciliation Gate — ${report.generated_at_utc}`)
  lines.push(`Manifest: ${report.manifest_path}`)
  lines.push(
    `Total ${report.total_entries} entries · ${report.passed} passed · ${report.failed} failed · ${report.manual_pending} manual · ${report.executor_errors} executor errors`
  )
  lines.push("")
  for (const o of report.outcomes) {
    if (quiet && o.verdict === "passed") continue
    const cited = fmtValue(o.cited_value, o.unit)
    const cross = fmtValue(o.cross_check_value, o.unit)
    const div = o.divergence_pct == null ? "n/a" : `${o.divergence_pct.toFixed(2)}%`
    lines.push(`${ICONS[o.verdict]} ${o.id}`)
    lines.push(`    cited:       ${cited}  (sections: ${o.section_anchors.join(", ")})`)
    lines.push(`    cross-check: ${cross}  (via ${o.method})`)
    lines.push(
      `    divergence:  ${div}  (threshold ${o.threshold_pct}%${o.absolute_threshold != null ? `, abs ${o.absolute_threshold}` : ""})`
    )
    lines.push(`    source:      ${o.source_description}`)
    if (o.failure_reason) lines.push(`    reason:      ${o.failure_reason}`)
    if (o.prose_alarms_hit.length) {
      lines.push(`    prose-alarms-hit:`)
      for (const alarm of o.prose_alarms_hit) lines.push(`        - "${alarm}"`)
    }
    if (o.error) lines.push(`    error:       ${o.error}`)
    if (o.warnings.length) lines.push(`    warnings:    ${o.warnings.join(" | ")}`)
    lines.push("")
  }
  process.stdout.write(lines.join("\n") + "\n")
}

function printPrComment(report: GateReport): void {
  const head = report.exit_code === 0 ? "Reconciliation Gate — PASS" : "Reconciliation Gate — FAIL"
  const out: string[] = []
  out.push(`### ${head}`)
  out.push("")
  out.push(
    `**${report.passed} passed**  ·  **${report.failed} failed**  ·  ${report.manual_pending} manual  ·  ${report.executor_errors} executor errors  ·  ${report.total_entries} total entries`
  )
  out.push("")
  out.push("| Status | Entry | Cited | Cross-check | Divergence | Threshold |")
  out.push("|---|---|---|---|---|---|")
  for (const o of report.outcomes) {
    const cited = fmtValue(o.cited_value, o.unit)
    const cross = fmtValue(o.cross_check_value, o.unit)
    const div = o.divergence_pct == null ? "—" : `${o.divergence_pct.toFixed(2)}%`
    const thr = `${o.threshold_pct}%${o.absolute_threshold != null ? ` (abs ${o.absolute_threshold})` : ""}`
    const status = o.verdict === "passed" ? "✅" : o.verdict === "failed" ? "❌" : o.verdict === "manual_pending" ? "👀" : "⚠️"
    out.push(`| ${status} | \`${o.id}\` | ${cited} | ${cross} | ${div} | ${thr} |`)
  }
  out.push("")
  const failed = report.outcomes.filter((o) => o.verdict === "failed")
  if (failed.length) {
    out.push("#### Failed entries")
    for (const o of failed) {
      out.push(`- **${o.id}** (${o.section_anchors.join(", ")}): cited ${fmtValue(o.cited_value, o.unit)} vs cross-check ${fmtValue(o.cross_check_value, o.unit)} — divergence ${o.divergence_pct?.toFixed(2)}% exceeds threshold ${o.threshold_pct}%`)
      if (o.notes) out.push(`  > ${o.notes}`)
    }
    out.push("")
    out.push(
      "To override (only when the cross-check itself is wrong), add the `reconciliation-override` label to this PR. The override requires a reviewer attestation."
    )
  }
  out.push("")
  out.push("_Generated by `scripts/reconciliation-gate.ts`. See `docs/reconciliation-gate.md` for the operator guide._")
  process.stdout.write("---PR_COMMENT_START---\n" + out.join("\n") + "\n---PR_COMMENT_END---\n")
}

async function main(): Promise<void> {
  const manifest = loadManifest(ARGS.manifest)
  let proseText: string | null = null
  if (ARGS.prose) {
    if (!fs.existsSync(ARGS.prose)) {
      console.error(`[gate] --prose file not found: ${ARGS.prose}`)
      process.exit(2)
    }
    proseText = fs.readFileSync(ARGS.prose, "utf-8")
    console.error(`[gate] prose-side regression check enabled (input: ${ARGS.prose})`)
  }
  const outcomes: CheckOutcome[] = []
  for (const entry of manifest.entries) {
    const o = await checkOne(entry, manifest, proseText)
    outcomes.push(o)
  }
  const passed = outcomes.filter((o) => o.verdict === "passed").length
  const failed = outcomes.filter((o) => o.verdict === "failed").length
  const manualPending = outcomes.filter((o) => o.verdict === "manual_pending").length
  const executorErrors = outcomes.filter((o) => o.verdict === "executor_error").length
  const exitCode: 0 | 1 | 2 = executorErrors > 0 ? 2 : failed > 0 ? 1 : 0
  const report: GateReport = {
    generated_at_utc: new Date().toISOString(),
    manifest_path: path.resolve(ARGS.manifest),
    total_entries: manifest.entries.length,
    passed,
    failed,
    manual_pending: manualPending,
    executor_errors: executorErrors,
    exit_code: exitCode,
    outcomes,
  }
  printHumanSummary(report, ARGS.quiet)
  if (ARGS.prComment) printPrComment(report)
  if (ARGS.reportJson) {
    fs.writeFileSync(ARGS.reportJson, JSON.stringify(report, null, 2))
    console.log(`[gate] structured report written to ${ARGS.reportJson}`)
  }
  process.exit(exitCode)
}

main().catch((err) => {
  console.error("[gate] unhandled error:", err instanceof Error ? err.stack : err)
  process.exit(2)
})
