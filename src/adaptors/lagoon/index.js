const { request, gql } = require('graphql-request');

const GRAPH_URL = 'https://api.lagoon.finance/query';
const CHAINS = {
  ethereum: 1,
  base: 8453,
  tac: 239,
  arbitrum: 42161,
  linea: 59144,
  plasma: 9745,
  avalanche: 43114,
  monad: 143,
};

const gqlQueries = {
  vaultsData: gql`
    query GetVaultsData($chainId: Int!, $skip: Int!) {
      vaults(
        first: 100
        skip: $skip
        where: { chainId_in: [$chainId], isVisible_eq: true }
      ) {
        pageInfo {
          hasNextPage
        }
        items {
          id
          address
          chain {
            id
          }
          symbol
          asset {
            address
            decimals
            priceUsd
            symbol
          }
          state {
            totalAssetsUsd
            weeklyApr {
              linearNetAprWithoutExtraYields
            }
          }
        }
      }
    }
  `,
};

const apy = async () => {
  let pools = [];

  for (const [chain, chainId] of Object.entries(CHAINS)) {
    // Fetch vaults data with pagination
    let allVaults = [];
    let skip = 0;
    while (true) {
      const { vaults } = await request(GRAPH_URL, gqlQueries.vaultsData, {
        chainId,
        skip,
      });

      allVaults = allVaults.concat(vaults.items);
      if (!vaults.pageInfo.hasNextPage) break;
      skip += 100;
    }
    const _pools = allVaults.map((vault) => {
      return {
        pool: `lagoon-${vault.address}-${chain}`,
        chain,
        project: 'lagoon',
        symbol: vault.symbol,
        apyBase: vault.state.weeklyApr.linearNetAprWithoutExtraYields,
        tvlUsd: vault.state.totalAssetsUsd || 0,
        underlyingTokens: [vault.asset.address],
        url: `https://app.lagoon.finance/vault/${vault.chain.id}/${vault.address}`,
      };
    });
    pools = pools.concat(_pools);
  }

  return pools;
};

module.exports = {
  apy,
};
