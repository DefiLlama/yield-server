const { request, gql } = require('graphql-request');

const GRAPH_URL = 'https://blue-api.morpho.org/graphql';
const CHAINS = {
  ethereum: 1,
  base: 8453,
};

const gqlQueries = {
  marketsData: gql`
    query GetYieldsData($chainId: Int!, $skip: Int!) {
      markets(
        first: 100
        skip: $skip
        orderBy: SupplyAssetsUsd
        orderDirection: Desc
        where: { chainId_in: [$chainId] }
      ) {
        items {
          uniqueKey
          lltv
          loanAsset {
            address
            symbol
            priceUsd
            decimals
          }
          collateralAsset {
            address
            symbol
            priceUsd
            decimals
          }
          state {
            supplyApy
            borrowApy
            netSupplyApy
            netBorrowApy
            supplyAssets
            borrowAssets
            collateralAssets
            collateralAssetsUsd
            supplyAssetsUsd
            borrowAssetsUsd
            rewards {
              borrowApr
              asset {
                address
              }
            }
          }
        }
      }
    }
  `,
  metaMorphoVaults: gql`
    query GetVaultsData($chainId: Int!, $skip: Int!) {
      vaults(
        first: 100
        skip: $skip
        orderBy: TotalAssetsUsd
        orderDirection: Desc
        where: { chainId_in: [$chainId] }
      ) {
        items {
          chain {
            id
          }
          address
          name
          symbol
          asset {
            address
          }
          state {
            totalAssets
            totalAssetsUsd
            apy
            netApy
            fee
            totalSupply
            allocation {
              supplyAssetsUsd
              market {
                uniqueKey
                state {
                  rewards {
                    asset {
                      address
                    }
                    supplyApr
                  }
                }
              }
            }
          }
        }
      }
    }
  `,
};

const isNegligible = (valueA, valueB, threshold = 0.01) => {
  return Math.abs(valueA - valueB) / (valueA + valueB) < threshold;
};

const apy = async () => {
  let pools = [];

  for (const [chain, chainId] of Object.entries(CHAINS)) {
    // Fetch vaults data with pagination
    let allVaults = [];
    let skip = 0;
    while (true) {
      const { vaults } = await request(GRAPH_URL, gqlQueries.metaMorphoVaults, {
        chainId,
        skip,
      });

      if (!vaults.items.length) break;

      allVaults = [...allVaults, ...vaults.items];
      skip += 100;
    }

    // Fetch markets data with pagination
    let allMarkets = [];
    skip = 0;
    while (true) {
      const { markets } = await request(GRAPH_URL, gqlQueries.marketsData, {
        chainId,
        skip,
      });

      if (!markets.items.length) break;

      allMarkets = [...allMarkets, ...markets.items];
      skip += 100;
    }

    const earn = allVaults;
    const borrow = allMarkets;

    const earnPools = earn.map((vault) => {
      // fetch reward token addresses from allocation data
      let additionalRewardTokens = new Set();
      vault.state.allocation.forEach((allocatedMarket) => {
        const allocationUsd = allocatedMarket.supplyAssetsUsd;
        if (allocationUsd > 0) {
          // For each reward from the allocated market
          allocatedMarket.market.state.rewards?.forEach((rw) => {
            if (rw.supplyApr > 0) {
              additionalRewardTokens.add(rw.asset.address.toLowerCase());
            }
          });
        }
      });

      // net = including rewards, apy = baseApy
      const rewardsApy = Math.max(vault.state.netApy - vault.state.apy, 0);
      const isNegligibleApy = isNegligible(rewardsApy, vault.state.netApy);
      const rewardTokens = isNegligibleApy ? [] : [...additionalRewardTokens];
      const apyReward = rewardTokens.length === 0 ? 0 : rewardsApy * 100;

      return {
        pool: `morpho-blue-${vault.address}-${chain}`,
        chain,
        project: 'morpho-blue',
        symbol: vault.symbol,
        apyBase: vault.state.apy * 100,
        tvlUsd: vault.state.totalAssetsUsd || 0,
        underlyingTokens: [vault.asset.address],
        url: `https://app.morpho.org/vault?vault=${vault.address}&network=${
          chain === 'ethereum' ? 'mainnet' : chain
        }`,
        apyReward,
        rewardTokens,
      };
    });

    const borrowPools = borrow.map((market) => {
      if (!market.collateralAsset?.symbol) return null;
      const rewardTokens = market.state.rewards
        .filter((reward) => reward.borrowApr > 0)
        .map((reward) => reward.asset.address);

      const apyRewardBorrow =
        Math.max(
          0,
          (market.state.borrowApy || 0) - (market.state.netBorrowApy || 0)
        ) * 100;

      return {
        pool: `morpho-blue-${market.uniqueKey}-${chain}`,
        chain,
        project: 'morpho-blue',
        symbol: market.collateralAsset?.symbol,
        apy: 0,
        tvlUsd: market.state.collateralAssetsUsd || 0,
        underlyingTokens: [market.collateralAsset.address],
        apyBaseBorrow: market.state.borrowApy * 100,
        totalSupplyUsd: market.state.collateralAssetsUsd,
        totalBorrowUsd: market.state.borrowAssetsUsd,
        debtCeilingUsd:
          market.state.supplyAssetsUsd - market.state.borrowAssetsUsd,
        ltv: market.lltv / 1e18,
        mintedCoin: market.loanAsset?.symbol,
        url: `https://app.morpho.org/market?id=${market.uniqueKey}&network=${
          chain === 'ethereum' ? 'mainnet' : chain
        }`,
        apyRewardBorrow,
        rewardTokens: apyRewardBorrow > 0 ? rewardTokens : [],
      };
    });

    pools = [...pools, ...earnPools, ...borrowPools];
  }

  const uniquePools = Array.from(
    pools
      .reduce((map, pool) => {
        if (!pool) return map;
        const key = `morpho-blue-${pool.pool}-${pool.chain}`;
        if (!map.has(key) || pool.tvlUsd > map.get(key).tvlUsd) {
          map.set(key, pool);
        }
        return map;
      }, new Map())
      .values()
  );

  return uniquePools.filter(Boolean);
};

module.exports = {
  apy,
};
