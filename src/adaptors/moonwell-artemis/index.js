const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { comptrollerAbi, ercDelegator } = require('../moonwell-artemis/abi');

const COMPTROLLER_ADDRESS = '0x8E00D5e02E65A19337Cdba98bbA9F84d4186a180';
const CHAIN = 'moonbeam';
const GET_ALL_MARKETS = 'getAllMarkets';
const REWARD_SPEED = 'supplyRewardSpeeds';
const REWARD_SPEED_BORROW = 'borrowRewardSpeeds';
const SUPPLY_RATE = 'supplyRatePerTimestamp';
const BORROW_RATE = 'borrowRatePerTimestamp';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CHASH = 'getCash';
const UNDERLYING = 'underlying';
const BLOCKS_PER_DAY = 86400 / 12;
const PROJECT_NAME = 'moonwell-artemis';

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'WGLMR',
  address: '0xAcc15dC74880C9944775448304B263D191c6077F'.toLowerCase(),
};

const PROTOCOL_TOKEN = {
  decimals: 18,
  symbol: 'WELL',
  address: '0x511ab53f793683763e5a8829738301368a2411e3'.toLowerCase(),
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
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

const getRewards = async (markets, rewardMethod) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({
        target: COMPTROLLER_ADDRESS,
        params: [1, market],
      })),
      abi: comptrollerAbi.find(({ name }) => name === rewardMethod),
    })
  ).output.map(({ output }) => output);
};

const multiCallMarkets = async (markets, method, abi) => {
  return (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
    })
  ).output.map(({ output }) => output);
};

const main = async () => {
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

  const extraRewards = await getRewards(allMarkets, REWARD_SPEED);
  const extraRewardsBorrow = await getRewards(allMarkets, REWARD_SPEED_BORROW);
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
      .concat([NATIVE_TOKEN.address])
      .concat([PROTOCOL_TOKEN.address])
      .map((token) => `${CHAIN}:` + token)
  );

  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i] || NATIVE_TOKEN.address;
    const symbol =
      // for maker
      underlyingTokens[i]?.toLowerCase() ===
      '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'
        ? 'MKR'
        : underlyingSymbols[i] || NATIVE_TOKEN.symbol;

    const decimals = Number(underlyingDecimals[i]) || NATIVE_TOKEN.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('frax') ? 1 : 0;

    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      price;
    const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;

    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;

    const apyBase = calculateApy(supplyRewards[i] / 10 ** 18);
    const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18);

    const calcRewardApy = (rewards, denom) => {
      return (
        (((rewards[i] / 10 ** PROTOCOL_TOKEN.decimals) *
          BLOCKS_PER_DAY *
          365 *
          prices[PROTOCOL_TOKEN.address]) /
          denom) *
        100
      );
    };
    const calcRewardApyBorrow = (rewards, denom) => {
      return (
        ((rewards[i] * BLOCKS_PER_DAY * 365 * prices[PROTOCOL_TOKEN.address]) /
          denom) *
        100
      );
    };
    const apyReward = calcRewardApy(extraRewards, totalSupplyUsd);
    const apyRewardBorrow = calcRewardApyBorrow(
      extraRewardsBorrow,
      totalBorrowUsd
    );

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
      apyRewardBorrow,
      ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
    };
  });

  return pools.filter(
    (p) =>
      ![
        '0xc3090f41eb54a7f18587fd6651d4d3ab477b07a4',
        '0x02e9081dfadd37a852f9a73c4d7d69e615e61334',
        '0x24a9d8f1f350d59cb0368d3d52a77db29c833d1d',
      ].includes(p.pool)
  );
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://moonwell.fi/artemis',
};
