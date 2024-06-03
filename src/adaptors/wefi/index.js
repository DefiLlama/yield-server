const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { comptrollerAbi, ercDelegator } = require('./abi');

const GET_ALL_MARKETS = 'getAllMarkets';
const REWARD_SPEED = 'compSupplySpeeds';
const REWARD_SPEED_BORROW = 'compBorrowSpeeds';
const SUPPLY_RATE = 'supplyRatePerBlock';
const BORROW_RATE = 'borrowRatePerBlock';
const TOTAL_BORROWS = 'totalBorrows';
const GET_CASH = 'getCash';
const UNDERLYING = 'underlying';
const PROJECT_NAME = 'wefi';

const markets = [
  {
    chain: 'xdc',
    comptrollerAddress: '0x301C76e7b60e9824E32991B8F29e1c4a03B4F65b',
    blocksPerDay: 43200,
    nativeToken: {
      decimals: 18,
      symbol: 'WXDC',
      address: '0x557016277F50f4964569fd6d69813D4C7078D727'.toLowerCase(),
    },
    protocolToken: {
      decimals: 18,
      symbol: 'XDC',
      address: '0x49d3f7543335cf38Fa10889CCFF10207e22110B5'.toLowerCase(),
    },
  },
  {
    chain: 'linea',
    comptrollerAddress: '0x301C76e7b60e9824E32991B8F29e1c4a03B4F65b',
    blocksPerDay: 14400,
    nativeToken: {
      decimals: 18,
      symbol: 'WETH',
      address: '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f'.toLowerCase(),
    },
    protocolToken: {
      decimals: 18,
      symbol: 'WEFI',
      address: '0x60892e742d91d16Be2cB0ffE847e85445989e30B'.toLowerCase(),
    },
  },
  {
    chain: 'polygon',
    comptrollerAddress: '0x1eDf64B621F17dc45c82a65E1312E8df988A94D3',
    blocksPerDay: 37565,
    nativeToken: {
      decimals: 18,
      symbol: 'WMATIC',
      address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'.toLowerCase(),
    },
    protocolToken: {
      decimals: 18,
      symbol: 'WEFI',
      address: '0xfFA188493C15DfAf2C206c97D8633377847b6a52'.toLowerCase(),
    },
  },
];

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

const calculateApy = (ratePerTimestamps, pool) => {
  const blocksPerDay = pool.blocksPerDay;
  const daysPerYear = 365;

  return (
    (Math.pow(ratePerTimestamps * blocksPerDay + 1, daysPerYear) - 1) * 100
  );
};

const getRewards = async (markets, rewardMethod, pool) => {
  return (
    await sdk.api.abi.multiCall({
      chain: pool.chain,
      calls: markets.map((market) => ({
        target: pool.comptrollerAddress,
        params: [market],
      })),
      abi: comptrollerAbi.find(({ name }) => name === rewardMethod),
    })
  ).output.map(({ output }) => output);
};

const multiCallMarkets = async (markets, method, abi, pool) => {
  return (
    await sdk.api.abi.multiCall({
      chain: pool.chain,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
    })
  ).output.map(({ output }) => output);
};

