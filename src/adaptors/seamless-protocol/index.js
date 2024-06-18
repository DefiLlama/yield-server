const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const loopStrategyAbi = require('./loop-strategy-abi.json');

const SECONDS_PER_YEAR = 31536000;
const SECONDS_PER_DAY = 86400;
const USD_DECIMALS = 8;
const ONE_USD = BigInt(10 ** USD_DECIMALS);
const chain = 'base';
const chainUrlParam = {
  base: 'proto_base_v3',
};

// https://docs.seamlessprotocol.com/technical/smart-contracts
const ILMs = [
  {
    address: '0x258730e23cF2f25887Cb962d32Bd10b878ea8a4e',
    compoundingPeriods: 1,
  },
];

const ORACLE_ADDRESS = '0xFDd4e83890BCcd1fbF9b10d71a5cc0a738753b01';

const API_URLS = {
  base: sdk.graph.modifyEndpoint(
    'BnWcGhtmV4gi3VgYvabXCNhiZYMEyUAoWEZ7KEa8CJLW'
  ),
};

const getAssetPriceAbi = {
  type: 'function',
  inputs: [{ name: 'asset', internalType: 'address', type: 'address' }],
  name: 'getAssetPrice',
  outputs: [{ name: '', internalType: 'uint256', type: 'uint256' }],
  stateMutability: 'view',
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

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
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

function formatUnitsToNumber(value, decimals) {
  return Number(ethers.utils.formatUnits(value, decimals));
}

function calculateApy(endValue, startValue, timeWindow, compoundingPeriods) {
  const endValueNumber = formatUnitsToNumber(endValue, 18);
  const startValueNumber = formatUnitsToNumber(startValue, 18);
  const timeWindowNumber = Number(timeWindow);

  const apr =
    (endValueNumber / startValueNumber) **
      (SECONDS_PER_YEAR / timeWindowNumber) -
    1;

  return ((1 + apr / compoundingPeriods) ** compoundingPeriods - 1) * 100;
}

const lendingPoolsApy = async () => {
  let data = await Promise.allSettled(
    Object.entries(API_URLS).map(async ([chain, url]) => [
      chain,
      (await request(url, query)).reserves,
    ])
  );
  data = data.filter((i) => i.status === 'fulfilled').map((i) => i.value);

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

      const now = Math.floor(Date.now() / 1000);

      const rewardPerYear = rewards
        .filter(({ distributionEnd }) => distributionEnd > now)
        .reduce(
          (acc, rew) =>
            acc +
            (Number(rew.emissionsPerSecond) / 10 ** rew.rewardTokenDecimals) *
              SECONDS_PER_YEAR *
              (pricesByAddress[rew.rewardToken] ||
                pricesBySymbol[rew.rewardTokenSymbol] ||
                0),
          0
        );

      const { rewards: rewardsBorrow } = pool.vToken;
      const rewardPerYearBorrow = rewardsBorrow
        .filter(({ distributionEnd }) => distributionEnd > now)
        .reduce(
          (acc, rew) =>
            acc +
            (Number(rew.emissionsPerSecond) / 10 ** rew.rewardTokenDecimals) *
              SECONDS_PER_YEAR *
              (pricesByAddress[rew.rewardToken] ||
                pricesBySymbol[rew.rewardTokenSymbol] ||
                0),
          0
        );
      let totalBorrowUsd = totalSupplyUsd - tvlUsd;
      totalBorrowUsd = totalBorrowUsd < 0 ? 0 : totalBorrowUsd;

      return {
        pool: `${pool.aToken.id}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'seamless-protocol',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (pool.liquidityRate / 10 ** 27) * 100,
        apyReward: !!rewardPerYear
          ? (rewardPerYear / totalSupplyUsd) * 100
          : null,
        rewardTokens: rewards
          .filter(({ distributionEnd }) => distributionEnd > now)
          .map((rew) => rew.rewardToken),
        underlyingTokens: [pool.aToken.underlyingAssetAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.variableBorrowRate) / 1e25,
        apyRewardBorrow: !!rewardPerYearBorrow
          ? (rewardPerYearBorrow / totalBorrowUsd) * 100
          : null,
        ltv: Number(pool.baseLTVasCollateral) / 10000,
        url: `https://legacy.seamlessprotocol.com/reserve-overview/?underlyingAsset=${pool.aToken.underlyingAssetAddress}&marketName=${chainUrlParam[chain]}`,
        borrowable: pool.borrowingEnabled,
      };
    });

    return chainPools;
  });

  return pools.flat().filter((p) => utils.keepFinite(p));
};

