const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const SECONDS_PER_YEAR = 31536000;

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

const API_URLS = {
  optimism: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism',
  avalanche:
    'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-avalanche',
  arbitrum: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
  polygon: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
  fantom: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-fantom',
};

const query = gql`
  query ReservesQuery {
    reserves {
      id
      name
      aToken {
        rewards {
          id
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
        }
        underlyingAssetAddress
        underlyingAssetDecimals
      }
      totalLiquidity
      symbol
      totalSupplies
      liquidityRate
      supplyCap
      totalCurrentVariableDebt
    }
  }
`;

const apy = async () => {
  const data = await Promise.all(
    Object.entries(API_URLS).map(async ([chain, url]) => [
      chain,
      (await request(url, query)).reserves,
    ])
  );

  const underlyingTokens = data.map(([chain, reserves]) =>
    reserves.map(
      (pool) =>
        `${chain === 'avalanche' ? 'avax' : chain}:${
          pool.aToken.underlyingAssetAddress
        }`
    )
  );

  const rewardTokens = data.map(([chain, reserves]) =>
    reserves.map((pool) =>
      pool.aToken.rewards.map(
        (rew) => `${chain === 'avalanche' ? 'avax' : chain}:${rew.rewardToken}`
      )
    )
  );

  const { pricesByAddress, pricesBySymbol } = await getPrices(
    underlyingTokens.flat().concat(rewardTokens.flat(Infinity))
  );

  const pools = data.map(([chain, markets]) => {
    const chainPools = markets.map((pool) => {
      const totalSupplyUsd =
        (pool.totalLiquidity / 10 ** pool.aToken.underlyingAssetDecimals) *
        (pricesByAddress[pool.aToken.underlyingAssetAddress] ||
          pricesBySymbol[pool.symbol]);
      const tvlUsd =
        ((pool.totalLiquidity - pool.totalCurrentVariableDebt) /
          10 ** pool.aToken.underlyingAssetDecimals) *
        (pricesByAddress[pool.aToken.underlyingAssetAddress] ||
          pricesBySymbol[pool.symbol]);
      const { rewards } = pool.aToken;

      const rewardPerYear = rewards.reduce(
        (acc, rew) =>
          acc +
          (rew.emissionsPerSecond / 10 ** rew.rewardTokenDecimals) *
            SECONDS_PER_YEAR *
            (pricesByAddress[rew.rewardToken] ||
              pricesBySymbol[rew.rewardTokenSymbol]),
        0
      );

      return {
        pool: `${pool.id}-${chain}`,
        chain: utils.formatChain(chain),
        project: 'aave-v3',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (pool.liquidityRate / 10 ** 27) * 100,
        apyReward: (rewardPerYear / totalSupplyUsd) * 100,
        rewardTokens: rewards.map((rew) => rew.rewardToken),
        underlyingTokens: [pool.aToken.underlyingAssetAddress],
      };
    });

    return chainPools;
  });

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: apy,
};
