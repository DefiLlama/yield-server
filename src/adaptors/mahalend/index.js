const axios = require('axios');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');

const SECONDS_PER_YEAR = 31536000;

const chainUrlParam = {
  arbitrum: 'proto_arbitrum_v3',
};

const getPrices = async (addresses) => {
  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).data.coins;

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
  arbitrum: sdk.graph.modifyEndpoint(
    'FPS9fdGYvwyCkFzUqmF5YYYqNKT88K5V5fjnmTNPjd9t'
  ),
};

const query = gql`
  query ReservesQuery {
    reserves {
      name
      borrowingEnabled
      aToken {
        id
        rewards {
          id
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
          distributionEnd
        }
        underlyingAssetAddress
        underlyingAssetDecimals
      }
      vToken {
        rewards {
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
          distributionEnd
        }
      }
      symbol
      liquidityRate
      variableBorrowRate
      baseLTVasCollateral
      isFrozen
    }
  }
`;

const apy = async () => {
  let data = await Promise.all(
    Object.entries(API_URLS).map(async ([chain, url]) => [
      chain,
      (await request(url, query)).reserves,
    ])
  );
  data = data.map(([chain, reserves]) => [
    chain,
    reserves.filter((p) => !p.isFrozen),
  ]);

  const totalSupply = await Promise.all(
    data.map(async ([chain, reserves]) =>
      (
        await sdk.api.abi.multiCall({
          chain: chain,
          abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
          calls: reserves.map((reserve) => ({
            target: reserve.aToken.id,
          })),
        })
      ).output.map(({ output }) => output)
    )
  );

  const underlyingBalances = await Promise.all(
    data.map(async ([chain, reserves]) =>
      (
        await sdk.api.abi.multiCall({
          chain: chain,
          abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
          calls: reserves.map((reserve, i) => ({
            target: reserve.aToken.underlyingAssetAddress,
            params: [reserve.aToken.id],
          })),
        })
      ).output.map(({ output }) => output)
    )
  );

  const underlyingTokens = data.map(([chain, reserves]) =>
    reserves.map((pool) => `${chain}:${pool.aToken.underlyingAssetAddress}`)
  );

  const rewardTokens = data.map(([chain, reserves]) =>
    reserves.map((pool) =>
      pool.aToken.rewards.map((rew) => `${chain}:${rew.rewardToken}`)
    )
  );

  const { pricesByAddress, pricesBySymbol } = await getPrices(
    underlyingTokens.flat().concat(rewardTokens.flat(Infinity))
  );

  const pools = data.map(([chain, markets], i) => {
    const chainPools = markets.map((pool, idx) => {
      const supply = totalSupply[i][idx];
      const currentSupply = underlyingBalances[i][idx];
      const totalSupplyUsd =
        (supply / 10 ** pool.aToken.underlyingAssetDecimals) *
        (pricesByAddress[pool.aToken.underlyingAssetAddress] ||
          pricesBySymbol[pool.symbol]);
      const tvlUsd =
        (currentSupply / 10 ** pool.aToken.underlyingAssetDecimals) *
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

      const { rewards: rewardsBorrow } = pool.vToken;
      const rewardPerYearBorrow = rewardsBorrow.reduce(
        (acc, rew) =>
          acc +
          (rew.emissionsPerSecond / 10 ** rew.rewardTokenDecimals) *
            SECONDS_PER_YEAR *
            (pricesByAddress[rew.rewardToken] ||
              pricesBySymbol[rew.rewardTokenSymbol]),
        0
      );
      let totalBorrowUsd = totalSupplyUsd - tvlUsd;
      totalBorrowUsd = totalBorrowUsd < 0 ? 0 : totalBorrowUsd;

      const supplyRewardEnd = pool.aToken.rewards[0]?.distributionEnd;
      const borrowRewardEnd = pool.vToken.rewards[0]?.distributionEnd;

      return {
        pool: `${pool.aToken.id}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'mahalend',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (pool.liquidityRate / 10 ** 27) * 100,
        apyReward:
          supplyRewardEnd * 1000 > new Date()
            ? (rewardPerYear / totalSupplyUsd) * 100
            : null,
        rewardTokens:
          supplyRewardEnd * 1000 > new Date()
            ? rewards.map((rew) => rew.rewardToken)
            : null,
        underlyingTokens: [pool.aToken.underlyingAssetAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.variableBorrowRate) / 1e25,
        apyRewardBorrow:
          borrowRewardEnd * 1000 > new Date()
            ? (rewardPerYearBorrow / totalBorrowUsd) * 100
            : null,
        ltv: Number(pool.baseLTVasCollateral) / 10000,
        url: `https://app.mahalend.com/reserve-overview/?underlyingAsset=${pool.aToken.underlyingAssetAddress}&marketName=${chainUrlParam[chain]}&utm_source=defillama&utm_medium=listing&utm_campaign=external`,
        borrowable: pool.borrowingEnabled,
      };
    });

    return chainPools;
  });
  return pools.flat().filter((p) => !!p.tvlUsd);
};

module.exports = {
  timetravel: false,
  apy: apy,
};
