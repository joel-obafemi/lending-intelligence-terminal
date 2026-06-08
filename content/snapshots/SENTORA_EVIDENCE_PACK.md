# Sentora cross-protocol reallocation — verification pack

> **Purpose.** Issue 002 §06.6 and §07 claim that Sentora — a single
> curator — moved roughly $128M out of four Euler V2 vaults during May
> 2026 and pushed roughly $94M back into Morpho through three of their
> MetaMorpho vaults in the same window. This document gives every
> verifiable on-chain identifier behind that claim so a third party can
> reproduce it.
>
> Every address, vault, multisig, block height, and Risk Manager badge
> below is publicly inspectable on Etherscan, the Euler app, and the
> Morpho app. Nothing here is internal data.

**Last updated:** 2026-06-07
**Time window verified:** 2026-05-01T00:00:00Z → 2026-05-31T23:59:00Z
**Snapshot file of record:** `content/snapshots/SOURCE_BRIEF_section_06_6.md`

---

## 1. The Sentora governor multisig

The four bleeding Euler V2 vaults share a single on-chain governor.

| Field | Value |
|---|---|
| Multisig address | `0x9453ee262d7C95955e690AE7aBBD82a08B135685` |
| Type | Gnosis Safe 1.4.1 |
| Block at May 1 close | `24996368` (timestamp `2026-05-01T00:00:11Z`) |
| Block at May 31 close | `25218793` (timestamp `2026-05-31T23:59:11Z`) |

**Verify the multisig directly:**

- **Etherscan**: <https://etherscan.io/address/0x9453ee262d7C95955e690AE7aBBD82a08B135685>
- **Safe UI**: <https://app.safe.global/home?safe=eth:0x9453ee262d7C95955e690AE7aBBD82a08B135685>
- **Token transfers (ERC-20)**: <https://etherscan.io/address/0x9453ee262d7C95955e690AE7aBBD82a08B135685#tokentxns>
- **Internal transactions**: <https://etherscan.io/address/0x9453ee262d7C95955e690AE7aBBD82a08B135685#internaltx>

**What to look for:**

- The Safe's signer list and threshold under "Settings" in the Safe UI confirm operator identity.
- Filter transactions by the May 1 → May 31 block range (`24996368`..`25218793`) to see the governance actions on the four vaults during the window.

---

## 2. The four Sentora-governed Euler V2 vaults (outflow side)

Every one of these vaults reports the same governor multisig above.

| Vault | Vault contract | May 1 TVL | May 31 TVL | Δ |
|---|---|---|---|---|
| EVK Vault ePYUSD-6 | `0xba98fC35C9dfd69178AD5dcE9FA29c64554783b5` | $63.12M | $10.31M | **−$52.80M (−83.7%)** |
| EVK Vault eRLUSD-7 | `0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2` | $43.78M | $11.09M | **−$32.68M (−74.7%)** |
| EVK Vault eUSDC-80 | `0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30` | $37.93M | $13.55M | **−$24.38M (−64.3%)** |
| EVK Vault eUSDC-70 | `0x9bD52F2805c6aF014132874124686e7b248c2Cbb` | $28.06M | $9.55M | **−$18.52M (−66.0%)** |
| **Aggregate** | | **$172.89M** | **$44.50M** | **−$128.39M (−74.3%)** |

**Per-vault verification (Etherscan contract + Euler app Risk Manager badge):**

### ePYUSD-6
- Etherscan contract: <https://etherscan.io/address/0xba98fC35C9dfd69178AD5dcE9FA29c64554783b5>
- Etherscan events log (filter to May 2026 block range): <https://etherscan.io/address/0xba98fC35C9dfd69178AD5dcE9FA29c64554783b5#events>
- Euler app (look for "Risk manager: Sentora" badge): <https://app.euler.finance/lend/0xba98fC35C9dfd69178AD5dcE9FA29c64554783b5?network=1>

