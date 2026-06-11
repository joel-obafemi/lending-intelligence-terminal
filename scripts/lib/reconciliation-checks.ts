/**
 * Cross-check executors used by the reconciliation gate.
 *
 * Each method takes a manifest cross_check spec and returns the independent
 * value that should be compared against the manifest's cited_value. Methods
 * are deterministic where possible (derived_from_snapshot) and live-fetching
 * where unavoidable (http_json, graphql, onchain). The gate dispatches on
 * `method` and treats every executor as `(spec) => Promise<number>`.
 *
 * Adding a new method:
 *   1. Add a branch to runCrossCheck()
 *   2. Implement the executor below
 *   3. Document it in docs/reconciliation-gate.md under "Supported methods"
 */
import * as fs from "node:fs"
import * as path from "node:path"

export type CrossCheckMethod =
  | "derived_from_snapshot"
  | "http_json"
  | "graphql"
  | "onchain"
  | "manual"

export interface CrossCheckSpec {
  method: CrossCheckMethod
  snapshot?: string
  derive?: string
  endpoint?: string
  query?: string
  params?: Record<string, unknown>
}

export interface CrossCheckResult {
  value: number | null
  source_description: string
  raw_inputs?: Record<string, unknown>
  method: CrossCheckMethod
  is_manual: boolean
  warnings: string[]
}

const REPO_ROOT = path.resolve(__dirname, "../..")

function readSnapshot(rel: string): unknown {
  const full = path.join(REPO_ROOT, rel)
  if (!fs.existsSync(full)) {
    throw new Error(`Snapshot not found: ${rel} (resolved to ${full})`)
  }
  return JSON.parse(fs.readFileSync(full, "utf-8"))
}

