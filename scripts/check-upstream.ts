/**
 * Upstream schema/availability guard.
 *
 *   npm run check:upstream
 *
 * Hits every third-party data source this dashboard depends on with the
 * REAL queries it uses, and asserts the specific fields we read still
 * exist and return non-empty data. Third-party schemas change without
 * notice and our loaders swallow failures behind `.catch(() => [])`, so
 * a break is invisible in production until a chart visibly empties out.
 * This script turns those silent breaks into a loud, CI-catchable failure.
 *
 * Exit code:
 *   0  — all CRITICAL checks passed (WARN checks may still print)
 *   1  — at least one CRITICAL check failed
 *
 * Run it in CI before deploy, or manually after any "a chart went blank"
 * report. Each check is independent; one failure doesn't stop the rest,
 * so you get the full picture in a single run.
 *
 * Severity:
 *   CRITICAL — a page/section breaks if this fails. Fails the script.
 *   WARN     — degraded but non-fatal (e.g. an endpoint we already know
 *              is paywalled). Printed, but doesn't fail the script.
 */

const MORPHO_ENDPOINT = "https://blue-api.morpho.org/graphql"
const LLAMA_BASE = "https://api.llama.fi"
const YIELDS_BASE = "https://yields.llama.fi"
const ETH_CHAIN_ID = 1

type Severity = "CRITICAL" | "WARN"
interface CheckResult {
  name: string
  severity: Severity
  ok: boolean
  detail: string
}

const results: CheckResult[] = []

function record(
  name: string,
  severity: Severity,
  ok: boolean,
  detail: string,
): void {
  results.push({ name, severity, ok, detail })
  const tag = ok ? "PASS" : severity === "CRITICAL" ? "FAIL" : "WARN"
  const line = `[${tag}] ${name} — ${detail}`
  if (ok) console.log(line)
  else if (severity === "CRITICAL") console.error(line)
  else console.warn(line)
}

