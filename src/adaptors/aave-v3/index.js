const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('./abi');

const SECONDS_PER_YEAR = 31536000;

const chainUrlParam = {
  ethereum: 'proto_mainnet_v3',
  polygon: 'proto_polygon_v3',
  avalanche: 'proto_avalanche_v3',
  arbitrum: 'proto_arbitrum_v3',
  fantom: 'proto_fantom_v3',
  harmony: 'proto_harmony_v3',
  optimism: 'proto_optimism_v3',
};

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
      name
      aToken {
        id
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
      vToken {
        rewards {
          emissionsPerSecond
          rewardToken
          rewardTokenDecimals
          rewardTokenSymbol
        }
      }
      symbol
      liquidityRate
      variableBorrowRate
      baseLTVasCollateral
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
  const totalSupply = await Promise.all(
    data.map(async ([chain, reserves]) =>
      (
        await sdk.api.abi.multiCall({
          chain: chain === 'avalanche' ? 'avax' : chain,
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
          chain: chain === 'avalanche' ? 'avax' : chain,
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
      return {
        pool: `${pool.aToken.id}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'aave-v3',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (pool.liquidityRate / 10 ** 27) * 100,
        apyReward: (rewardPerYear / totalSupplyUsd) * 100,
        rewardTokens: rewards.map((rew) => rew.rewardToken),
        underlyingTokens: [pool.aToken.underlyingAssetAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.variableBorrowRate) / 1e25,
        apyRewardBorrow: (rewardPerYearBorrow / totalBorrowUsd) * 100,
        ltv: Number(pool.baseLTVasCollateral) / 10000,
        url: `https://app.aave.com/reserve-overview/?underlyingAsset=${pool.aToken.underlyingAssetAddress}&marketName=${chainUrlParam[chain]}`,
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
