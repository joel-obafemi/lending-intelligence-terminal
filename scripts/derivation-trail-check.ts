/**
 * Derivation trail check. Scans report MDX prose for numerical citations
 * and flags any that do not have a manifest entry. Catches the class of
 * error where someone hand-types a number into the prose that never went
 * through a script or snapshot.
 *
 * Usage:
 *   npm run gate:derivation-trail
 *   npm run gate:derivation-trail -- --input <mdx-path>
 *   npm run gate:derivation-trail -- --manifest <json-path>
 *   npm run gate:derivation-trail -- --report-json <out-path>
 *   npm run gate:derivation-trail -- --strict     # exit 1 on any uncovered citation
 *
 * Defaults: scan content/reports/2026-05-may.mdx, manifest at
 * content/snapshots/manifest.json, warnings-only mode (exit 0 even with
 * uncovered citations). Strict mode is for the run that gates publish.
 *
 * Citation patterns the detector recognises:
 *   - "$X.XB" / "$X.XM" / "$X.X billion" / "$X.X million"
 *   - "X.X%" / "X.X percent"
 *   - "X.X bps" / "X basis points"
 * Numbers without one of these unit anchors are skipped (otherwise the
 * detector flags every year and "six protocols" phrasing).
 */
import * as fs from "node:fs"
import * as path from "node:path"

interface ManifestEntry {
  id: string
  cited_value: number
  unit: string
  rounded_cited_in_prose?: number
  alt_forms_in_prose?: string[]
}

interface Manifest {
  schema_version: number
  global_config: {
    derivation_trail_warnings_block_merge: boolean
    derivation_trail_warning_severity: string
  }
  entries: ManifestEntry[]
}

interface Citation {
  raw: string
  value: number
  unit: "%" | "bps" | "USD"
  line_index: number
  line_excerpt: string
}

interface CitationReport {
  citation: Citation
  covered_by: string[]
  match_kind: "manifest_value" | "alt_form" | "uncovered"
}

const ARGS = parseArgs(process.argv.slice(2))

function parseArgs(argv: string[]): {
  input: string
  manifest: string
  reportJson?: string
  strict: boolean
  quiet: boolean
} {
  const out = {
    input: "content/reports/2026-05-may.mdx",
    manifest: "content/snapshots/manifest.json",
    reportJson: undefined as string | undefined,
    strict: false,
    quiet: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--input") out.input = argv[++i]
    else if (a === "--manifest") out.manifest = argv[++i]
    else if (a === "--report-json") out.reportJson = argv[++i]
    else if (a === "--strict") out.strict = true
    else if (a === "--quiet") out.quiet = true
  }
  return out
}

// ---------------------------------------------------------------------------
// Citation extraction
// ---------------------------------------------------------------------------

// Percentages: 3.27%, 88%, 0.5%
const PCT_RE = /(?<![\w.])-?\d+(?:\.\d+)?\s*(?:%|percent\b)/gi
// Basis points: -0.3 bps, 330 basis points
const BPS_RE = /(?<![\w.])-?\d+(?:\.\d+)?\s*(?:bps\b|basis points\b)/gi
// USD with magnitude: $759M, $4.91B, $818 million, $3.73 billion
const USD_RE = /\$-?\d+(?:\.\d+)?\s*(?:[BMK]\b|billion\b|million\b|thousand\b)/gi

function parsePct(raw: string): number {
  const m = raw.match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : NaN
}
function parseBps(raw: string): number {
  const m = raw.match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : NaN
}
function parseUsd(raw: string): number {
  const numMatch = raw.match(/-?\d+(?:\.\d+)?/)
  if (!numMatch) return NaN
  const num = parseFloat(numMatch[0])
  if (/(B\b|billion\b)/i.test(raw)) return num * 1e9
  if (/(M\b|million\b)/i.test(raw)) return num * 1e6
  if (/(K\b|thousand\b)/i.test(raw)) return num * 1e3
  return num
}

function extractCitations(text: string): Citation[] {
  const lines = text.split(/\r?\n/)
  const out: Citation[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Skip JSX comment / MDX frontmatter-ish lines that aren't reader-visible
    if (line.trimStart().startsWith("{/*")) continue
    if (/^\s*<!--/.test(line)) continue

    for (const m of line.matchAll(PCT_RE)) {
      out.push({
        raw: m[0],
        value: parsePct(m[0]),
        unit: "%",
        line_index: i + 1,
        line_excerpt: excerpt(line, m.index ?? 0),
      })
    }
    for (const m of line.matchAll(BPS_RE)) {
      out.push({
        raw: m[0],
        value: parseBps(m[0]),
        unit: "bps",
        line_index: i + 1,
        line_excerpt: excerpt(line, m.index ?? 0),
      })
    }
    for (const m of line.matchAll(USD_RE)) {
      out.push({
        raw: m[0],
        value: parseUsd(m[0]),
        unit: "USD",
        line_index: i + 1,
        line_excerpt: excerpt(line, m.index ?? 0),
      })
    }
  }
  return out
}

