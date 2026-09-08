/**
 * Morpho Blue GraphQL client for the alerts Worker. Public endpoint,
 * keyless, generous rate limit (1M complexity / day; one paged vault list
 * per run is well under). Mirrors the dashboard's lib/morpho-api.ts
 * pagination strategy but only pulls the fields the curator HHI rule
 * needs.
 */

const ENDPOINT = "https://blue-api.morpho.org/graphql";
const ETH_CHAIN_ID = 1;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

interface VaultsRaw {
  vaults: {
    items: Array<{
      address: string;
      name: string;
      symbol: string;
      // Morpho moved curator metadata onto `state` (mid-2026); the old
      // `metadata.curators` field no longer exists on VaultMetadata.
      state: {
        totalAssetsUsd: number | null;
        curators: Array<{ name: string | null }> | null;
      } | null;
    }>;
    pageInfo: { count: number; countTotal: number };
  };
}

const QUERY = /* GraphQL */ `
  query AlertsCuratorHHI($chainId: Int!, $first: Int!, $skip: Int!) {
    vaults(
      first: $first
      skip: $skip
      where: { chainId_in: [$chainId] }
      orderBy: TotalAssetsUsd
      orderDirection: Desc
    ) {
      items {
        address
        name
        symbol
        state { totalAssetsUsd curators { name } }
      }
      pageInfo { count countTotal }
    }
  }
`;

// Vault V2 is a separate contract system Morpho runs in parallel with
// MetaMorpho (V1) and is the LARGER side of the curator market since
// mid-2026. A V1-only HHI reads the market as far more concentrated than
// it is (Issue 003 erratum: V1-only 3,103 vs combined 2,144 at May 31).
// The alert therefore aggregates both systems, matching the dashboard's
// combined leaderboard in lib/morpho-api.ts.
interface VaultV2sRaw {
  vaultV2s: {
    items: Array<{
      address: string;
      name: string;
      symbol: string;
      totalAssetsUsd: number | null;
      curators: { items: Array<{ name: string | null }> | null } | null;
    }>;
    pageInfo: { count: number; countTotal: number };
  };
}

const QUERY_V2 = /* GraphQL */ `
  query AlertsCuratorHHIV2($chainId: Int!, $first: Int!, $skip: Int!) {
    vaultV2s(
      first: $first
      skip: $skip
      where: { chainId_in: [$chainId] }
      orderBy: TotalAssetsUsd
      orderDirection: Desc
    ) {
      items {
        address
        name
        symbol
        totalAssetsUsd
        curators { items { name } }
      }
      pageInfo { count countTotal }
    }
  }
`;

export interface MorphoCuratorShare {
  /** Display name. Curators with no metadata are bucketed under "Uncurated". */
  name: string;
  /** Sum of `state.totalAssetsUsd` across this curator's vaults. */
  totalAssetsUsd: number;
  /** Percentage share of total curated TVL (0-100). */
  sharePct: number;
}

export interface MorphoCuratorHhiResult {
  hhi: number;
  totalAssetsUsd: number;
  curators: MorphoCuratorShare[];
  vaultCount: number;
}

export class MorphoGraphQLClient {
  private cachedHhi: Promise<MorphoCuratorHhiResult> | null = null;

  /**
   * Curator-bucketed HHI across BOTH Morpho vault systems on Ethereum
   * (MetaMorpho V1 + Vault V2) with non-zero TVL. Result is cached for
   * the duration of one Worker invocation.
   */
  async getCuratorHhi(): Promise<MorphoCuratorHhiResult> {
    if (!this.cachedHhi) this.cachedHhi = this.computeHhi();
    return this.cachedHhi;
  }

  private async computeHhi(): Promise<MorphoCuratorHhiResult> {
    const v1Items: VaultsRaw["vaults"]["items"] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.gql<VaultsRaw>(QUERY, {
        chainId: ETH_CHAIN_ID,
        first: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      });
      const got = data.vaults?.items ?? [];
      v1Items.push(...got);
      if (got.length < PAGE_SIZE) break;
      if (v1Items.length >= (data.vaults?.pageInfo.countTotal ?? v1Items.length)) break;
    }

    const v2Items: VaultV2sRaw["vaultV2s"]["items"] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.gql<VaultV2sRaw>(QUERY_V2, {
        chainId: ETH_CHAIN_ID,
        first: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      });
      const got = data.vaultV2s?.items ?? [];
      v2Items.push(...got);
      if (got.length < PAGE_SIZE) break;
      if (v2Items.length >= (data.vaultV2s?.pageInfo.countTotal ?? v2Items.length)) break;
    }

    // Both systems collapse into (tvl, primary curator) pairs so the
    // reducer below doesn't branch on version.
    const normalized: Array<{ tvl: number; curator: string | undefined }> = [
      ...v1Items.map((v) => ({
        tvl: v.state?.totalAssetsUsd ?? 0,
        curator: v.state?.curators?.[0]?.name?.trim(),
      })),
      ...v2Items.map((v) => ({
        tvl: v.totalAssetsUsd ?? 0,
        curator: v.curators?.items?.[0]?.name?.trim(),
      })),
    ];

    // HHI is computed on the CURATED market only — matches the dashboard's
    // antitrust-convention definition (<1,500 competitive · 1,500-2,500
    // moderate · >2,500 highly concentrated). Vaults with no curator name
    // are excluded from numerator AND denominator. Including them would
    // dilute every named curator's share and push HHI lower in a way that
    // doesn't reflect competitive structure among the actual curators.
    const tvlByCurator = new Map<string, number>();
    let totalAssetsUsd = 0;
    let vaultCount = 0;
    for (const v of normalized) {
      if (v.tvl <= 0) continue;
      if (!v.curator) continue; // skip uncurated entirely
      tvlByCurator.set(v.curator, (tvlByCurator.get(v.curator) ?? 0) + v.tvl);
      totalAssetsUsd += v.tvl;
      vaultCount += 1;
    }

    if (totalAssetsUsd <= 0) {
      return { hhi: 0, totalAssetsUsd: 0, curators: [], vaultCount: 0 };
    }

    const curators: MorphoCuratorShare[] = [...tvlByCurator.entries()]
      .map(([name, tvl]) => ({
        name,
        totalAssetsUsd: tvl,
        sharePct: (tvl / totalAssetsUsd) * 100,
      }))
      .sort((a, b) => b.sharePct - a.sharePct);

    // HHI uses share-as-percentage (0-100), per spec 5.6.
    const hhi = curators.reduce((acc, c) => acc + c.sharePct * c.sharePct, 0);

    return { hhi, totalAssetsUsd, curators, vaultCount };
  }

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "datumlabs-alerts/0.1 (+lending-intelligence-terminal)",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Morpho GQL ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (!json.data) {
      throw new Error(
        `Morpho GQL returned no data: ${JSON.stringify(json.errors ?? "(no errors)")}`,
      );
    }
    return json.data;
  }
}
