/**
 * Debug-only: surface what `loadFluidSmartVaultStats()` returns on the
 * deployed environment, including which sub-step failed when it does.
 *
 * Used to diagnose why the FluidSmartStatsCard isn't rendering on Vercel
 * even though the function works locally — the prod failure is opaque
 * once the page-level catch swallows the error.
 *
 * Should be removed once the Fluid stats are stable in prod.
 */
import { NextResponse } from "next/server"
import { loadFluidSmartVaultStats, type FluidSmartVaultStats } from "@/lib/fluid-stats"
import { loadAllFluidVaultsLive } from "@/lib/fluid-onchain"
import { fetchAllYieldPools } from "@/lib/defillama"
import { loadProtocolDetail } from "@/lib/protocol-detail"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const out: Record<string, unknown> = {}

  // Step 1: Fluid on-chain.
  const t1 = Date.now()
  try {
    const vaults = await loadAllFluidVaultsLive()
    out.step1_onchain = {
      ok: true,
      ms: Date.now() - t1,
      vaultCount: vaults.length,
      smartFlagged: vaults.filter((v) => v.isSmartCol || v.isSmartDebt).length,
    }
  } catch (e: any) {
    out.step1_onchain = {
      ok: false,
      ms: Date.now() - t1,
      error: e?.message ?? String(e),
      stack: (e?.stack ?? "").split("\n").slice(0, 5).join("\n"),
    }
  }

  // Step 2: DefiLlama Fluid pools.
  const t2 = Date.now()
  try {
    const pools = await fetchAllYieldPools()
    const fluid = pools.filter(
      (p) =>
        p.chain === "Ethereum" &&
        (p.project === "fluid-lending" || p.project === "fluid"),
    )
    out.step2_defillama = {
      ok: true,
      ms: Date.now() - t2,
      totalPools: pools.length,
      fluidPools: fluid.length,
    }
  } catch (e: any) {
    out.step2_defillama = {
      ok: false,
      ms: Date.now() - t2,
      error: e?.message ?? String(e),
    }
  }

  // Step 3: full pipeline.
  const t3 = Date.now()
  try {
    const stats = await loadFluidSmartVaultStats()
    out.step3_full = { ok: true, ms: Date.now() - t3, isNull: stats == null, stats }
  } catch (e: any) {
    out.step3_full = { ok: false, ms: Date.now() - t3, error: e?.message ?? String(e) }
  }

  // Step 4: replicate the exact /protocols page Promise.all to see if a race
  // with loadProtocolDetail() is what's causing fluidStats to be null in
  // the page render even though the standalone call works.
  const t4 = Date.now()
  try {
    const [detail, fluidStats] = await Promise.all([
      loadProtocolDetail("fluid"),
      loadFluidSmartVaultStats().catch((err: any) => {
        return { error: err?.message ?? String(err) } as unknown as FluidSmartVaultStats
      }),
    ])
    out.step4_page_race = {
      ok: true,
      ms: Date.now() - t4,
      detailNull: detail == null,
      detailMarkets: detail?.markets?.length ?? null,
      fluidStatsNull: fluidStats == null,
      fluidStatsHasError: !!(fluidStats as any)?.error,
      fluidStatsErrorMessage: (fluidStats as any)?.error ?? null,
      fluidStatsSmartAnyPct: (fluidStats as FluidSmartVaultStats)?.smartAnyPct ?? null,
    }
  } catch (e: any) {
    out.step4_page_race = { ok: false, ms: Date.now() - t4, error: e?.message ?? String(e) }
  }

  return NextResponse.json(out, { headers: { "cache-control": "no-store" } })
}