### eRLUSD-7
- Etherscan contract: <https://etherscan.io/address/0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2>
- Events log: <https://etherscan.io/address/0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2#events>
- Euler app: <https://app.euler.finance/lend/0xaF5372792a29dC6b296d6FFD4AA3386aff8f9BB2?network=1>

### eUSDC-80
- Etherscan contract: <https://etherscan.io/address/0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30>
- Events log: <https://etherscan.io/address/0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30#events>
- Euler app: <https://app.euler.finance/lend/0xAB2726DAf820Aa9270D14Db9B18c8d187cbF2f30?network=1>

### eUSDC-70
- Etherscan contract: <https://etherscan.io/address/0x9bD52F2805c6aF014132874124686e7b248c2Cbb>
- Events log: <https://etherscan.io/address/0x9bD52F2805c6aF014132874124686e7b248c2Cbb#events>
- Euler app: <https://app.euler.finance/lend/0x9bD52F2805c6aF014132874124686e7b248c2Cbb?network=1>

**What to look for on Etherscan events:**

Each EVK Vault is an ERC-4626 vault and emits `Deposit` / `Withdraw` events on every share movement. Etherscan's Events tab decodes these directly. Filter by block range `24996368`..`25218793` to see every share-level deposit and withdrawal during May. The aggregate amount of `Withdraw` events minus `Deposit` events across the four vaults will reconcile to the −$128M figure (within DefiLlama's daily-resolution noise).

---

## 3. The three Sentora MetaMorpho vaults (inflow side)

Verified via the Morpho Blue GraphQL API (`blue-api.morpho.org/graphql`) with curator filter `Sentora` (case-insensitive). Captured in `content/snapshots/2026-05-sentora-cross-protocol.json`.

| Vault | Vault contract | May 1 TVL | May 31 TVL | Δ |
|---|---|---|---|---|
| Sentora RLUSD (`senRLUSD`) | `0x71cb2F8038B2C5D65ddc740B2F3268890CD2A89C` | $132.09M | $209.65M | **+$77.56M (+58.7%)** |
| Sentora PYUSD (`senPYUSD`) | `0x19b3cD7032B8C062E8d44EaCad661a0970DD8c55` | $230.16M | $296.70M | **+$66.54M (+28.9%)** |
| Sentora PYUSD Core (`senPYUSDcore`) | `0x2C793f5cB25B35A99648783c01E6cCCC200D2096` | $50.16M | **≈ $165** | **−$50.16M (−100%)** |
| **Aggregate** | | **$412.41M** | **$506.35M** | **+$93.94M** |

Note the Sentora PYUSD Core row: drained to essentially zero (under $200 of dust). Sentora deprecated this vault entirely while expanding the other two.

**Per-vault verification (Etherscan contract + Morpho app curator name):**

### Sentora RLUSD
- Etherscan contract: <https://etherscan.io/address/0x71cb2F8038B2C5D65ddc740B2F3268890CD2A89C>
- Events log: <https://etherscan.io/address/0x71cb2F8038B2C5D65ddc740B2F3268890CD2A89C#events>
- Morpho app (look for curator "Sentora"): <https://app.morpho.org/ethereum/vault/0x71cb2F8038B2C5D65ddc740B2F3268890CD2A89C>

### Sentora PYUSD
- Etherscan contract: <https://etherscan.io/address/0x19b3cD7032B8C062E8d44EaCad661a0970DD8c55>
- Events log: <https://etherscan.io/address/0x19b3cD7032B8C062E8d44EaCad661a0970DD8c55#events>
- Morpho app: <https://app.morpho.org/ethereum/vault/0x19b3cD7032B8C062E8d44EaCad661a0970DD8c55>

