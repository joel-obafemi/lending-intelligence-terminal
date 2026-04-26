/**
 * Aave V3 mainnet on-chain reads — thin wrapper around the shared
 * `aave-style-onchain` core. The core does the heavy lifting (ABI,
 * decoding, scaling, IRM curve sampling); this file just injects the
 * Aave V3 mainnet addresses.
 *
 * Addresses sourced from `bgd-labs/aave-address-book` (the canonical
 * registry maintained by the Aave protocol team). Re-verify when Aave
 * ships a new major version (V3.4+, V4) by re-running the ABI introspect
 * against the deployed UiPoolDataProvider.
 */
import { type Address } from "viem"
import {
  loadReservesViaProvider,
  findReserveByUnderlying,
  sampleIrmCurve,
  type AaveStyleReserve,
  type AaveStyleAddresses,
  type IrmCurvePoint,
} from "./aave-style-onchain"

const AAVE_V3_MAINNET: AaveStyleAddresses = {
  protocolLabel: "Aave V3",
  addressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e" as Address,
  uiPoolDataProvider: "0x56b7A1012765C285afAC8b8F25C69Bf10ccfE978" as Address,
}

// Re-export the shared `AaveStyleReserve` shape under the Aave-specific
// alias the rest of the codebase already imports.
export type AaveReserveLive = AaveStyleReserve

export function loadAllAaveReservesLive(): Promise<AaveReserveLive[]> {
  return loadReservesViaProvider(AAVE_V3_MAINNET)
}

export function findAaveReserveByUnderlying(
  underlyingAddress: string,
): Promise<AaveReserveLive | null> {
  return findReserveByUnderlying(AAVE_V3_MAINNET, underlyingAddress)
}

// Re-export the IRM sampler under the Aave-specific name (callers in
// `lib/market-detail.ts` already use this name for Aave reserves).
export const sampleAaveIrmCurve = sampleIrmCurve
export type { IrmCurvePoint }