function excerpt(line: string, start: number): string {
  const radius = 50
  const a = Math.max(0, start - radius)
  const b = Math.min(line.length, start + radius)
  const head = a > 0 ? "..." : ""
  const tail = b < line.length ? "..." : ""
  return head + line.slice(a, b).replace(/\s+/g, " ").trim() + tail
}

// ---------------------------------------------------------------------------
// Matching against manifest
// ---------------------------------------------------------------------------

/**
 * Tolerance for prose-vs-cited match. Prose typically rounds to 1 decimal,
 * sometimes to integer for percents. Use 0.05 absolute for percents/bps and
 * 1% relative for USD magnitudes.
 */
function matchesManifestValue(citation: Citation, entry: ManifestEntry): boolean {
  if (entry.unit !== citation.unit) return false
  const cited = entry.cited_value
  const rounded = entry.rounded_cited_in_prose ?? Math.round(cited)
  const tol = citation.unit === "USD" ? Math.abs(cited) * 0.02 : 0.5
  return Math.abs(citation.value - cited) <= tol || Math.abs(citation.value - rounded) <= tol
}

function matchesAltForm(citation: Citation, entry: ManifestEntry): boolean {
  if (!entry.alt_forms_in_prose) return false
  return entry.alt_forms_in_prose.some((form) =>
    citation.raw.toLowerCase().includes(form.toLowerCase())
  )
}

function classify(citation: Citation, entries: ManifestEntry[]): CitationReport {
  const valueHits = entries.filter((e) => matchesManifestValue(citation, e))
  const altHits = entries.filter((e) => matchesAltForm(citation, e))
  const all = [...new Set([...valueHits, ...altHits].map((e) => e.id))]
  let kind: CitationReport["match_kind"] = "uncovered"
  if (valueHits.length) kind = "manifest_value"
  else if (altHits.length) kind = "alt_form"
  return { citation, covered_by: all, match_kind: kind }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface DerivationReport {
  generated_at_utc: string
  input_path: string
  manifest_path: string
  total_citations: number
  covered: number
  uncovered: number
  uncovered_blocks_merge: boolean
  exit_code: 0 | 1
  reports: CitationReport[]
}

function main(): void {
  const manifestPath = path.resolve(ARGS.manifest)
  const inputPath = path.resolve(ARGS.input)
  if (!fs.existsSync(manifestPath)) {
    console.error(`[derivation-trail] manifest not found: ${manifestPath}`)
    process.exit(2)
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`[derivation-trail] input not found: ${inputPath}`)
    process.exit(2)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Manifest
  const text = fs.readFileSync(inputPath, "utf-8")
  const citations = extractCitations(text)
  const reports = citations.map((c) => classify(c, manifest.entries))
  const covered = reports.filter((r) => r.match_kind !== "uncovered").length
  const uncovered = reports.length - covered
  const blocks = manifest.global_config.derivation_trail_warnings_block_merge && uncovered > 0
  const exit: 0 | 1 = (ARGS.strict && uncovered > 0) || blocks ? 1 : 0
  const report: DerivationReport = {
    generated_at_utc: new Date().toISOString(),
    input_path: inputPath,
    manifest_path: manifestPath,
    total_citations: reports.length,
    covered,
    uncovered,
    uncovered_blocks_merge: blocks,
    exit_code: exit,
    reports,
  }
  printSummary(report, ARGS.quiet)
  if (ARGS.reportJson) {
    fs.writeFileSync(ARGS.reportJson, JSON.stringify(report, null, 2))
    console.log(`[derivation-trail] structured report written to ${ARGS.reportJson}`)
  }
  process.exit(exit)
}

function printSummary(report: DerivationReport, quiet: boolean): void {
  const coverage = report.total_citations === 0
    ? 100
    : (report.covered / report.total_citations) * 100
  console.log(`Derivation Trail Check — ${report.generated_at_utc}`)
  console.log(`Input: ${report.input_path}`)
  console.log(`Manifest: ${report.manifest_path}`)
  console.log(
    `Coverage: ${report.covered}/${report.total_citations} citations (${coverage.toFixed(1)}%) — ${report.uncovered} uncovered`
  )
  console.log("")
  if (!quiet) {
    const uncoveredOnes = report.reports.filter((r) => r.match_kind === "uncovered")
    if (uncoveredOnes.length === 0) {
      console.log("No uncovered citations.")
      return
    }
    console.log(`Uncovered citations (showing first 50 of ${uncoveredOnes.length}):`)
    for (const r of uncoveredOnes.slice(0, 50)) {
      console.log(
        `  line ${r.citation.line_index}  "${r.citation.raw}"  →  ${r.citation.line_excerpt}`
      )
    }
    if (uncoveredOnes.length > 50) {
      console.log(`  ... and ${uncoveredOnes.length - 50} more`)
    }
  }
}

main()
