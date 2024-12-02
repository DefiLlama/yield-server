const { request, gql } = require('graphql-request');

const GRAPH_URL = 'https://blue-api.morpho.org/graphql';
const MORPHO_TOKEN_ADDRESS = '0x9994E35Db50125E0DF82e4c2dde62496CE330999';
const CHAINS = {
  ethereum: 1,
  base: 8453,
};

const gqlQueries = {
  marketsData: gql`
    query GetYieldsData($chainId: Int!) {
      markets(
        first: 800
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
    query GetVaultsData($chainId: Int!) {
      vaults(
        first: 100
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
              market {
                uniqueKey
              }
              supplyAssetsUsd
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
    const data = await Promise.all([
      request(GRAPH_URL, gqlQueries.metaMorphoVaults, { chainId }),
      request(GRAPH_URL, gqlQueries.marketsData, { chainId }),
    ]);

    const earn = data[0].vaults.items;
    const borrow = data[1].markets.items;

    const earnPools = earn.map((vault) => {
      // fetch reward token addresses from borrow data
      let additionalRewardTokens = [];
      vault.state.allocation.forEach((allocatedMarket) => {
        if (allocatedMarket.supplyAssetsUsd !== 0) {
          const marketRewards = borrow.find(
            (market) =>
              market.pool === `morpho-blue-${allocatedMarket.market.uniqueKey}`
          );
          if (marketRewards) {
            additionalRewardTokens = additionalRewardTokens.concat(
              marketRewards.rewardTokens
            );
          }
        }
      });

      // net = including rewards, apy = baseApy
      const rewardsApy = vault.state.netApy - vault.state.apy;
      const isNegligibleApy = isNegligible(rewardsApy, vault.state.apy);
      const apyReward =
        isNegligibleApy || additionalRewardTokens.length === 0
          ? 0
          : rewardsApy * 100;
      const rewardTokens =
        isNegligibleApy || additionalRewardTokens.length === 0
          ? []
          : [...new Set(additionalRewardTokens)];

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
        .map((reward) => reward.asset.address)
        .filter((address) => address !== MORPHO_TOKEN_ADDRESS);

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

  return pools.filter(Boolean);
};

module.exports = {
  apy,
};
