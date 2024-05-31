const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { comptrollerAbi, ercDelegator, distributorAbi } = require('./abi');

const CHAINS = {
  optimism: {
    COMPTROLLER_ADDRESS: '0x60CF091cD3f50420d50fD7f707414d0DF4751C58',
    REWARD_DISTRIBUTOR: '0x60CF091cD3f50420d50fD7f707414d0DF4751C58',
    SONNE: '0x1db2466d9f5e10d7090e7152b68d62703a2245f0',
  },
  base: {
    COMPTROLLER_ADDRESS: '0x1DB2466d9F5e10D7090E7152B68d62703a2245F0',
    REWARD_DISTRIBUTOR: '0x1DB2466d9F5e10D7090E7152B68d62703a2245F0',
    SONNE: '0x22a2488fE295047Ba13BD8cCCdBC8361DBD8cf7c',
  },
};

const GET_ALL_MARKETS = 'getAllMarkets';
const SUPPLY_RATE = 'supplyRatePerBlock';
const BORROW_RATE = 'borrowRatePerBlock';
const REWARD_SPEEDS = 'compSupplySpeeds';
const BORROW_SPEEDS = 'compBorrowSpeeds';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CHASH = 'getCash';
const UNDERLYING = 'underlying';
const SECONDS_PER_DAY = 86400;
const BLOCKS_PER_DAY = SECONDS_PER_DAY;

const PROJECT_NAME = 'sonne-finance';

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'WETH',
  address: '0x4200000000000000000000000000000000000006'.toLowerCase(),
};

const getRewards = async (markets, isBorrow, chain) => {
  return (
    await sdk.api.abi.multiCall({
      chain,
      calls: markets.map((market) => ({
        target: CHAINS[chain].REWARD_DISTRIBUTOR,
        params: [market],
      })),
      abi: distributorAbi.find(
        ({ name }) => name === (isBorrow ? BORROW_SPEEDS : REWARD_SPEEDS)
      ),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

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
  const blocksPerDay = BLOCKS_PER_DAY;
  const daysPerYear = 365;

  return (
    (Math.pow(ratePerTimestamps * blocksPerDay + 1, daysPerYear) - 1) * 100
  );
};

const multiCallMarkets = async (markets, method, abi, chain) => {
  return (
    await sdk.api.abi.multiCall({
      chain,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const lendingApy = async (chain) => {
  const COMPTROLLER_ADDRESS = CHAINS[chain].COMPTROLLER_ADDRESS;

  const allMarketsRes = (
    await sdk.api.abi.call({
      target: COMPTROLLER_ADDRESS,
      chain,
      abi: comptrollerAbi.find(({ name }) => name === GET_ALL_MARKETS),
      permitFailure: true,
    })
  ).output;

  const allMarkets = Object.values(allMarketsRes);

  if (!allMarkets.length) return [];

  const marketsInfo = (
    await sdk.api.abi.multiCall({
      chain,
      calls: allMarkets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: market,
      })),
      abi: comptrollerAbi.find(({ name }) => name === 'markets'),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const supplyRewards = await multiCallMarkets(
    allMarkets,
    SUPPLY_RATE,
    ercDelegator,
    chain
  );

  const borrowRewards = await multiCallMarkets(
    allMarkets,
    BORROW_RATE,
    ercDelegator,
    chain
  );

  const distributeRewards = await getRewards(allMarkets, false, chain);
  const distributeBorrowRewards = await getRewards(allMarkets, true, chain);

  const marketsCash = await multiCallMarkets(
    allMarkets,
    GET_CHASH,
    ercDelegator,
    chain
  );

  const totalBorrows = await multiCallMarkets(
    allMarkets,
    TOTAL_BORROWS,
    ercDelegator,
    chain
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    UNDERLYING,
    ercDelegator,
    chain
  );

  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    ercDelegator,
    chain
  );

  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    ercDelegator,
    chain
  );

  const SONNE = CHAINS.optimism.SONNE;

  const prices = await getPrices(
    underlyingTokens
      .concat([NATIVE_TOKEN.address])
      .concat([SONNE])
      .map((token) => `${chain}:` + token)
  );

  const pools = allMarkets.map((market, i) => {
    const symbol = underlyingSymbols[i] || NATIVE_TOKEN.symbol;
    const token = symbol === 'BNB' ? NATIVE_TOKEN.address : underlyingTokens[i];

    const decimals = Number(underlyingDecimals[i]) || NATIVE_TOKEN.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd') ? 1 : 0;

    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      price;
    const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;

    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

    const apyBase = calculateApy(supplyRewards[i] / 10 ** 18);
    const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18);

    const apyReward =
      (((distributeRewards[i] / 10 ** 18) *
        SECONDS_PER_DAY *
        365 *
        prices[SONNE]) /
        totalSupplyUsd) *
      100;

    const apyRewardBorrow =
      (((distributeBorrowRewards[i] / 10 ** 18) *
        SECONDS_PER_DAY *
        365 *
        prices[SONNE]) /
        totalBorrowUsd) *
      100;

    return {
      pool: market,
      chain,
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      apyReward,
      underlyingTokens: [token],
      rewardTokens: [apyReward > 0 ? SONNE : null].filter(Boolean),
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow,
      ltv: marketsInfo[i].collateralFactorMantissa / 10 ** 18,
    };
  });

  return pools;
};

const apy = async () => {
  const pools = await Promise.all(
    Object.keys(CHAINS).map((chain) => lendingApy(chain))
  );
  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://sonne.finance/',
};