const getLpPrices = async (blockNumber, assets, decimals) => {
  const equityUSD = (
    await sdk.api.abi.multiCall({
      chain,
      abi: loopStrategyAbi.find(({ name }) => name === 'equityUSD'),
      calls: ILMs.map(({ address }) => ({ target: address })),
      block: blockNumber,
    })
  ).output.map(({ output }) => output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: loopStrategyAbi.find(({ name }) => name === 'totalSupply'),
      calls: ILMs.map(({ address }) => ({ target: address })),
      block: blockNumber,
    })
  ).output.map(({ output }) => output);

  const debtPrices = (
    await sdk.api.abi.multiCall({
      chain,
      abi: getAssetPriceAbi,
      calls: assets.map((a) => ({
        target: ORACLE_ADDRESS,
        params: a[2],
      })),
      block: blockNumber,
    })
  ).output.map(({ output }) => output);

  return assets.map(
    (a, i) =>
      (BigInt(equityUSD[i]) * BigInt(10 ** decimals[i]) * ONE_USD) /
      (BigInt(totalSupply[i]) * BigInt(debtPrices[i]))
  );
};

const ilmApys = async () => {
  const latestBlock = await sdk.api.util.getLatestBlock(chain);
  const prevBlock1Day = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_PER_DAY,
    { chain }
  );
  const prevBlock7Day = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - 7 * SECONDS_PER_DAY,
    { chain }
  );

  const assets = (
    await sdk.api.abi.multiCall({
      chain,
      abi: loopStrategyAbi.find(({ name }) => name === 'getAssets'),
      calls: ILMs.map(({ address }) => ({ target: address })),
    })
  ).output.map(({ output }) => output);

  const symbols = (
    await sdk.api.abi.multiCall({
      chain,
      abi: loopStrategyAbi.find(({ name }) => name === 'symbol'),
      calls: ILMs.map(({ address }) => ({ target: address })),
    })
  ).output.map(({ output }) => output);

  const decimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: loopStrategyAbi.find(({ name }) => name === 'decimals'),
      calls: ILMs.map(({ address }) => ({ target: address })),
    })
  ).output.map(({ output }) => output);

  const tvlsUSD = (
    await sdk.api.abi.multiCall({
      chain,
      abi: loopStrategyAbi.find(({ name }) => name === 'equityUSD'),
      calls: ILMs.map(({ address }) => ({ target: address })),
    })
  ).output.map(({ output }) => output);

  const latestBlockPrices = await getLpPrices(
    latestBlock.number,
    assets,
    decimals
  );
  const prevBlock1DayPrices = await getLpPrices(
    prevBlock1Day.number,
    assets,
    decimals
  );
  const prevBlock7DayPrices = await getLpPrices(
    prevBlock7Day.number,
    assets,
    decimals
  );

  const pools = ILMs.map(({ address, compoundingPeriods }, i) => {
    return {
      pool: `${address}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'seamless-protocol',
      symbol: symbols[i],
      tvlUsd: Number(ethers.utils.formatUnits(tvlsUSD[i], USD_DECIMALS)),
      apyBase: calculateApy(
        latestBlockPrices[i],
        prevBlock1DayPrices[i],
        latestBlock.timestamp - prevBlock1Day.timestamp,
        compoundingPeriods
      ),
      apyBase7d: calculateApy(
        latestBlockPrices[i],
        prevBlock7DayPrices[i],
        latestBlock.timestamp - prevBlock7Day.timestamp,
        compoundingPeriods
      ),
      underlyingTokens: [assets[i].underlying || assets[i].collateral],
    };
  });

  return pools;
};

const apy = async () => {
  const apys = await Promise.all([lendingPoolsApy(), ilmApys()]);

  console.log('apys: ', apys);

  return apys.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.seamlessprotocol.com',
};
