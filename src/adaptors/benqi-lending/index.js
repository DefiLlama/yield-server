const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const { Web3 } = require('web3');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const { comptrollerAbi, qiAvax, qiErc } = require('./abi');

const COMPTROLLER_ADDRESS = '0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4';

const AVAX = {
  decimals: 18,
  symbol: 'AVAX',
  address: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
};

const QI = {
  decimals: 18,
  symbol: 'QI',
  address: '0x8729438eb15e2c8b576fcc6aecda6a148776c0f5',
};

const REWARD_TYPES = {
  QI: 0,
  AVAX: 1,
};

const SECONDS_PER_DAY = 86400;

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return pricesByAddress;
};

const calculateApy = (ratePerTimestamps) => {
  const secondsPerDay = 86400; // seconds per day
  const daysPerYear = 365;

  return (
    (Math.pow((ratePerTimestamps / 1e18) * secondsPerDay + 1, daysPerYear) -
      1) *
    100
  );
};

const getRewards = async (rewardType, markets, isBorrow = false) => {
  return (
    await sdk.api.abi.multiCall({
      chain: 'avax',
      calls: markets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: [rewardType, market],
      })),
      abi: comptrollerAbi.find(
        ({ name }) => name === `${isBorrow ? 'borrow' : 'supply'}RewardSpeeds`
      ),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const multiCallMarkets = async (markets, method, abi) => {
  return (
    await sdk.api.abi.multiCall({
      chain: 'avax',
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const getApy = async () => {
  const allMarketsRes = (
    await sdk.api.abi.call({
      target: COMPTROLLER_ADDRESS,
      chain: 'avax',
      abi: comptrollerAbi.find(({ name }) => name === 'getAllMarkets'),
      permitFailure: true,
    })
  ).output;

  const allMarkets = Object.values(allMarketsRes);

  const marketsInfo = (
    await sdk.api.abi.multiCall({
      chain: 'avax',
      calls: allMarkets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: market,
      })),
      abi: comptrollerAbi.find(({ name }) => name === 'markets'),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const qiRewards = await getRewards(REWARD_TYPES.QI, allMarkets);
  const avaxRewards = await getRewards(REWARD_TYPES.AVAX, allMarkets);

  const qiBorrowRewards = await getRewards(REWARD_TYPES.QI, allMarkets, true);
  const avaxBorrowRewards = await getRewards(
    REWARD_TYPES.AVAX,
    allMarkets,
    true
  );
  const supplyRatePerTimestamp = await multiCallMarkets(
    allMarkets,
    'supplyRatePerTimestamp',
    qiErc
  );

  const borrowRatePerTimestamp = await multiCallMarkets(
    allMarkets,
    'borrowRatePerTimestamp',
    qiErc
  );

  const marketsCash = await multiCallMarkets(allMarkets, 'getCash', qiErc);
  const totalBorrows = await multiCallMarkets(
    allMarkets,
    'totalBorrows',
    qiErc
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    'underlying',
    qiErc
  );
  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    qiErc
  );
  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    qiErc
  );

  const prices = await getPrices(
    underlyingTokens.concat([AVAX.address]).map((token) => 'avax:' + token)
  );

  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i] || AVAX.address;
    const decimals = Number(underlyingDecimals[i]) || AVAX.decimals;
    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      prices[token.toLowerCase()];

    const totalBorrowUsd =
      (Number(totalBorrows[i]) / 10 ** decimals) * prices[token.toLowerCase()];
    const tvlUsd =
      (marketsCash[i] / 10 ** decimals) * prices[token.toLowerCase()];

    const apyBase = calculateApy(supplyRatePerTimestamp[i]);
    const apyBaseBorrow = calculateApy(borrowRatePerTimestamp[i]);

    const qiApy =
      (((qiRewards[i] / 10 ** QI.decimals) *
        SECONDS_PER_DAY *
        365 *
        prices[QI.address]) /
        totalSupplyUsd) *
      100;
    const avaxApy =
      (((avaxRewards[i] / 10 ** AVAX.decimals) *
        SECONDS_PER_DAY *
        365 *
        prices[AVAX.address]) /
        totalSupplyUsd) *
      100;

    const qiBorrowApy =
      (((qiBorrowRewards[i] / 10 ** QI.decimals) *
        SECONDS_PER_DAY *
        365 *
        prices[QI.address]) /
        totalBorrowUsd) *
      100;
    const avaxBorrowApy =
      (((avaxBorrowRewards[i] / 10 ** AVAX.decimals) *
        SECONDS_PER_DAY *
        365 *
        prices[AVAX.address]) /
        totalBorrowUsd) *
      100;

    const apyRewardBorrow = qiBorrowApy + avaxBorrowApy;

    return {
      pool: market,
      chain: utils.formatChain('avalanche'),
      project: 'benqi-lending',
      symbol: underlyingSymbols[i] || AVAX.symbol,
      tvlUsd,
      apyBase,
      apyReward: qiApy + avaxApy,
      underlyingTokens: [token],
      rewardTokens: [
        qiApy ? QI.address : null,
        avaxApy ? AVAX.address : null,
      ].filter(Boolean),
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow: Number.isFinite(apyRewardBorrow) ? apyRewardBorrow : 0,
      ltv: marketsInfo[i].collateralFactorMantissa / 10 ** 18,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.benqi.fi/markets',
};