const main = async (pool) => {
  const allMarketsRes = (
    await sdk.api.abi.call({
      target: pool.comptrollerAddress,
      chain: pool.chain,
      abi: comptrollerAbi.find(({ name }) => name === GET_ALL_MARKETS),
    })
  ).output;
  const allMarkets = Object.values(allMarketsRes);

  const markets = (
    await sdk.api.abi.multiCall({
      chain: pool.chain,
      abi: comptrollerAbi.find((n) => n.name === 'markets'),
      calls: allMarkets.map((m) => ({
        target: pool.comptrollerAddress,
        params: [m],
      })),
    })
  ).output.map((o) => o.output);

  const rewardSpeed = await getRewards(allMarkets, REWARD_SPEED, pool);
  const rewardSpeedBorrow = await getRewards(
    allMarkets,
    REWARD_SPEED_BORROW,
    pool
  );
  const isPaused = await getRewards(allMarkets, 'mintGuardianPaused', pool);
  const supplyRewards = await multiCallMarkets(
    allMarkets,
    SUPPLY_RATE,
    ercDelegator,
    pool
  );

  const borrowRewards = await multiCallMarkets(
    allMarkets,
    BORROW_RATE,
    ercDelegator,
    pool
  );

  const marketsCash = await multiCallMarkets(
    allMarkets,
    GET_CASH,
    ercDelegator,
    pool
  );
  const totalBorrows = await multiCallMarkets(
    allMarkets,
    TOTAL_BORROWS,
    ercDelegator,
    pool
  );

  const underlyingTokens = await multiCallMarkets(
    allMarkets,
    UNDERLYING,
    ercDelegator,
    pool
  );

  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    ercDelegator,
    pool
  );

  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    ercDelegator,
    pool
  );

  const prices = await getPrices(
    underlyingTokens
      .concat([pool.nativeToken.address])
      .map((token) => `${pool.chain}:` + token)
  );

  if (pool.chain === 'linea') {
    const wefiPrice = await getPrices([
      'polygon:0xfFA188493C15DfAf2C206c97D8633377847b6a52',
    ]);
    prices['0x60892e742d91d16be2cb0ffe847e85445989e30b'] =
      wefiPrice['0xffa188493c15dfaf2c206c97d8633377847b6a52'];
  }
  const pools = allMarkets.map((market, i) => {
    const token = underlyingTokens[i] || pool.nativeToken.address;
    const symbol = underlyingSymbols[i] || pool.nativeToken.symbol;

    const decimals = Number(underlyingDecimals[i]) || pool.nativeToken.decimals;
    let price = prices[token.toLowerCase()];
    if (price === undefined)
      price = symbol.toLowerCase().includes('usd') ? 1 : 0;
    const totalSupplyUsd =
      ((Number(marketsCash[i]) + Number(totalBorrows[i])) / 10 ** decimals) *
      price;
    const tvlUsd = (marketsCash[i] / 10 ** decimals) * price;
    const totalBorrowUsd = (Number(totalBorrows[i]) / 10 ** decimals) * price;
    const apyBase = calculateApy(supplyRewards[i] / 10 ** 18, pool);
    const apyBaseBorrow = calculateApy(borrowRewards[i] / 10 ** 18, pool);

    const calcRewardApy = (rewards, denom, pool) => {
      if (denom === 0) return 0;
      return (
        (((rewards[i] / 10 ** pool.protocolToken.decimals) *
          pool.blocksPerDay *
          365 *
          prices[pool.protocolToken.address]) /
          denom) *
        100
      );
    };

    const apyReward = calcRewardApy(rewardSpeed, totalSupplyUsd, pool);
    const apyRewardBorrow = calcRewardApy(
      rewardSpeedBorrow,
      totalBorrowUsd,
      pool
    );

    let poolReturned = {
      pool: `${market.toLowerCase()}-${pool.chain}`,
      chain: utils.formatChain(pool.chain),
      project: PROJECT_NAME,
      symbol,
      tvlUsd,
      apyBase,
      apyReward: pool.chain === 'polygon' ? 0 : apyReward,
      underlyingTokens: [token],
      rewardTokens:
        pool.chain !== 'polygon'
          ? [apyReward ? pool.protocolToken.address : null].filter(Boolean)
          : [],
    };
    if (isPaused[i] === false) {
      poolReturned = {
        ...poolReturned,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        apyRewardBorrow: pool.chain === 'polygon' ? 0 : apyRewardBorrow,
        ltv: Number(markets[i].collateralFactorMantissa) / 1e18,
      };
    }
    return poolReturned;
  });

  return pools.filter((p) => p.totalBorrowUsd !== 0 || p.apyReward !== 0);
};

const apy = async () => {
  const pools = (await Promise.all(markets.map((p) => main(p)))).flat();
  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.beta.app.wefi.xyz/',
};
