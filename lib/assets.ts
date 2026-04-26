/**
 * Asset classification for the Collateral Risk Monitor and Collateral-Type
 * breakdown chart. Symbols are matched case-insensitively against DefiLlama's
 * token symbols (which we normalize to uppercase in overview.ts).
 *
 * This is a living mapping — update when new assets get listed on any of the
 * four tracked protocols. Unknown symbols fall through to "other", which is
 * correct for governance tokens, long-tail collateral, and anything we
 * haven't classified yet.
 */

export type AssetType = "native" | "lst" | "lrt" | "stable" | "other"

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  native: "Native",
  lst: "Liquid Staked",
  lrt: "Restaked",
  stable: "Stablecoin",
  other: "Other",
}

export const ASSET_TYPE_COLOR: Record<AssetType, string> = {
  native: "#F59E0B",
  lst: "#5B7FFF",
  lrt: "#B44AFF",
  stable: "#10B981",
  other: "#6B7280",
}

/** Stack order (bottom-up) for area charts — biggest/most-familiar at bottom. */
export const ASSET_TYPE_STACK_ORDER: AssetType[] = ["native", "stable", "lst", "lrt", "other"]

const NATIVE = new Set(["WETH", "ETH", "WBTC", "CBBTC", "TBTCV2", "TBTC", "LBTC"])
const LST = new Set([
  "WSTETH", "CBETH", "RETH", "OSETH", "SFRXETH", "SWETH", "LSETH", "ANKRETH",
  "METH", // mETH (Mantle)
  "FRXETH",
])
const LRT = new Set([
  "WEETH", "RSETH", "EZETH", "RSWETH", "PUFETH", "EETH", "UNIETH",
])
const STABLE = new Set([
  "USDC", "USDT", "DAI", "USDS", "GHO", "PYUSD", "USDE", "SUSDE",
  "SDAI", "SUSDS", "FRAX", "FDUSD", "USDTB", "CRVUSD", "LUSD", "TUSD",
  "USDC.E", "FUSD", "USD1", "MKUSD", "USD0", "USD0++",
])

export function classifyAsset(symbol: string): AssetType {
  const s = symbol.toUpperCase()
  if (NATIVE.has(s)) return "native"
  if (LST.has(s)) return "lst"
  if (LRT.has(s)) return "lrt"
  if (STABLE.has(s)) return "stable"
  return "other"
}
