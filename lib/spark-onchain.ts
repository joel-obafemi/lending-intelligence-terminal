/**
 * SparkLend on-chain reads — thin wrapper around the shared
 * `aave-style-onchain` core, since SparkLend is a fork of Aave V3 and the
 * `UiPoolDataProvider` ABI is the same.
 *
 * Spark forked Aave V3 in early 2023 and stayed on a pre-V3.3 struct shape:
 * no `deficit`, but it still has `stableBorrowRate*` fields that V3.3+
 * removed. We pass `legacy: true` so the core decodes with the older ABI.
 *
 * Addresses sourced from `sparkdotfi/spark-address-registry/src/SparkLend.sol`.
 */
import { type Address } from "viem"
import {
  loadReservesViaProvider,
  findReserveByUnderlying,
  type AaveStyleReserve,
  type AaveStyleAddresses,
} from "./aave-style-onchain"

const SPARK_LEND_MAINNET: AaveStyleAddresses = {
  protocolLabel: "SparkLend",
  addressesProvider: "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE" as Address,
  uiPoolDataProvider: "0xF028c2F4b19898718fD0F77b9b881CbfdAa5e8Bb" as Address,
  legacy: true,
}

export type SparkReserveLive = AaveStyleReserve

export function loadAllSparkReservesLive(): Promise<SparkReserveLive[]> {
  return loadReservesViaProvider(SPARK_LEND_MAINNET)
}

export function findSparkReserveByUnderlying(
  underlyingAddress: string,
): Promise<SparkReserveLive | null> {
  return findReserveByUnderlying(SPARK_LEND_MAINNET, underlyingAddress)
}
