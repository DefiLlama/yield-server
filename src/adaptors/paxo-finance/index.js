const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { comptrollerAbi, ercDelegator } = require('./abi');

const COMPTROLLER_ADDRESS = '0x1eDf64B621F17dc45c82a65E1312E8df988A94D3';
const CHAIN = 'polygon';
const GET_ALL_MARKETS = 'getAllMarkets';
const SUPPLY_RATE = 'supplyRatePerBlock';
const BORROW_RATE = 'borrowRatePerBlock';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CASH = 'getCash';
const UNDERLYING = 'underlying';
const BLOCKS_PER_DAY = 7200;
const PROJECT_NAME = 'paxo-finance';

const NATIVE_TOKEN = {
  decimals: 18,
  symbol: 'WMATIC',
  address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'.toLowerCase(),
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
        params: [market],
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

  const isPaused = await getRewards(allMarkets, "mintGuardianPaused");

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
    GET_CASH,
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

    const apyBase = calculateApy(supplyRewards[i] / 10 ** 18);
    const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18);

    const apyReward = 0;

    let poolReturned = {
      pool: market.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      apyReward,
      underlyingTokens: [token],
      rewardTokens: [apyReward ? PROTOCOL_TOKEN.address : null].filter(Boolean),
    };
    if(isPaused[i] === false){
      poolReturned = {
        ...poolReturned,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        // apyRewardBorrow,
        ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
      }
    }
    return poolReturned
  });

  return pools.filter(
    (p) => p.totalBorrowUsd !== 0
  );
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.app.paxo.finance/',
};
