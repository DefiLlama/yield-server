const { request, gql } = require('graphql-request');

const GRAPH_URL = 'https://api.lagoon.finance/api/query';
const CHAINS = {
  ethereum: 1,
  base: 8453,
  tac: 239,
  arbitrum: 42161,
  linea: 59144,
  plasma: 9745,
  avalanche: 43114,
  
};


const gqlQueries = {
  vaultsData: gql`
    query GetVaultsData($chainId: String!, $skip: Int!) {
      vaults(
        first: 100
        skip: $skip
        where: { chainId_in: [$chainId] }
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
            totalAssets
            totalAssetsUsd
            weeklyApr {
              linearNetAprWithoutExtraYields
              incentives {
                apr
              }
              airdrops {
                apr
              }
              nativeYields {
                apr
              }
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
        chainId: chainId.toString(),
        skip,
      });

      if (!vaults.pageInfo.hasNextPage) break;

      allVaults = [...allVaults, ...vaults.items];
      skip += 100;
    }

    pools = allVaults.map((vault) => {
      
      const apyReward = vault.state.weeklyApr.incentives.apr * 100 + vault.state.weeklyApr.airdrops.apr * 100 + vault.state.weeklyApr.nativeYields.apr * 100;

      return {
        pool: `lagoon-${vault.address}-${chain}`,
        chain,
        project: 'lagoon',
        symbol: vault.symbol,
        apyBase: vault.state.weeklyApr.linearNetAprWithoutExtraYields * 100,
        tvlUsd: vault.state.totalAssetsUsd || 0,
        underlyingTokens: [vault.asset.address],
        url: `https://app.lagoon.finance/vault/${vault.chain.id}/${vault.address}`,
        apyReward,
      };
    });
  }
  return pools;
};

module.exports = {
  apy,
};