### Sentora PYUSD Core
- Etherscan contract: <https://etherscan.io/address/0x2C793f5cB25B35A99648783c01E6cCCC200D2096>
- Events log: <https://etherscan.io/address/0x2C793f5cB25B35A99648783c01E6cCCC200D2096#events>
- Morpho app: <https://app.morpho.org/ethereum/vault/0x2C793f5cB25B35A99648783c01E6cCCC200D2096>

---

## 4. The K3 Capital comparison set (foil for the curator-not-protocol mechanism)

These five vaults share a different governor multisig (`0x060DB0…fEA3`), grew TVL through the same window, and have steeper APY drops than the Sentora bleeders. They are why we say Euler V2's May outflow is a Sentora story, not an Euler V2 story.

| Field | Value |
|---|---|
| K3 Capital multisig | `0x060DB084bF41872861f175d83f3cb1B5566dfEA3` |
| Etherscan | <https://etherscan.io/address/0x060DB084bF41872861f175d83f3cb1B5566dfEA3> |

K3 vault contracts (Etherscan + Euler app links):

| Vault | Vault contract | Etherscan | Euler app |
|---|---|---|---|
| ewstETH-2 | `0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1` | <https://etherscan.io/address/0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1> | <https://app.euler.finance/lend/0xbC4B4AC47582c3E38Ce5940B80Da65401F4628f1?network=1> |
| eWBTC-3 | `0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4` | <https://etherscan.io/address/0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4> | <https://app.euler.finance/lend/0x998D761eC1BAdaCeb064624cc3A1d37A46C88bA4?network=1> |
| eUSDC-22 | `0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2` | <https://etherscan.io/address/0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2> | <https://app.euler.finance/lend/0xD8b27CF359b7D15710a5BE299AF6e7Bf904984C2?network=1> |
| eUSDe-6 | `0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6` | <https://etherscan.io/address/0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6> | <https://app.euler.finance/lend/0x2daCa71Cb58285212Dc05D65Cfd4f59A82BC4cF6?network=1> |
| eUSDC-22 (alt slot) | `0xe0a80d35bB6618CBA260120b279d357978c42BCE` | <https://etherscan.io/address/0xe0a80d35bB6618CBA260120b279d357978c42BCE> | <https://app.euler.finance/lend/0xe0a80d35bB6618CBA260120b279d357978c42BCE?network=1> |

---

## 5. Multisig holdings audit — what rules out the $34M residual

We checked whether the $34M gap between the $128M Euler outflow and the $94M Morpho inflow was sitting on Sentora's treasury directly (idle in the multisig, redeployed into other lending protocols).

**Method:** `viem readContract(balanceOf)` at the two relevant block heights for the multisig address on every relevant stable AND on every relevant lending-receipt token.

| Token category | Tokens queried |
|---|---|
| Underlying stables | USDC, USDT, PYUSD, RLUSD, DAI, USDS |
| Aave V3 aTokens | aEthUSDC, aEthUSDT, aEthPYUSD, aEthRLUSD, aEthDAI, aEthUSDS |
| Sky receipts | sUSDS, sDAI |
| Compound V3 markets | cUSDCv3, cUSDTv3 |

**Result:** **All balances are zero at both block heights (`24996368` and `25218793`).**

This rules out:

- Sentora-as-direct-LP on Aave V3, Compound V3, or Sky during the May window
- Stables sitting idle on the multisig
- Reallocation to a tracked lending venue we missed

Snapshot file: `content/snapshots/2026-05-sentora-multisig-holdings.json`. Every token query, every result, every block-timestamp pair is in there. Reproduce with `npm run query:sentora-multisig-holdings`.

---

## 6. Yield was not the driver

If LPs were leaving for better rates, the Sentora bleeders should have the largest APY drops. They do not. Two K3 Capital vaults had bigger APY drops in the same window and **grew** TVL.