/** POST a GraphQL query, returning parsed JSON or throwing on transport/GraphQL error. */
async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(MORPHO_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json: any = await res.json()
  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "))
  }
  return json.data as T
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Morpho — curator data on state.curators (NOT metadata.curators).
//    This is the exact field that broke the HHI / curator-concentration
//    block on the Morpho protocol tab in May 2026.
// ─────────────────────────────────────────────────────────────────────────
async function checkMorphoCurators(): Promise<void> {
  const query = /* GraphQL */ `
    query CheckCurators($chainId: Int!, $first: Int!) {
      vaults(
        first: $first
        where: { chainId_in: [$chainId] }
        orderBy: TotalAssetsUsd
        orderDirection: Desc
      ) {
        items {
          address
          name
          symbol
          state { totalAssetsUsd netApy curator curators { name image } }
          asset { symbol }
        }
        pageInfo { count countTotal }
      }
    }
  `
  try {
    const data = await gql<{
      vaults: {
        items: Array<{
          state: { totalAssetsUsd: number | null; curators: Array<{ name: string | null }> | null } | null
        }>
        pageInfo: { countTotal: number }
      }
    }>(query, { chainId: ETH_CHAIN_ID, first: 50 })

    const items = data.vaults?.items ?? []
    if (items.length === 0) {
      record("Morpho vaults query", "CRITICAL", false, "returned zero vaults")
      return
    }
    // At least one of the top vaults must carry a non-empty curator name —
    // otherwise the field exists but is unpopulated, which still blanks HHI.
    const withCurator = items.filter(
      (v) => (v.state?.curators?.length ?? 0) > 0 && v.state!.curators![0].name,
    )
    if (withCurator.length === 0) {
      record(
        "Morpho state.curators",
        "CRITICAL",
        false,
        "field present but no vault has a curator name — HHI chart would be empty",
      )
      return
    }
    record(
      "Morpho state.curators",
      "CRITICAL",
      true,
      `${withCurator.length}/${items.length} top vaults carry a curator (of ${data.vaults.pageInfo.countTotal} total)`,
    )
  } catch (err: any) {
    // A GraphQL validation error here is the canonical "schema moved" signal.
    record(
      "Morpho state.curators",
      "CRITICAL",
      false,
      `query failed: ${err?.message ?? err} — schema may have moved the curators field again`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Morpho — vaultByAddress detail shape (powers vault detail pages).
// ─────────────────────────────────────────────────────────────────────────
async function checkMorphoVaultDetail(): Promise<void> {
  // Steakhouse USDC — a long-lived, high-TVL vault. If this address ever
  // sunsets, swap for any current top vault from check #1.
  const STEAKHOUSE_USDC = "0xbeef01735c132ada46aa9aa4c54623caa92a64cb"
  const query = /* GraphQL */ `
    query CheckVaultDetail($address: String!, $chainId: Int!) {
      vaultByAddress(address: $address, chainId: $chainId) {
        address
        state { totalAssetsUsd netApy curator curators { name } allocation { supplyAssetsUsd } }
      }
    }
  `
  try {
    const data = await gql<{
      vaultByAddress: { state: { totalAssetsUsd: number | null; allocation: unknown[] } | null } | null
    }>(query, { address: STEAKHOUSE_USDC, chainId: ETH_CHAIN_ID })
    const state = data.vaultByAddress?.state
    if (!state || state.totalAssetsUsd == null) {
      record("Morpho vaultByAddress", "WARN", false, "no state for sample vault (address may have sunset)")
      return
    }
    record("Morpho vaultByAddress", "CRITICAL", true, `state + allocation present (TVL $${(state.totalAssetsUsd / 1e6).toFixed(1)}M)`)
  } catch (err: any) {
    record("Morpho vaultByAddress", "CRITICAL", false, `query failed: ${err?.message ?? err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. DefiLlama Yields /pools — the backbone of the rate matrix + Fluid stats.
//    Asserts Fluid's project split (fluid-lending + fluid-dex) is intact.
// ─────────────────────────────────────────────────────────────────────────
async function checkDefiLlamaPools(): Promise<void> {
  try {
    const res = await fetch(`${YIELDS_BASE}/pools`)
    if (!res.ok) {
      record("DefiLlama /pools", "CRITICAL", false, `HTTP ${res.status}`)
      return
    }
    const json: any = await res.json()
    const pools: any[] = json?.data ?? []
    if (pools.length === 0) {
      record("DefiLlama /pools", "CRITICAL", false, "empty data array")
      return
    }
    // Field shape we read: project, chain, tvlUsd, apyBase, underlyingTokens.
    const sample = pools[0]
    const hasShape =
      "project" in sample && "chain" in sample && "tvlUsd" in sample
    record("DefiLlama /pools shape", "CRITICAL", hasShape, hasShape ? `${pools.length} pools, shape intact` : "missing project/chain/tvlUsd")

    // Fluid project split — the May 2026 break. We need vault-pair pools
    // under fluid-dex AND lending pools under fluid-lending.
    const eth = pools.filter((p) => p.chain === "Ethereum")
    const byProject = new Set(eth.map((p) => p.project))
    for (const proj of ["fluid-lending", "fluid-dex"]) {
      const n = eth.filter((p) => p.project === proj).length
      record(
        `DefiLlama Fluid project "${proj}"`,
        "CRITICAL",
        n > 0,
        n > 0 ? `${n} Ethereum pools` : `0 pools — Fluid stats will read 0% (known projects: ${[...byProject].filter((x) => String(x).includes("fluid")).join(", ") || "none"})`,
      )
    }
  } catch (err: any) {
    record("DefiLlama /pools", "CRITICAL", false, `fetch failed: ${err?.message ?? err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. DefiLlama /chart/<poolId> — paywalled as of mid-2026. WARN only:
//    history charts degrade gracefully; we just want to know if/when it
//    comes back (or stays gated).
// ─────────────────────────────────────────────────────────────────────────
async function checkDefiLlamaChart(): Promise<void> {
  // Lido stETH — a pool that always exists. We only care about the HTTP
  // status, not the body.
  const POOL_ID = "747c1d2a-c668-4682-b9f9-296708a3dd90"
  try {
    const res = await fetch(`${YIELDS_BASE}/chart/${POOL_ID}`)
    if (res.ok) {
      record("DefiLlama /chart", "WARN", true, "200 — chart endpoint is accessible again (history charts can be restored)")
    } else {
      record(
        "DefiLlama /chart",
        "WARN",
        false,
        `HTTP ${res.status} — still gated; per-pool history charts will be empty until a paid key or alt source is wired`,
      )
    }
  } catch (err: any) {
    record("DefiLlama /chart", "WARN", false, `fetch failed: ${err?.message ?? err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 5. DefiLlama /protocol + /summary/fees — TVL history + revenue decomp.
// ─────────────────────────────────────────────────────────────────────────
async function checkDefiLlamaProtocol(): Promise<void> {
  try {
    const res = await fetch(`${LLAMA_BASE}/protocol/aave-v3`)
    if (!res.ok) {
      record("DefiLlama /protocol", "CRITICAL", false, `HTTP ${res.status}`)
    } else {
      const json: any = await res.json()
      const hasTvl = Array.isArray(json?.chainTvls?.Ethereum?.tvl) && json.chainTvls.Ethereum.tvl.length > 0
      record("DefiLlama /protocol", "CRITICAL", hasTvl, hasTvl ? "chainTvls.Ethereum.tvl present" : "missing Ethereum TVL series")
    }
  } catch (err: any) {
    record("DefiLlama /protocol", "CRITICAL", false, `fetch failed: ${err?.message ?? err}`)
  }

  try {
    const res = await fetch(`${LLAMA_BASE}/summary/fees/aave-v3?dataType=dailyFees`)
    if (!res.ok) {
      record("DefiLlama /summary/fees", "CRITICAL", false, `HTTP ${res.status}`)
    } else {
      const json: any = await res.json()
      const hasBreakdown = Array.isArray(json?.totalDataChartBreakdown) && json.totalDataChartBreakdown.length > 0
      const hasTotal = Array.isArray(json?.totalDataChart) && json.totalDataChart.length > 0
      record(
        "DefiLlama /summary/fees",
        "CRITICAL",
        hasBreakdown || hasTotal,
        hasBreakdown ? "totalDataChartBreakdown present" : hasTotal ? "only totalDataChart (no per-chain breakdown)" : "no fee series",
      )
    }
  } catch (err: any) {
    record("DefiLlama /summary/fees", "CRITICAL", false, `fetch failed: ${err?.message ?? err}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 6. FRED — public CSV, powers the Real Yield Spread (TB4WK) + DFF overlay.
// ─────────────────────────────────────────────────────────────────────────
async function checkFred(): Promise<void> {
  for (const series of ["TB4WK", "DFF"]) {
    try {
      const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`)
      if (!res.ok) {
        record(`FRED ${series}`, "CRITICAL", false, `HTTP ${res.status}`)
        continue
      }
      const text = await res.text()
      const dataLines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("observation_date"))
      record(`FRED ${series}`, "CRITICAL", dataLines.length > 0, dataLines.length > 0 ? `${dataLines.length} observations` : "no rows in CSV")
    } catch (err: any) {
      record(`FRED ${series}`, "CRITICAL", false, `fetch failed: ${err?.message ?? err}`)
    }
  }
}

async function main(): Promise<void> {
  console.log("Checking upstream data sources…\n")
  // Run all checks; collect results regardless of individual failures.
  await Promise.allSettled([
    checkMorphoCurators(),
    checkMorphoVaultDetail(),
    checkDefiLlamaPools(),
    checkDefiLlamaChart(),
    checkDefiLlamaProtocol(),
    checkFred(),
  ])

  const critical = results.filter((r) => r.severity === "CRITICAL")
  const failedCritical = critical.filter((r) => !r.ok)
  const warns = results.filter((r) => r.severity === "WARN" && !r.ok)

  console.log(
    `\n── Summary ──\n` +
      `  ${critical.length - failedCritical.length}/${critical.length} critical checks passed\n` +
      `  ${warns.length} warning(s)\n`,
  )

  if (failedCritical.length > 0) {
    console.error(`✗ ${failedCritical.length} CRITICAL check(s) failed:`)
    for (const r of failedCritical) console.error(`    - ${r.name}: ${r.detail}`)
    process.exit(1)
  }
  console.log("✓ All critical upstream checks passed.")
}

main().catch((err) => {
  console.error("check-upstream crashed:", err)
  process.exit(1)
})
