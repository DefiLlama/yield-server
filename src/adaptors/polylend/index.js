const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');

const SECONDS_PER_YEAR = 31536000;

const chainUrlParam = {
  polygon_zkevm: 'proto_main',
};

const oraclePriceABI = {
  inputs: [],
  name: 'latestAnswer',
  outputs: [
    {
      internalType: 'int256',
      name: '',
      type: 'int256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getPrices = async (addresses) => {
  const _prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const plendOraclePrice = (
    await sdk.api.abi.call({
      target: '0x63a02a94eb32fd42c938734f12ee41ae24b901c1',
      abi: oraclePriceABI,
      chain: 'polygon_zkevm',
    })
  ).output;

  const plend = {
    'polygon_zkevm:0xe061cf2aa271f9fdca9e61eaee372e76fea3a5d0': {
      decimals: 18,
      symbol: 'PLEND',
      price: Number(plendOraclePrice) / 1e8,
      timestamp: Date.now(),
      confidence: 0.99,
    },
  };

  const prices = { ..._prices, ...plend };

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
  polygon_zkevm:
    'https://api.studio.thegraph.com/query/52108/polylend/version/latest',
};

const query = gql`
  query ReservesQuery {
    reserves(where: { name_not: "" }) {
      name
      borrowingEnabled
      aToken {
        id
        rewards(where: { distributionEnd_gt: 0 }) {
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
        rewards(where: { distributionEnd_gt: 0 }) {
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
        chain: utils.formatChain('polygon_zkevm'),
        project: 'polylend',
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
        url: `https://polylend.xyz/reserve-overview/?underlyingAsset=${pool.aToken.underlyingAssetAddress}&marketName=${chainUrlParam[chain]}&utm_source=defillama&utm_medium=listing&utm_campaign=external`,
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