/** Walk a dot/bracket path through an object. Supports "a.b.c" and "a[].b". */
function fieldByPath(obj: unknown, p: string): unknown {
  const parts = p.split(".")
  let cur: unknown = obj
  for (const part of parts) {
    if (cur == null) return undefined
    if (part.endsWith("[]")) {
      const key = part.slice(0, -2)
      if (key) cur = (cur as Record<string, unknown>)[key]
      // Caller is expected to filter the array further — returning as-is
      return cur
    }
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

// ---------------------------------------------------------------------------
// derived_from_snapshot — read a checked-in JSON and apply a named derive fn
// ---------------------------------------------------------------------------

type DeriveFn = (snap: unknown, params: Record<string, unknown>) => number

const DERIVERS: Record<string, DeriveFn> = {
  /** Read a single scalar at `params.field_path`. */
  field: (snap, params) => {
    const fp = String(params.field_path ?? "")
    if (!fp) throw new Error("field deriver requires params.field_path")
    const v = fieldByPath(snap, fp)
    if (typeof v !== "number") {
      throw new Error(
        `field deriver expected number at ${fp}, got ${typeof v}: ${JSON.stringify(v).slice(0, 100)}`
      )
    }
    return v
  },

  /**
   * Compute Aave V3's share of sector LRT collateral at the target date.
   * Reads per_protocol[] and sector{}.total_usd from 2026-05-lrt-collateral.json.
   */
  aave_v3_lrt_share_pct: (snap, params) => {
    const target = String(params.target_date ?? "2026-05-31")
    const dateKey = target.replace("2026-05-31", "may_31").replace("2026-04-30", "apr_30")
    const root = snap as Record<string, unknown>
    const sector = root.sector as Record<string, Record<string, unknown>>
    const sectorTotal = (sector[dateKey] as Record<string, number>).total_usd
    if (!sectorTotal) throw new Error(`No sector.${dateKey}.total_usd in snapshot`)

    const protos = root.per_protocol as Array<Record<string, unknown>>
    const aave = protos.find((p) => p.protocol_slug === "aave-v3")
    if (!aave) throw new Error("No aave-v3 entry in per_protocol")

    const aaveByLrt = (aave[dateKey] as Record<string, Record<string, number>>).by_lrt
    const aaveTotal = Object.values(aaveByLrt).reduce((a, b) => a + b, 0)

    return (aaveTotal / sectorTotal) * 100
  },

  /**
   * Read supply APY at the target month-end for a (asset, protocol) pair
   * out of 2026-05-rate-dispersion.json's may31.per_protocol[] structure.
   */
  per_asset_per_protocol_apy: (snap, params) => {
    const asset = String(params.asset ?? "USDC")
    const slug = String(params.protocol_slug ?? "aave-v3")
    const root = snap as Record<string, unknown>
    const perAsset = (root.per_asset as Array<Record<string, unknown>>) ?? []
    const assetEntry = perAsset.find((a) => a.asset === asset)
    if (!assetEntry) throw new Error(`No per_asset entry for ${asset}`)
    const may31 = assetEntry.may31 as Record<string, unknown>
    const perProto = (may31.per_protocol as Array<Record<string, unknown>>) ?? []
    const row = perProto.find((r) => r.protocol_slug === slug)
    if (!row) throw new Error(`No ${asset} per_protocol entry for ${slug}`)
    const apy = row.supply_apy_pct
    if (typeof apy !== "number") throw new Error(`supply_apy_pct not a number for ${slug}`)
    return apy
  },

  /**
   * Find a numeric field on the matching entry in an array.
   * params: { array_path, match_key, match_value, field }
   * Example for Euler V2 LDR from 2026-05-ldr-per-protocol.json:
   *   { array_path: "ranking", match_key: "slug", match_value: "euler-v2", field: "ldr_pct" }
   */
  find_in_array_field: (snap, params) => {
    const arrayPath = String(params.array_path ?? "")
    const matchKey = String(params.match_key ?? "")
    const matchValue = params.match_value
    const field = String(params.field ?? "")
    if (!arrayPath || !matchKey || matchValue == null || !field) {
      throw new Error("find_in_array_field requires array_path, match_key, match_value, field")
    }
    const arr = fieldByPath(snap, arrayPath)
    if (!Array.isArray(arr)) {
      throw new Error(`find_in_array_field: ${arrayPath} is not an array`)
    }
    const row = arr.find((r) => (r as Record<string, unknown>)[matchKey] === matchValue)
    if (!row) {
      throw new Error(`find_in_array_field: no entry where ${matchKey}=${matchValue} in ${arrayPath}`)
    }
    const v = (row as Record<string, unknown>)[field]
    if (typeof v !== "number") {
      throw new Error(`find_in_array_field: ${field} is not a number on matched entry`)
    }
    return v
  },

  /**
   * Sector take rate from raw inputs:
   *   trailing_30d_fees × (365/30) ÷ available_liquidity × 100
   */
  take_rate_formula: (snap, params) => {
    const feesField = String(params.fees_field ?? "trailing_30d_ethereum_fees_usd")
    const liqField = String(params.liquidity_field ?? "available_liquidity_usd")
    const root = snap as Record<string, number>
    const fees = root[feesField]
    const liq = root[liqField]
    if (typeof fees !== "number" || typeof liq !== "number") {
      throw new Error(`take_rate_formula: missing ${feesField} or ${liqField}`)
    }
    return ((fees * (365 / 30)) / liq) * 100
  },
}

async function runDerivedFromSnapshot(spec: CrossCheckSpec): Promise<CrossCheckResult> {
  if (!spec.snapshot) throw new Error("derived_from_snapshot requires .snapshot")
  const deriveKey = String(spec.derive ?? "field")
  const deriver = DERIVERS[deriveKey]
  if (!deriver) throw new Error(`Unknown deriver: ${deriveKey}`)
  const snap = readSnapshot(spec.snapshot)
  const value = deriver(snap, spec.params ?? {})
  return {
    value,
    source_description: `${spec.snapshot} via ${deriveKey}(${JSON.stringify(spec.params ?? {})})`,
    method: "derived_from_snapshot",
    is_manual: false,
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// http_json — GET a URL, traverse JSON
// ---------------------------------------------------------------------------

async function runHttpJson(spec: CrossCheckSpec): Promise<CrossCheckResult> {
  if (!spec.endpoint) throw new Error("http_json requires .endpoint")
  const url = spec.endpoint
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`http_json: ${url} returned ${res.status}`)
  const body = (await res.json()) as unknown
  const fp = String((spec.params ?? {}).field_path ?? "")
  if (!fp) throw new Error("http_json requires params.field_path")
  const v = fieldByPath(body, fp)
  if (typeof v !== "number") {
    throw new Error(`http_json: ${fp} on ${url} did not resolve to a number`)
  }
  return {
    value: v,
    source_description: `GET ${url} → ${fp}`,
    method: "http_json",
    is_manual: false,
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// graphql — POST a query, extract a field
// ---------------------------------------------------------------------------

async function runGraphql(spec: CrossCheckSpec): Promise<CrossCheckResult> {
  if (!spec.endpoint) throw new Error("graphql requires .endpoint")
  if (!spec.query) throw new Error("graphql requires .query")
  const res = await fetch(spec.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: spec.query, variables: spec.params ?? {} }),
  })
  if (!res.ok) throw new Error(`graphql: ${spec.endpoint} returned ${res.status}`)
  const body = (await res.json()) as { data?: unknown; errors?: unknown }
  if (body.errors) throw new Error(`graphql errors: ${JSON.stringify(body.errors)}`)
  const fp = String((spec.params ?? {}).field_path ?? "")
  const v = fieldByPath(body.data, fp)
  if (typeof v !== "number") throw new Error(`graphql: ${fp} did not resolve to a number`)
  return {
    value: v,
    source_description: `POST ${spec.endpoint} → ${fp}`,
    method: "graphql",
    is_manual: false,
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// onchain — placeholder. Plumbed for viem reads; requires RPC env var.
// ---------------------------------------------------------------------------

async function runOnchain(spec: CrossCheckSpec): Promise<CrossCheckResult> {
  void spec
  throw new Error(
    "onchain cross-check is not implemented in the seed gate. " +
      "Add a viem-based executor for the specific contract read your manifest entry needs."
  )
}

// ---------------------------------------------------------------------------
// manual — report cited_value back with an evidence URL for human review.
// The gate marks these as passing-with-attestation; CI surfaces them so a
// reviewer can confirm before merge.
// ---------------------------------------------------------------------------

async function runManual(spec: CrossCheckSpec): Promise<CrossCheckResult> {
  const evidence = (spec.params ?? {}).evidence_url
  if (!evidence) {
    throw new Error("manual cross-check requires params.evidence_url for human review")
  }
  return {
    value: null,
    source_description: `Manual attestation; evidence: ${evidence}`,
    method: "manual",
    is_manual: true,
    warnings: ["Manual entry — reviewer must confirm cited_value against evidence_url before merge."],
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function runCrossCheck(spec: CrossCheckSpec): Promise<CrossCheckResult> {
  switch (spec.method) {
    case "derived_from_snapshot":
      return runDerivedFromSnapshot(spec)
    case "http_json":
      return runHttpJson(spec)
    case "graphql":
      return runGraphql(spec)
    case "onchain":
      return runOnchain(spec)
    case "manual":
      return runManual(spec)
    default:
      throw new Error(`Unknown cross-check method: ${(spec as { method: string }).method}`)
  }
}

/**
 * Divergence percentage: |cross_check - cited| / max(|cited|, epsilon) × 100.
 * Returns Infinity for cited_value of 0 unless absolute_threshold is in play.
 */
export function divergencePct(citedValue: number, crossCheckValue: number): number {
  const denom = Math.max(Math.abs(citedValue), 1e-9)
  return (Math.abs(crossCheckValue - citedValue) / denom) * 100
}
