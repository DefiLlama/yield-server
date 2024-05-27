const { request, gql } = require('graphql-request');
const utils = require('../utils');
const superagent = require('superagent');

const subgraphUrls = {
  morphoBlue: 'https://blue-api.morpho.org/graphql',
};

const gqlQueries = {
  marketsData: gql`
    query GetYieldsData {
      markets(first: 800, orderBy: SupplyAssetsUsd, orderDirection: Desc) {
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
    query {
      vaults(first: 100, orderBy: TotalAssetsUsd, orderDirection: Desc) {
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

async function fetchGraphData(query, url) {
  try {
    return await request(url, query);
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return {};
  }
}

function isNegligible(valueA, valueB, threshold = 0.01) {
  return Math.abs(valueA - valueB) / (valueA + valueB) < threshold;
}

function validatePool(pool) {
  const requiredFields = [
    'pool',
    'chain',
    'project',
    'symbol',
    'apyBase',
    'apyReward',
    'rewardTokens',
    'tvlUsd',
    'underlyingTokens',
    'apyBaseBorrow',
    'apyRewardBorrow',
    'totalSupplyUsd',
    'totalBorrowUsd',
    'ltv',
    'poolMeta',
  ];
  return requiredFields.every((field) => pool[field] !== undefined);
}

async function fetchBlueMarkets() {
  try {
    const marketDataResponse = await fetchGraphData(
      gqlQueries.marketsData,
      subgraphUrls.morphoBlue
    );

    const marketData = marketDataResponse?.markets.items || [];

    return Object.fromEntries(
      marketData
        .map((market) => {
          if (!market) {
            console.warn('Skipping market due to undefined market data');
            return null; // Skip undefined market
          }

          const lltv = market.lltv / 1e18;
          const rewardTokens = market.state.rewards.map(
            (reward) => reward.asset.address
          );
          const apyReward =
            (market.state.netSupplyApy || 0) - (market.state.supplyApy || 0);
          const apyRewardBorrow =
            (market.state.netBorrowApy || 0) - (market.state.borrowApy || 0);
          const pool = {
            pool: `morpho-blue-${market.uniqueKey}`,
            chain: 'ethereum',
            project: 'morpho-blue',
            symbol: utils.formatSymbol(
              `${market.collateralAsset?.symbol || 'idle-market'}-${
                market.loanAsset.symbol
              }`
            ),
            apyBase: market.state.supplyApy || 0,
            apyReward,
            rewardTokens,
            tvlUsd:
              (market.state.collateralAssetsUsd || 0) +
              (market.state.supplyAssetsUsd || 0) -
              (market.state.borrowAssetsUsd || 0),
            underlyingTokens: [market.loanAsset.address],
            apyBaseBorrow: market.state.borrowApy || 0,
            apyRewardBorrow,
            totalSupplyUsd:
              (market.state.supplyAssetsUsd || 0) +
              (market.state.collateralAssetsUsd || 0),
            totalBorrowUsd: market.state.borrowAssetsUsd || 0,
            ltv: lltv,
            poolMeta: `${lltv * 100}%`,
          };
          if (!validatePool(pool)) {
            console.warn(`Skipping invalid pool: ${JSON.stringify(pool)}`);
            return null; // Skip invalid pool
          }
          return [market.uniqueKey, pool];
        })
        .filter(Boolean) // Filter out null entries
    );
  } catch (error) {
    console.error('Error in fetchBlueMarkets:', error);
    return [];
  }
}

async function fetchMetaMorphoAPY(blueMarketsData) {
  try {
    const vaultsDataResponse = await fetchGraphData(
      gqlQueries.metaMorphoVaults,
      subgraphUrls.morphoBlue
    );

    const vaultData = vaultsDataResponse?.vaults.items || [];

    return Object.fromEntries(
      vaultData
        .map((vault) => {
          if (!vault) {
            console.warn('Skipping vault due to undefined vault data');
            return null; // Skip undefined vault
          }

          if (vault.state.totalAssetsUsd < 10000) {
            console.log('Skipping vault due to insufficient USD value:', vault);
            return null; // Skip vault with insufficient value
          }

          const lltv = 1;
          let additionalRewardTokens = [];

          vault.state.allocation.forEach((allocatedMarket) => {
            if (allocatedMarket.supplyAssetsUsd !== 0) {
              const marketRewards = blueMarketsData.find(
                (market) =>
                  market.pool ===
                  `morpho-blue-${allocatedMarket.market.uniqueKey}`
              );
              if (marketRewards) {
                additionalRewardTokens = additionalRewardTokens.concat(
                  marketRewards.rewardTokens
                );
              }
            }
          });

          const rewardsApy = vault.state.netApy - vault.state.apy;
          const isNegligibleApy = isNegligible(rewardsApy, vault.state.apy);
          const apyReward =
            isNegligibleApy || additionalRewardTokens.length === 0
              ? 0
              : rewardsApy;
          const rewardTokens =
            isNegligibleApy || additionalRewardTokens.length === 0
              ? []
              : [...new Set(additionalRewardTokens)];

          const pool = {
            pool: `morpho-blue-${vault.address}`,
            chain: 'ethereum',
            project: 'morpho-blue',
            symbol: utils.formatSymbol(`${vault.symbol}`),
            apyBase: vault.state.apy || 0,
            apyReward,
            rewardTokens,
            tvlUsd: vault.state.totalAssetsUsd || 0,
            underlyingTokens: [vault.asset.address],
            apyBaseBorrow: 0,
            apyRewardBorrow: 0,
            totalSupplyUsd: vault.state.totalAssetsUsd || 0,
            totalBorrowUsd: 0,
            ltv: lltv,
            poolMeta: `${lltv * 100}%`,
          };
          if (!validatePool(pool)) {
            console.warn(`Skipping invalid pool: ${JSON.stringify(pool)}`);
            return null; // Skip invalid pool
          }
          return [vault.address, pool];
        })
        .filter(Boolean) // Filter out null entries
    );
  } catch (error) {
    console.error('Error in fetchMetaMorphoAPY:', error);
    return [];
  }
}

async function apy() {
  const blueMarketsData = Object.values(await fetchBlueMarkets());
  const metaMorphoAPYData = Object.values(
    await fetchMetaMorphoAPY(blueMarketsData)
  );
  return metaMorphoAPYData.concat(blueMarketsData);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.morpho.xyz',
};
