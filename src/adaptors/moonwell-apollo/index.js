const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { comptrollerAbi, ercDelegator } = require('./abi');

const COMPTROLLER_ADDRESS = '0x0b7a0EAA884849c6Af7a129e899536dDDcA4905E';
const CHAIN = 'moonriver';
const PRICING_CHAIN = 'moonriver:';
const GET_ALL_MARKETS = 'getAllMarkets';
const REWARD_SPEED = 'supplyRewardSpeeds';
const REWARD_SPEED_BORROW = 'borrowRewardSpeeds';
const SUPPLY_RATE = 'supplyRatePerTimestamp';
const BORROW_RATE = 'borrowRatePerTimestamp';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CHASH = 'getCash';
const UNDERLYING = 'underlying';
const BLOCKS_PER_DAY = 86400;
const PROJECT_NAME = 'moonwell-apollo';

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'MOVR',
  address: '0x98878b06940ae243284ca214f92bb71a2b032b8a'.toLowerCase(),
};

const PROTOCOL_TOKEN = {
  decimals: 18,
  symbol: 'MFAM',
  address: '0xBb8d88bcD9749636BC4D2bE22aaC4Bb3B01A58F1'.toLowerCase(),
};

const ETH_TOKENS = {
  WETH: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  FRAX: '0x853d955acef822db058eb8505911ed77f175b99e',
  WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
};

const ETH_TOKENS_LIST = Object.values(ETH_TOKENS).map(
  (token) => `ethereum:${token}`
);

const REWARD_TYPES = {
  PROTOCOL_TOKEN: 0,
  NATIVE_TOKEN: 1,
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

const getRewards = async (markets, rewardType, rewardSpeedMethod) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: [rewardType, market],
      })),
      abi: comptrollerAbi.find(({ name }) => name === rewardSpeedMethod),
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

const getApy = async () => {
  const allMarketsRes = (
    await sdk.api.abi.call({
      target: COMPTROLLER_ADDRESS,
      chain: CHAIN,
      abi: comptrollerAbi.find(({ name }) => name === GET_ALL_MARKETS),
    })
  ).output;

  const allMarkets = Object.values(allMarketsRes);

  const markets = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: comptrollerAbi.find((n) => n.name === 'markets'),
      calls: allMarkets.map((m) => ({
        target: COMPTROLLER_ADDRESS,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  // supply side
  const protocolRewards = await getRewards(
    allMarkets,
    REWARD_TYPES.PROTOCOL_TOKEN,
    REWARD_SPEED
  );
  const nativeRewards = await getRewards(
    allMarkets,
    REWARD_TYPES.NATIVE_TOKEN,
    REWARD_SPEED
  );

  // borrow side
  const protocolRewardsBorrow = await getRewards(
    allMarkets,
    REWARD_TYPES.PROTOCOL_TOKEN,
    REWARD_SPEED_BORROW
  );
  const nativeRewardsBorrow = await getRewards(
    allMarkets,
    REWARD_TYPES.NATIVE_TOKEN,
    REWARD_SPEED_BORROW
  );

  const supplyRewards = await multiCallMarkets(
    allMarkets,
    SUPPLY_RATE,
    ercDelegator
  );

  const borrowRewards = await multiCallMarkets(
    allMarkets,
    BORROW_RATE,
    ercDelegator
  );

  const marketsCash = await multiCallMarkets(
    allMarkets,
    GET_CHASH,
    ercDelegator
  );
  const totalBorrows = await multiCallMarkets(
    allMarkets,
    TOTAL_BORROWS,
    ercDelegator
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    UNDERLYING,
    ercDelegator
  );
  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    ercDelegator
  );
  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    ercDelegator
  );

  const prices = await getPrices(
    underlyingTokens
      .concat([PROTOCOL_TOKEN.address, NATIVE_TOKEN.address])
      .map((token) => `${CHAIN}:` + token)
      .concat(ETH_TOKENS_LIST)
  );

  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i] || NATIVE_TOKEN.address;
    const symbol = underlyingSymbols[i] || NATIVE_TOKEN.symbol;

    const decimals = Number(underlyingDecimals[i]) || NATIVE_TOKEN.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd')
        ? 1
        : prices[ETH_TOKENS[symbol]];

    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      price;
    const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;

    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

    const apyBase = calculateApy(supplyRewards[i] / 10 ** 18);
    const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18);

    const apyReward =
      (((protocolRewards[i] / 10 ** PROTOCOL_TOKEN.decimals) *
        BLOCKS_PER_DAY *
        365 *
        prices[PROTOCOL_TOKEN.address]) /
        totalSupplyUsd) *
      100;

    const apyNativeReward =
      (((nativeRewards[i] / 10 ** NATIVE_TOKEN.decimals) *
        BLOCKS_PER_DAY *
        365 *
        prices[NATIVE_TOKEN.address]) /
        totalSupplyUsd) *
      100;

    const apyRewardBorrow =
      (((protocolRewardsBorrow[i] / 10 ** PROTOCOL_TOKEN.decimals) *
        BLOCKS_PER_DAY *
        365 *
        prices[PROTOCOL_TOKEN.address]) /
        totalBorrowUsd) *
      100;

    const apyNativeRewardBorrow =
      (((nativeRewardsBorrow[i] / 10 ** NATIVE_TOKEN.decimals) *
        BLOCKS_PER_DAY *
        365 *
        prices[NATIVE_TOKEN.address]) /
        totalBorrowUsd) *
      100;

    return {
      pool: market,
      chain: utils.formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      apyReward: apyReward + apyNativeReward,
      underlyingTokens: [token],
      rewardTokens: [
        apyReward ? PROTOCOL_TOKEN.address : null,
        apyNativeReward ? NATIVE_TOKEN.address : null,
      ].filter(Boolean),
      // borrow fields
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow: apyRewardBorrow + apyNativeRewardBorrow,
      ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
    };
  });

  return pools.filter(({ tvlUsd }) => !!tvlUsd);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://moonwell.fi/apollo/MOVR',
};
