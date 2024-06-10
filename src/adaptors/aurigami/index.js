const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const comptrollerAbi = require('./comptrollerAbi');
const ercDelegatorAbi = require('./ercDelegatorAbi');
const auriLensAbi = require('./auriLensAbi');

const UNITROLLER_ADDRESS = '0x817af6cfAF35BdC1A634d6cC94eE9e4c68369Aeb';
const auriLens = '0xFfdFfBDB966Cb84B50e62d70105f2Dbf2e0A1e70';
const CHAIN = 'aurora';
const GET_ALL_MARKETS = 'getAllMarkets';
const REWARD_SPEED = 'rewardSpeeds';
const SUPPLY_RATE = 'supplyRatePerTimestamp';
const BORROW_RATE = 'borrowRatePerTimestamp';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CHASH = 'getCash';
const UNDERLYING = 'underlying';
const SECONDS_PER_DAY = 86400;
const PROJECT_NAME = 'aurigami';

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'WETH',
  address: '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB'.toLowerCase(),
};

const PROTOCOL_TOKEN = {
  decimals: 18,
  symbol: 'COMP',
  address: '0x09C9D464b58d96837f8d8b6f4d9fE4aD408d3A4f'.toLowerCase(),
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
  const blocksPerDay = SECONDS_PER_DAY;
  const daysPerYear = 365;

  return (
    (Math.pow(ratePerTimestamps * blocksPerDay + 1, daysPerYear) - 1) * 100
  );
};

const getRewards = async (markets, rewardMethod) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market, i) => ({
        target: UNITROLLER_ADDRESS,
        params: [i, market, false],
      })),
      abi: comptrollerAbi.find(({ name }) => name === rewardMethod),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const multiCallMarkets = async (markets, method, abi) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const main = async () => {
  const allMarketsRes = (
    await sdk.api.abi.call({
      target: UNITROLLER_ADDRESS,
      chain: CHAIN,
      abi: comptrollerAbi.find(({ name }) => name === GET_ALL_MARKETS),
      permitFailure: true,
    })
  ).output;
  const allMarkets = Object.values(allMarketsRes);

  const markets = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: comptrollerAbi.find((n) => n.name === 'markets'),
      calls: allMarkets.map((m) => ({
        target: UNITROLLER_ADDRESS,
        params: [m],
      })),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const rewardSpeeds = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: allMarkets.map((market, i) => ({
        target: auriLens,
        params: [UNITROLLER_ADDRESS, market],
      })),
      abi: auriLensAbi.find(({ name }) => name === 'getRewardSpeeds'),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const supplyRate = await multiCallMarkets(
    allMarkets,
    SUPPLY_RATE,
    ercDelegatorAbi
  );

  const borrowRate = await multiCallMarkets(
    allMarkets,
    BORROW_RATE,
    ercDelegatorAbi
  );

  const marketsCash = await multiCallMarkets(
    allMarkets,
    GET_CHASH,
    ercDelegatorAbi
  );

  const totalBorrows = await multiCallMarkets(
    allMarkets,
    TOTAL_BORROWS,
    ercDelegatorAbi
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    UNDERLYING,
    ercDelegatorAbi
  );

  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    ercDelegatorAbi
  );
  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    ercDelegatorAbi
  );

  const prices = await getPrices(
    underlyingTokens
      .concat([NATIVE_TOKEN.address])
      .map((token) => `${CHAIN}:` + token)
  );

  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i] || NATIVE_TOKEN.address;
    const symbol = underlyingSymbols[i] || NATIVE_TOKEN.symbol;

    const decimals = Number(underlyingDecimals[i]) || NATIVE_TOKEN.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd') ? 1 : 0;

    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      price;
    const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;

    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

    const apyBase = calculateApy(supplyRate[i] / 10 ** 18);
    const apyBaseBorrow = calculateApy(borrowRate[i] / 10 ** 18);

    const apyReward =
      (((rewardSpeeds[i].plyRewardSupplySpeed / 10 ** PROTOCOL_TOKEN.decimals) *
        SECONDS_PER_DAY *
        365 *
        prices[PROTOCOL_TOKEN.address]) /
        totalSupplyUsd) *
      100;

    const apyRewardBorrow =
      (((rewardSpeeds[i].plyRewardBorrowSpeed / 10 ** PROTOCOL_TOKEN.decimals) *
        SECONDS_PER_DAY *
        365 *
        prices[PROTOCOL_TOKEN.address]) /
        totalBorrowUsd) *
      100;

    return {
      pool: market.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      apyReward,
      underlyingTokens: [token],
      rewardTokens: [apyReward ? PROTOCOL_TOKEN.address : null].filter(Boolean),
      // borrow fields
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow: Number.isFinite(apyRewardBorrow)
        ? apyRewardBorrow
        : null,
      ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.aurigami.finance/',
};
