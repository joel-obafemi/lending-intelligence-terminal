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
   * Curator-bucketed HHI of all Ethereum MetaMorpho vaults with non-zero
   * TVL. Result is cached for the duration of one Worker invocation.
   */
  async getCuratorHhi(): Promise<MorphoCuratorHhiResult> {
    if (!this.cachedHhi) this.cachedHhi = this.computeHhi();
    return this.cachedHhi;
  }

  private async computeHhi(): Promise<MorphoCuratorHhiResult> {
    const items: VaultsRaw["vaults"]["items"] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.gql<VaultsRaw>(QUERY, {
        chainId: ETH_CHAIN_ID,
        first: PAGE_SIZE,
        skip: page * PAGE_SIZE,
      });
      const got = data.vaults?.items ?? [];
      items.push(...got);
      if (got.length < PAGE_SIZE) break;
      if (items.length >= (data.vaults?.pageInfo.countTotal ?? items.length)) break;
    }

    const tvlByCurator = new Map<string, number>();
    let totalAssetsUsd = 0;
    let vaultCount = 0;
    for (const v of items) {
      const tvl = v.state?.totalAssetsUsd ?? 0;
      if (tvl <= 0) continue;
      const primary = v.state?.curators?.[0]?.name?.trim() || "Uncurated";
      tvlByCurator.set(primary, (tvlByCurator.get(primary) ?? 0) + tvl);
      totalAssetsUsd += tvl;
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