| Vault | Curator | APY May 1 | APY May 31 | Δ | TVL action |
|---|---|---|---|---|---|
| ePYUSD-6 | Sentora | 2.31% | 1.60% | −0.71 pp | bled |
| eRLUSD-7 | Sentora | 2.07% | 1.21% | −0.85 pp | bled |
| eUSDC-80 | Sentora | 3.68% | 2.62% | −1.06 pp | bled |
| eUSDC-70 | Sentora | 3.81% | 3.19% | −0.62 pp | bled |
| eWETH-2 | K3 Capital | 4.32% | 1.34% | **−2.98 pp** | **grew** |
| eUSDC-22 | K3 Capital | 3.76% | 2.00% | **−1.76 pp** | **grew** |

Snapshot file: `content/snapshots/2026-05-euler-vault-apys.json`. Source: DefiLlama Yields `/chart/<poolId>` `apyBase` series.

---

## 7. Reproducible queries

Every figure above can be independently re-pulled. From the repo root with `ETH_RPC_URL` configured in `.env`:

```bash
# Euler V2 vault flows: top-5 outflow + top-5 inflow with per-vault TVL deltas
npm run query:euler-vault-flows

# Per-vault APY trajectory across May
npm run query:euler-vault-apys

# Vault → governor multisig → curator-name resolution
npm run query:euler-vault-curators

# Sentora's Morpho vaults, historical TVL across May
npm run query:sentora-morpho-reallocation

# Permissive sweep: Morpho vaults curated by any label *containing* "sentora"
npm run query:sentora-morpho-variants

# Multisig holdings audit at May 1 and May 31 block heights
npm run query:sentora-multisig-holdings
```

Each script writes a versioned JSON snapshot under `content/snapshots/` with a `source` block at the top documenting the upstream endpoint and any caveats.

---

## 8. Capture visual evidence

`scripts/screenshot-sentora-evidence.ts` opens each of the verification URLs in headless Chromium and saves PNG screenshots of:

- The Sentora multisig on Etherscan (overview + token transfers tab)
- Each of the four Sentora Euler vaults on Etherscan (events log, filtered to May 2026)
- Each of the four Sentora Euler vaults on the Euler app (showing the "Risk manager: Sentora" badge)
- Each of the three Sentora Morpho vaults on the Morpho app (showing the curator name)
- The K3 Capital multisig + comparison vaults

Run it:

```bash
npm exec tsx scripts/screenshot-sentora-evidence.ts
```

Output lands under `tmp/sentora-evidence/`. Pages render at 1280-px viewport and 2× device-pixel ratio. Some external sites (Etherscan, the Euler app) may rate-limit or require a first-visit consent click; the script logs misses so you can re-run those individually.

---

## 9. What we will NOT claim from this evidence

For the record, three things this pack does not establish:

1. **Sentora-on-Morpho is the same legal entity as Sentora-on-Euler.** The Risk Manager badge and matching curator name are strong circumstantial evidence; on-chain proof of identity beyond shared naming is out of scope.
2. **Sentora's reason for the rotation.** The data shows what was moved; not why. We do not allege motive.
3. **The identity of LPs behind the $34M residual.** Curator-level attribution closes at 73%. Tracing the rest would mean following the actual depositor wallets, which is an Issue 003 question.

---

## 10. Citations

For body-text footnotes in the report:

- **DefiLlama Yields** — per-vault TVL and APY historical series.
  Endpoint: `https://yields.llama.fi/chart/<poolId>`
- **Goldsky public Euler V2 mainnet subgraph** — vault → governor multisig mapping.
  Endpoint: `https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn`
- **Morpho Blue API** — Morpho vault metadata and historical TVL.
  Endpoint: `https://blue-api.morpho.org/graphql`
- **Ethereum mainnet, viem `readContract`** — ERC-20 `balanceOf` at historical blocks for the multisig audit.
- **Euler app Risk Manager badge** — `https://app.euler.finance/lend/<vault>?network=1`
- **Morpho app curator field** — `https://app.morpho.org/ethereum/vault/<vault>`
- **Etherscan** — contract pages and events logs for every address above.
